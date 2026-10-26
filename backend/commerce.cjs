'use strict';
const crypto=require('node:crypto'),op=require('./operations.cjs');
function restoreStock(db,order){if(order.stockRestored)return;for(const item of order.items)db.prepare('UPDATE products SET stock=stock+?,revision=revision+1 WHERE id=?').run(item.qty,item.id);order.stockRestored=true;}
function sweepExpired(db){
 const rows=db.prepare('SELECT id,data FROM orders').all().filter(r=>{const o=JSON.parse(r.data);return o.paymentStatus==='unpaid'&&o.expiresAt&&Date.parse(o.expiresAt)<=Date.now();});
 if(!rows.length)return;
 op.transaction(db,()=>{for(const entry of rows){const order=JSON.parse(db.prepare('SELECT data FROM orders WHERE id=?').get(entry.id).data);if(order.paymentStatus!=='unpaid'||Date.parse(order.expiresAt)>Date.now())continue;const before=structuredClone(order);restoreStock(db,order);Object.assign(order,{status:'Kedaluwarsa',paymentStatus:'expired',revision:(order.revision||0)+1});db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(order),order.id);op.audit(db,'system','expire','order',order.id,before,order);}});
}
function cancelOrder(db,auth,body){return op.transaction(db,()=>{
 const row=db.prepare('SELECT data FROM orders WHERE id=? AND user_id=?').get(op.id(body.id),auth.id);if(!row)op.fail(404,'Pesanan tidak ditemukan.');const order=JSON.parse(row.data);if(order.status==='Dibatalkan')return{order};if(order.paymentStatus!=='unpaid')op.fail(409,'Pesanan ini tidak dapat dibatalkan.');const before=structuredClone(order);restoreStock(db,order);Object.assign(order,{status:'Dibatalkan',paymentStatus:'cancelled',revision:(order.revision||0)+1});db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(order),order.id);op.audit(db,auth.id,'cancel','order',order.id,before,order);return{order};
 });}
function commerce(db,auth,route,method,body){
 sweepExpired(db);
 if(route==='catalog'&&method==='GET')return{...op.settings(db),paymentsEnabled:false,paymentMode:'manual',products:op.products(db)};
 if(route==='orders'&&method==='GET')return{orders:db.prepare('SELECT data FROM orders WHERE user_id=? ORDER BY rowid DESC').all(auth.id).map(o=>JSON.parse(o.data))};
 if(route==='orders/cancel'&&method==='POST')return cancelOrder(db,auth,body);
 if(route!=='orders'||method!=='POST')return;
 op.id(body.requestId);
 if(!Array.isArray(body.items)||!body.items.length||body.items.length>100)op.fail(400,'Keranjang tidak valid.');
 for(const key of ['recipient','address','phone'])op.text(body[key],key==='address'?500:100);
 const quantities=new Map();for(const item of body.items){if(!item||typeof item.id!=='string'||!Number.isInteger(item.qty)||item.qty<1||item.qty>999)op.fail(400,'Jumlah produk tidak valid.');quantities.set(item.id,(quantities.get(item.id)||0)+item.qty);}
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({items:[...quantities.entries()].sort(),recipient:body.recipient.trim(),address:body.address.trim(),phone:body.phone.trim()})).digest('hex');
 const prior=db.prepare('SELECT data FROM orders WHERE user_id=? AND request_id=?').get(auth.id,body.requestId);if(prior){const order=JSON.parse(prior.data);if(order.requestFingerprint&&order.requestFingerprint!==fingerprint)op.fail(409,'Request ID sudah digunakan untuk pesanan lain.');return{order};}
 return op.transaction(db,()=>{
  const items=[];for(const [id,qty]of quantities){const p=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(id);if(!p||p.stock<qty)op.fail(409,'Produk tidak aktif atau stok tidak mencukupi. Muat ulang katalog.');if(!db.prepare('UPDATE products SET stock=stock-?,revision=revision+1 WHERE id=? AND stock>=?').run(qty,id,qty).changes)op.fail(409,'Stok berubah.');items.push({id,qty,name:JSON.parse(p.data).name,price:p.price});}
  const config=op.settings(db),order={id:crypto.randomUUID(),createdAt:new Date().toISOString(),items,total:items.reduce((n,i)=>n+i.qty*i.price,config.delivery),delivery:config.delivery,recipient:body.recipient.trim(),address:body.address.trim(),phone:body.phone.trim(),status:'Menunggu pembayaran',paymentStatus:'unpaid',paymentMethod:'manual',paymentInstructions:config.paymentInstructions,currency:config.currency,trialPrices:config.trialPrices,serverManaged:true,revision:0,requestFingerprint:fingerprint,expiresAt:new Date(Date.now()+config.reservationHours*3600000).toISOString()};
  db.prepare('INSERT INTO orders VALUES(?,?,?,?)').run(order.id,auth.id,body.requestId,JSON.stringify(order));op.audit(db,auth.id,'create','order',order.id,null,order);return{order};
 });
}
module.exports={commerce,restoreStock,sweepExpired,cancelOrder};

'use strict';
const crypto=require('node:crypto'),op=require('./operations.cjs'),{sweepExpired,restoreStock}=require('./commerce.cjs');
function updateOrder(db,actor,body){return op.transaction(db,()=>{
 const row=db.prepare('SELECT data FROM orders WHERE id=?').get(op.id(body.id));if(!row)op.fail(404,'Pesanan tidak ditemukan.');const order=JSON.parse(row.data),before=structuredClone(order);
 if(!Number.isInteger(body.revision)||body.revision!==(order.revision||0))op.fail(409,'Pesanan sudah berubah. Muat ulang sebelum melanjutkan.');
 switch(body.action){
 case 'record-payment':if(order.paymentStatus!=='unpaid')op.fail(409,'Pesanan tidak menunggu pembayaran.');if(body.amount!==order.total)op.fail(400,'Jumlah pembayaran harus sama dengan total pesanan.');if(!['cash','bank-transfer'].includes(body.method))op.fail(400,'Metode pembayaran tidak valid.');Object.assign(order,{paymentStatus:'paid',status:'Pembayaran dikonfirmasi',paidAt:new Date().toISOString(),paymentRecord:{method:body.method,reference:op.text(body.reference,120),amount:body.amount,recordedBy:actor}});break;
 case 'process':if(order.paymentStatus!=='paid'||order.fulfillmentStatus)op.fail(409,'Pesanan harus sudah dibayar dan belum diproses.');Object.assign(order,{fulfillmentStatus:'processing',status:'Diproses'});break;
 case 'ship':if(order.paymentStatus!=='paid'||order.fulfillmentStatus!=='processing')op.fail(409,'Pesanan harus sudah diproses.');Object.assign(order,{fulfillmentStatus:'shipped',status:'Dikirim',courier:op.text(body.courier,80),trackingNumber:op.text(body.trackingNumber,120),shippedAt:new Date().toISOString()});break;
 case 'complete':if(order.fulfillmentStatus!=='shipped')op.fail(409,'Pesanan harus sudah dikirim.');Object.assign(order,{fulfillmentStatus:'completed',status:'Selesai',completedAt:new Date().toISOString()});break;
 case 'cancel':if(order.paymentStatus!=='unpaid')op.fail(409,'Hanya pesanan belum dibayar yang dapat dibatalkan.');restoreStock(db,order);Object.assign(order,{paymentStatus:'cancelled',status:'Dibatalkan'});break;
 case 'record-refund':if(order.paymentStatus!=='paid'||['shipped','completed'].includes(order.fulfillmentStatus))op.fail(409,'Pengembalian ini hanya untuk pesanan dibayar yang belum dikirim.');if(body.amount!==order.total)op.fail(400,'Jumlah pengembalian harus sama dengan total.');restoreStock(db,order);Object.assign(order,{paymentStatus:'refunded',status:'Dana dikembalikan',refundRecord:{amount:body.amount,reference:op.text(body.reference,120),recordedBy:actor,date:new Date().toISOString()}});break;
 default:op.fail(400,'Aksi pesanan tidak valid.');
 }
 order.revision=(order.revision||0)+1;db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(order),order.id);op.audit(db,actor,body.action,'order',order.id,before,order);return{order};
 });}
function updateBooking(db,actor,body){return op.transaction(db,()=>{
 const before=db.prepare('SELECT * FROM appointments WHERE id=?').get(op.id(body.id));if(!before)op.fail(404,'Booking tidak ditemukan.');if(body.previousStatus!==before.status)op.fail(409,'Status booking berubah. Muat ulang dahulu.');const next={'Menunggu konfirmasi':['Dikonfirmasi','Ditolak','Dibatalkan'],'Dikonfirmasi':['Selesai','Dibatalkan']}[before.status]||[];if(!next.includes(body.status))op.fail(409,'Perubahan status booking tidak diperbolehkan.');db.prepare('UPDATE appointments SET status=? WHERE id=?').run(body.status,before.id);const after={...before,status:body.status};op.audit(db,actor,'status','booking',before.id,before,after);return{booking:op.booking(after)};
 });}
function handle(db,auth,route,method,body){
 if(!route.startsWith('admin/'))return;
 if(!db.prepare('SELECT user_id FROM operators WHERE user_id=?').get(auth.id)||!auth.verified)op.fail(403,'Akses pengelola memerlukan akun terverifikasi dan izin operator.');
 sweepExpired(db);
 if(method==='GET'){
  if(route==='admin/overview')return{operator:{email:auth.email},settings:op.settings(db),counts:{products:op.products(db,true).length,pendingBookings:db.prepare('SELECT COUNT(*) AS n FROM appointments WHERE status=?').get('Menunggu konfirmasi').n,unpaidOrders:db.prepare("SELECT data FROM orders").all().filter(r=>JSON.parse(r.data).paymentStatus==='unpaid').length}};
  if(route==='admin/products')return{products:op.products(db,true)};
  if(route==='admin/providers')return{providers:op.providers(db)};
  if(route==='admin/services')return{services:op.services(db,true)};
  if(route==='admin/bookings')return{bookings:db.prepare('SELECT a.*,u.email,u.state FROM appointments a JOIN users u ON u.id=a.user_id ORDER BY date,time').all().map(r=>({...op.booking(r),customerEmail:r.email,customerName:JSON.parse(r.state).name,customerPhone:JSON.parse(r.state).phone||'',petName:JSON.parse(r.state).pets.find(p=>p.id===r.pet_id)?.name||'Hewan dihapus'}))};
  if(route==='admin/orders')return{orders:db.prepare('SELECT o.data,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.rowid DESC').all().map(r=>({...JSON.parse(r.data),customerEmail:r.email}))};
  if(route==='admin/audit')return{events:db.prepare('SELECT id,actor,action,entity,entity_id,created_at FROM audit_log ORDER BY id DESC LIMIT 200').all()};
 }
 if(method==='POST'&&route==='admin/orders/update')return updateOrder(db,auth.id,body);
 if(method==='POST'&&route==='admin/bookings/update')return updateBooking(db,auth.id,body);
 if(method==='PUT'&&route==='admin/settings'){
  const before=op.settings(db);if(!['IDR','LKR'].includes(body.currency))op.fail(400,'Mata uang tidak valid.');if(body.currency!==before.currency&&body.confirmCurrencyChange!==true)op.fail(400,'Konfirmasikan perubahan mata uang tanpa konversi otomatis.');if(!body.trialPrices&&body.confirmPricesReviewed!==true)op.fail(400,'Periksa seluruh harga sebelum mengaktifkan harga bisnis.');
  const after={name:op.text(body.name,100),currency:body.currency,delivery:op.integer(body.delivery),trialPrices:!!body.trialPrices,paymentInstructions:typeof body.paymentInstructions==='string'?body.paymentInstructions.trim():'',reservationHours:op.integer(body.reservationHours,168)};if(after.paymentInstructions.length>1500||after.reservationHours<1)op.fail(400,'Instruksi atau durasi reservasi tidak valid.');
  return op.transaction(db,()=>{db.prepare('UPDATE business_settings SET data=? WHERE id=1').run(JSON.stringify(after));op.audit(db,auth.id,'update','settings','store',before,after);return{settings:after};});
 }
 if(method==='PUT'&&route==='admin/products'){
  const productId=body.id?op.id(body.id):crypto.randomUUID(),row=db.prepare('SELECT * FROM products WHERE id=?').get(productId),before=row?{...JSON.parse(row.data),price:row.price,stock:row.stock,active:!!row.active}:null;
  const data={...(before||{}),id:productId,name:op.text(body.name),category:op.text(body.category,80),brand:typeof body.brand==='string'?body.brand.trim():'',description:typeof body.description==='string'?body.description.trim():'',targetSpecies:typeof body.targetSpecies==='string'?body.targetSpecies.trim():''};if(data.description.length>1000||data.brand.length>100||data.targetSpecies.length>60)op.fail(400,'Detail produk terlalu panjang.');
  if(body.image!==undefined){if(typeof body.image!=='string'||body.image.length>2000000||(body.image&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image)&&!/^assets\/[\w/-]+\.(png|svg|webp|jpg)$/.test(body.image)))op.fail(400,'Gambar produk tidak valid.');data.image=body.image;}
  const price=op.integer(body.price),stock=op.integer(body.stock,1000000),active=body.active!==false;
  return op.transaction(db,()=>{const latest=db.prepare('SELECT revision FROM products WHERE id=?').get(productId);if(latest&&(!Number.isInteger(body.revision)||body.revision!==latest.revision))op.fail(409,'Produk atau stok berubah. Muat ulang produk sebelum menyimpan.');db.prepare('INSERT INTO products(id,data,stock,price,active) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,stock=excluded.stock,price=excluded.price,active=excluded.active,revision=products.revision+1').run(productId,JSON.stringify(data),stock,price,+active);const after={...data,price,stock,active,revision:db.prepare('SELECT revision FROM products WHERE id=?').get(productId).revision};op.audit(db,auth.id,before?'update':'create','product',productId,before,after);return{product:after};});
 }
 if(method==='PUT'&&route==='admin/providers'){
  const providerId=body.id?op.id(body.id):crypto.randomUUID(),before=op.providers(db).find(p=>p.id===providerId)||null;
  if(!Array.isArray(body.weekdays)||body.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||!Array.isArray(body.slots)||body.slots.length>48||body.slots.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))op.fail(400,'Hari atau jam layanan tidak valid.');
  for(const key of ['phone','address'])if(body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>(key==='phone'?40:500)))op.fail(400,'Kontak penyedia tidak valid.');
  const data={name:op.text(body.name),phone:body.phone?.trim()||'',address:body.address?.trim()||'',active:body.active!==false,weekdays:[...new Set(body.weekdays)].sort(),slots:[...new Set(body.slots)].sort()};
  return op.transaction(db,()=>{db.prepare('INSERT INTO providers VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(providerId,JSON.stringify(data));op.audit(db,auth.id,before?'update':'create','provider',providerId,before,data);return{provider:{id:providerId,...data}};});
 }
 if(method==='PUT'&&route==='admin/services'){
  const serviceId=body.id?op.id(body.id):crypto.randomUUID(),before=op.services(db,true).find(s=>s.id===serviceId)||null;if(!op.providers(db).some(p=>p.id===body.providerId)||!['vets','grooming','boarding'].includes(body.kind))op.fail(400,'Penyedia atau jenis layanan tidak valid.');const data={name:op.text(body.name),kind:body.kind,providerId:body.providerId,price:op.integer(body.price),active:body.active!==false};
  return op.transaction(db,()=>{db.prepare('INSERT INTO services VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(serviceId,JSON.stringify(data));op.audit(db,auth.id,before?'update':'create','service',serviceId,before,data);return{service:{id:serviceId,...data}};});
 }
 op.fail(404,'Endpoint pengelola tidak ditemukan.');
}
module.exports={handle,updateBooking,updateOrder};

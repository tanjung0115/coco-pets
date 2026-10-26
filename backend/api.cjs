'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt),digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(s,max=200)=>typeof s==='string'&&s.length<=max?s:fail(400,'Data teks tidak valid.');
const password=s=>{text(s,1024);if(s.length<8||!s.trim())fail(400,'Password minimal 8 karakter.');return s;};
const email=s=>{s=text(s,254).trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail(400,'Email tidak valid.');return s;};
async function hash(pass,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:(await scrypt(pass,salt,64,{N:32768,maxmem:64*1024*1024})).toString('hex')};}
async function matches(pass,u){if(typeof pass!=='string'||pass.length>1024)return false;const result=await hash(pass,u.salt);return crypto.timingSafeEqual(Buffer.from(result.hash,'hex'),Buffer.from(u.password_hash,'hex'));}
function cleanState(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Data akun tidak valid.');
 const out={name:text(input.name||'COCO User',80).trim(),phone:text(input.phone||'',40),address:text(input.address||'',500),photo:input.photo||'',selectedPetId:input.selectedPetId||null};
 if(!out.name)fail(400,'Nama wajib diisi.');
 const photo=v=>{if(typeof v!=='string'||v.length>2000000||(v&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)))fail(400,'Foto harus PNG, JPEG atau WebP, maksimal 2 MB.');return v;};photo(out.photo);
 for(const key of ['pets','cart','orders','bookings','reviews','supportMessages']){const value=input[key]||[];if(!Array.isArray(value)||value.length>1000)fail(400,'Daftar '+key+' tidak valid.');out[key]=JSON.parse(JSON.stringify(value));}
 const ids=new Set();for(const p of out.pets){if(!p||typeof p!=='object'||!p.id||ids.has(p.id))fail(400,'ID hewan tidak valid.');text(p.id,100);if(!/^[A-Za-z0-9_-]{1,100}$/.test(p.id))fail(400,'ID hewan tidak valid.');ids.add(p.id);text(p.name,60);text(p.species,60);if(!Array.isArray(p.records))fail(400,'Catatan hewan tidak valid.');photo(p.photo||'');if(p.records.length>10000)fail(400,'Terlalu banyak catatan.');for(const r of p.records){if(!r||typeof r!=='object'||!r.id)fail(400,'Catatan tidak valid.');text(r.type,80);text(r.date,30);text(r.note||'',2000);}} 
 if(out.selectedPetId&&!ids.has(out.selectedPetId))out.selectedPetId=out.pets[0]?.id||null;
 const validateIds=(value,depth=0)=>{if(depth>32)fail(400,'Data akun terlalu bertingkat.');if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))fail(400,'Data akun tidak valid.');if((key==='id'||key.endsWith('Id'))&&item!==null&&item!==undefined&&(typeof item!=='string'||!(/^[A-Za-z0-9_-]{1,100}$/).test(item)))fail(400,'ID data tidak valid.');validateIds(item,depth+1);}};
 for(const c of out.cart)if(!c||typeof c.id!=='string'||!Number.isInteger(c.qty)||c.qty<1||c.qty>999)fail(400,'Keranjang tidak valid.');
 for(const key of ['bookingDraft','checkoutDraft'])out[key]=input[key]&&typeof input[key]==='object'&&!Array.isArray(input[key])?JSON.parse(JSON.stringify(input[key])):{};
 validateIds(out);
 return out;
}
function createApi(options={}){
 const filename=options.database||process.env.COCO_DB_PATH||path.join(__dirname,'data','coco.sqlite');
 if(filename!==':memory:')fs.mkdirSync(path.dirname(path.resolve(filename)),{recursive:true});
 const db=new DatabaseSync(filename);db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,verified INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS account_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS appointments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,pet_id TEXT NOT NULL,provider TEXT NOT NULL,service TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,status TEXT NOT NULL,request_id TEXT NOT NULL,UNIQUE(user_id,request_id));

 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,data TEXT NOT NULL,stock INTEGER NOT NULL,price INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_id TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(user_id,request_id));
 CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,pet_id TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,telemetry TEXT,updated_at INTEGER);`);
 for(const item of require('./catalog.json'))db.prepare('INSERT OR IGNORE INTO products(id,data,stock,price) VALUES(?,?,?,?)').run(item.id,JSON.stringify(item),item.stock,item.price);
 require('./operations.cjs').initialize(db);
 require('./iot.cjs').initialize(db);
 const mailer=require('./mailer.cjs').createMailer({database:filename,injected:options.mailer});
 const limits=new Map();let activeHashes=0;
 async function limitedHash(fn){if(activeHashes>=4)fail(503,'Server sibuk. Coba lagi sebentar.');activeHashes++;try{return await fn();}finally{activeHashes--;}}
 const row=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
 function session(uid){db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),uid,Date.now()+30*86400000);return token;}
 function state(u){const data=JSON.parse(u.state);const bookings=db.prepare('SELECT * FROM appointments WHERE user_id=? ORDER BY date,time').all(u.id).map(require('./operations.cjs').booking);const orders=db.prepare('SELECT data FROM orders WHERE user_id=? ORDER BY rowid DESC').all(u.id).map(o=>JSON.parse(o.data));data.bookings=[...bookings,...data.bookings.filter(b=>!b.serverManaged)];data.orders=[...orders,...data.orders.filter(o=>!o.serverManaged)];return{user:{...data,id:u.id,email:u.email,serverAccount:true,emailVerified:!!u.verified,isOperator:!!db.prepare('SELECT user_id FROM operators WHERE user_id=?').get(u.id)},revision:u.revision};}
 async function read(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>12*1024*1024)fail(413,'Data melebihi batas 12 MB.');parts.push(part);}try{const value=JSON.parse(Buffer.concat(parts).toString()||'{}');if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'JSON harus berupa objek.');return value;}catch{fail(400,'JSON tidak valid.');}}
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 async function sendAccountMail(u,kind){
 const ttl=kind==='reset'?30*60000:86400000;
 const previous=db.prepare('SELECT * FROM account_tokens WHERE user_id=? AND kind=?').get(u.id,kind);
 if(previous&&previous.expires_at-ttl>Date.now()-60000)return {delivery:'cooldown',retryAfter:60};
 const token=crypto.randomBytes(32).toString('hex'),tokenHash=digest(token);
 db.prepare('DELETE FROM account_tokens WHERE user_id=? AND kind=?').run(u.id,kind);
 db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?)').run(tokenHash,u.id,kind,Date.now()+ttl);
 const url=(process.env.COCO_PUBLIC_URL||'http://localhost:4173').replace(/\/$/,'')+'/#account-token/'+kind+'/'+token;
 try{await mailer.send({to:u.email,subject:kind==='reset'?'Reset password COCO Pets':'Verifikasi email COCO Pets',text:url});return {delivery:mailer.mode};}
 catch{db.prepare('DELETE FROM account_tokens WHERE token_hash=?').run(tokenHash);throw Object.assign(new Error('Pengiriman email belum berhasil. Coba lagi atau hubungi pengelola server.'),{status:503});}
 }

 async function handle(req,res){
 const pathname=new URL(req.url,'http://localhost').pathname;if(!pathname.startsWith('/api/v1/'))return false;
 try{
 const origin=req.headers.origin,allowed=new Set(['https://localhost','capacitor://localhost',...(process.env.COCO_ALLOWED_ORIGINS||'').split(',').filter(Boolean)]);if(origin){if(origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`&&!allowed.has(origin))fail(403,'Origin tidak diizinkan.');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');}if(req.method==='OPTIONS'){res.writeHead(204).end();return true;}
 const route=pathname.slice(8),method=req.method;
 if(method==='GET'&&route==='health'){reply(res,200,{ok:true,storage:'sqlite',mail:mailer.mode,requireVerifiedEmail:true,payments:'unconfigured',deviceIntegration:'manual-adapter'});return true;}
 if(method!=='GET'){const key=req.socket.remoteAddress+':'+(route.startsWith('auth/')?'auth':'write'),now=Date.now();for(const [k,v]of limits)if(v.until<now)limits.delete(k);const count=limits.get(key)||{n:0,until:now+60000};count.n++;limits.set(key,count);if(count.n>(route.startsWith('auth/')?30:180))fail(429,'Terlalu banyak permintaan. Coba lagi satu menit.');}
 const body=['POST','PUT','PATCH','DELETE'].includes(method)?await read(req):{};
 if(method==='POST'&&['auth/register','auth/login','auth/forgot','auth/reset','auth/verify'].includes(route)){
 if(route==='auth/register'){const mail=email(body.email),pass=password(body.password),data=cleanState({...body.state,name:body.name||body.state?.name});if(db.prepare('SELECT id FROM users WHERE email=?').get(mail))fail(409,'Email sudah terdaftar di server. Login dengan akun server tersebut.');const credential=await limitedHash(()=>hash(pass)),id=crypto.randomUUID();try{db.prepare('INSERT INTO users(id,email,salt,password_hash,state,created_at) VALUES(?,?,?,?,?,?)').run(id,mail,credential.salt,credential.hash,JSON.stringify(data),Date.now());}catch(e){if(e.message.includes('UNIQUE'))fail(409,'Email sudah terdaftar.');throw e;}const u=row(id);let verification;try{verification=await sendAccountMail(u,'verify');}catch{verification={delivery:'unavailable'};}reply(res,201,{...state(u),token:session(id),verification});return true;}
 if(route==='auth/login'){const u=db.prepare('SELECT * FROM users WHERE email=?').get(email(body.email));const okay=await limitedHash(async()=>u?matches(body.password,u):(await hash(String(body.password||'').slice(0,1024)),false));if(!okay)fail(401,'Email atau password server tidak sesuai.');if(row(u.id)?.password_hash!==u.password_hash)fail(401,'Password berubah. Silakan login kembali.');reply(res,200,{...state(u),token:session(u.id)});return true;}
 if(route==='auth/forgot'){const u=db.prepare('SELECT * FROM users WHERE email=?').get(email(body.email));if(u)try{await sendAccountMail(u,'reset');}catch{}reply(res,200,{message:'Jika email terdaftar, petunjuk reset akan dikirim.'});return true;}
 const kind=route==='auth/reset'?'reset':'verify',token=digest(text(body.token,128)),entry=db.prepare('SELECT * FROM account_tokens WHERE token_hash=? AND kind=? AND expires_at>?').get(token,kind,Date.now());if(!entry)fail(400,'Tautan kedaluwarsa atau sudah digunakan.');if(kind==='verify')db.prepare('UPDATE users SET verified=1 WHERE id=?').run(entry.user_id);else{const c=await limitedHash(()=>hash(password(body.password)));db.exec('BEGIN IMMEDIATE');try{const fresh=db.prepare('SELECT token_hash FROM account_tokens WHERE token_hash=? AND expires_at>?').get(token,Date.now());if(!fresh)fail(400,'Tautan sudah digunakan.');db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').run(c.salt,c.hash,entry.user_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(entry.user_id);db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(entry.user_id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}db.prepare('DELETE FROM account_tokens WHERE token_hash=?').run(token);reply(res,200,{ok:true});return true;
 }
 if(method==='POST'&&route==='devices/telemetry'){
 const token=(req.headers.authorization||'').replace(/^Bearer /,''),device=db.prepare('SELECT * FROM devices WHERE token_hash=?').get(digest(token));if(!device)fail(401,'Token perangkat tidak valid.');
 if(device.source==='simulation')fail(403,'Gunakan kontrol simulasi untuk perangkat dummy.');
 const telemetry={};for(const key of ['battery','health','food','mood'])if(body[key]!==undefined){if(!Number.isFinite(body[key])||body[key]<0||body[key]>100)fail(400,'Nilai sensor tidak valid.');telemetry[key]=body[key];}
 if(body.location!==undefined){const {lat,lng}=body.location||{};if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)fail(400,'Koordinat tidak valid.');telemetry.location={lat,lng};}
 if(!Object.keys(telemetry).length)fail(400,'Data sensor kosong.');db.prepare('UPDATE devices SET telemetry=?,updated_at=? WHERE id=?').run(JSON.stringify(telemetry),Date.now(),device.id);reply(res,200,{ok:true});return true;}
 const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');const auth=db.prepare('SELECT u.*,s.token_hash AS session_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(bearer),Date.now());if(!auth)fail(401,'Sesi server berakhir. Silakan login kembali.');
 if(method==='POST'&&['orders','bookings'].includes(route)&&!auth.verified)fail(403,'Verifikasi email dahulu untuk membuat pesanan atau booking.');
 const managed=require('./admin.cjs').handle(db,auth,route,method,body);if(managed){reply(res,200,managed);return true;}
 if(method==='GET'&&route==='services'){reply(res,200,{services:require('./operations.cjs').services(db),currency:require('./operations.cjs').settings(db).currency});return true;}
 if(method==='GET'&&route==='availability'){const query=new URL(req.url,'http://localhost').searchParams;reply(res,200,require('./operations.cjs').availability(db,query.get('serviceId'),query.get('date')));return true;}
 const commercial=require('./commerce.cjs').commerce(db,auth,route,method,body);if(commercial){reply(res,method==='POST'?201:200,commercial);return true;}
 if(method==='GET'&&route==='account'){reply(res,200,state(auth));return true;}
 if(method==='PUT'&&route==='account'){const data=cleanState(body.user);if(!Number.isSafeInteger(body.revision))fail(400,'Versi data tidak valid.');const result=db.prepare('UPDATE users SET state=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(data),auth.id,body.revision);if(!result.changes)fail(409,'Data berubah di perangkat lain. Unduh cadangan lokal lalu ambil data terbaru dari server.');reply(res,200,{revision:body.revision+1});return true;}
 if(method==='POST'&&route==='auth/logout'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(auth.session_hash);reply(res,200,{ok:true});return true;}
 if(method==='GET'&&route==='auth/status'){reply(res,200,{id:auth.id,email:auth.email,emailVerified:!!auth.verified});return true;}
 if(method==='POST'&&route==='auth/password'){if(!await limitedHash(()=>matches(body.currentPassword,auth)))fail(400,'Password saat ini tidak sesuai.');const c=await limitedHash(()=>hash(password(body.password)));db.exec('BEGIN IMMEDIATE');try{if(row(auth.id)?.password_hash!==auth.password_hash)fail(409,'Password berubah. Silakan login kembali.');db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').run(c.salt,c.hash,auth.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(auth.id);db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(auth.id);const token=session(auth.id);db.exec('COMMIT');reply(res,200,{token});}catch(e){db.exec('ROLLBACK');throw e;}return true;}
 if(method==='POST'&&route==='auth/verification'){if(auth.verified){reply(res,200,{alreadyVerified:true,delivery:'none'});return true;}const result=await sendAccountMail(auth,'verify');reply(res,200,{...result,message:result.delivery==='cooldown'?'Tunggu satu menit sebelum mengirim ulang.':'Petunjuk verifikasi telah dibuat.'});return true;}
 if(method==='DELETE'&&route==='account'){if(!await limitedHash(()=>matches(body.password,auth)))fail(400,'Password tidak sesuai.');db.exec('BEGIN IMMEDIATE');try{if(row(auth.id)?.password_hash!==auth.password_hash)fail(409,'Password berubah. Silakan login kembali.');for(const record of db.prepare('SELECT data FROM orders WHERE user_id=?').all(auth.id)){const order=JSON.parse(record.data);if(order.paymentStatus==='unpaid')for(const item of order.items)db.prepare('UPDATE products SET stock=stock+?,revision=revision+1 WHERE id=?').run(item.qty,item.id);}for(const item of db.prepare('SELECT id FROM orders WHERE user_id=?').all(auth.id))db.prepare("DELETE FROM audit_log WHERE entity='order' AND entity_id=?").run(item.id);for(const item of db.prepare('SELECT id FROM appointments WHERE user_id=?').all(auth.id))db.prepare("DELETE FROM audit_log WHERE entity='booking' AND entity_id=?").run(item.id);db.prepare("DELETE FROM audit_log WHERE actor=? OR (entity='operator' AND entity_id=?)").run(auth.id,auth.id);db.prepare('DELETE FROM users WHERE id=?').run(auth.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}reply(res,200,{ok:true});return true;}
 if(method==='GET'&&route==='bookings'){reply(res,200,{bookings:state(auth).user.bookings});return true;}
 if(method==='POST'&&route==='bookings'){reply(res,201,require('./operations.cjs').createBooking(db,auth,body));return true;}
 if(method==='POST'&&route==='bookings/cancel'){reply(res,200,require('./operations.cjs').cancelBooking(db,auth,body));return true;}
 if(method==='POST'&&route==='devices/simulate'){reply(res,200,require('./iot.cjs').simulate(db,auth,body));return true;}
 if(method==='GET'&&route==='devices'){reply(res,200,{devices:db.prepare('SELECT id,pet_id,telemetry,updated_at,source FROM devices WHERE user_id=?').all(auth.id).map(d=>require('./iot.cjs').describe(d))});return true;}
 fail(404,'Endpoint tidak ditemukan.');
 }catch(e){if(!res.headersSent)reply(res,e.status||500,{error:e.status?e.message:'Server mengalami masalah. Coba lagi.'});}return true;
 }
 return {handle,close:()=>db.close(),db};
}
module.exports={createApi,cleanState};

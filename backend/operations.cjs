'use strict';
const crypto=require('node:crypto');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max=120)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(400,'Teks tidak valid.');return value.trim();};
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))fail(400,'ID tidak valid.');return value;};
const integer=(value,max=1e9)=>{if(!Number.isSafeInteger(value)||value<0||value>max)fail(400,'Angka harus bilangan bulat nonnegatif.');return value;};
const transaction=(db,fn)=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
function audit(db,actor,action,entity,entityId,before,after){db.prepare('INSERT INTO audit_log(actor,action,entity,entity_id,before_data,after_data,created_at) VALUES(?,?,?,?,?,?,?)').run(actor,action,entity,entityId,JSON.stringify(before??null,(key,value)=>key==='image'&&typeof value==='string'&&value.startsWith('data:')?'sha256:'+crypto.createHash('sha256').update(value).digest('hex'):value),JSON.stringify(after??null,(key,value)=>key==='image'&&typeof value==='string'&&value.startsWith('data:')?'sha256:'+crypto.createHash('sha256').update(value).digest('hex'):value),new Date().toISOString());}
const settings=db=>JSON.parse(db.prepare('SELECT data FROM business_settings WHERE id=1').get().data);
const providers=db=>db.prepare('SELECT id,data FROM providers ORDER BY rowid').all().map(r=>({id:r.id,...JSON.parse(r.data)}));
const services=(db,all=false)=>{const ps=providers(db);return db.prepare('SELECT id,data FROM services ORDER BY rowid').all().map(r=>({id:r.id,...JSON.parse(r.data)})).map(s=>({...s,provider:ps.find(p=>p.id===s.providerId)})).filter(s=>all||(s.active&&s.provider?.active));};
const products=(db,all=false)=>db.prepare('SELECT * FROM products ORDER BY rowid').all().map(p=>({...JSON.parse(p.data),id:p.id,stock:p.stock,price:p.price,active:!!p.active,revision:p.revision||0})).filter(p=>all||p.active);
function initialize(db){
 db.exec(`CREATE TABLE IF NOT EXISTS operators(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,before_data TEXT NOT NULL,after_data TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS business_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS providers(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY,data TEXT NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO business_settings VALUES(1,?)').run(JSON.stringify({name:'COCO Pets',currency:'LKR',delivery:520,trialPrices:true,paymentInstructions:'',reservationHours:24}));
 const add=(table,column,type)=>{if(!db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name===column))db.exec('ALTER TABLE '+table+' ADD COLUMN '+column+' '+type);};
 add('products','active','INTEGER NOT NULL DEFAULT 1');add('products','revision','INTEGER NOT NULL DEFAULT 0');add('appointments','provider_id','TEXT');add('appointments','service_id','TEXT');add('appointments','provider_contact',"TEXT NOT NULL DEFAULT '{}'");add('appointments','price','INTEGER NOT NULL DEFAULT 150000');add('appointments','currency',"TEXT NOT NULL DEFAULT 'LKR'");
 for(const [kind,name,provider]of [['vets','Konsultasi dokter hewan','Dr. Nambuvan'],['grooming','Grooming','Grooming service'],['boarding','Penitipan','Boarding service']]){
  db.prepare('INSERT OR IGNORE INTO providers VALUES(?,?)').run('provider-'+kind,JSON.stringify({name:provider,active:true,weekdays:[0,1,2,3,4,5,6],slots:['09:30','10:30','11:30','15:30','16:30','17:30']}));
  db.prepare('INSERT OR IGNORE INTO services VALUES(?,?)').run('service-'+kind,JSON.stringify({name,kind,providerId:'provider-'+kind,price:150000,active:true}));
  db.prepare('UPDATE appointments SET provider_id=?,service_id=? WHERE provider_id IS NULL AND service=? AND provider=?').run('provider-'+kind,'service-'+kind,name,provider);
 }
 for(const row of db.prepare('SELECT id,provider FROM appointments WHERE provider_id IS NULL').all())db.prepare('UPDATE appointments SET provider_id=? WHERE id=?').run('legacy-'+crypto.createHash('sha256').update(row.provider).digest('hex').slice(0,24),row.id);
 db.exec("DROP INDEX IF EXISTS appointment_slot; CREATE UNIQUE INDEX IF NOT EXISTS provider_slot ON appointments(provider_id,date,time) WHERE status!='Dibatalkan' AND status!='Ditolak';");
}
function validDate(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail(400,'Tanggal tidak valid.');return date;}
function availability(db,serviceId,date){
 validDate(date);const service=services(db).find(s=>s.id===serviceId);if(!service)fail(404,'Layanan tidak tersedia.');
 const open=service.provider.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay()),taken=db.prepare("SELECT time FROM appointments WHERE provider_id=? AND date=? AND status NOT IN ('Dibatalkan','Ditolak')").all(service.providerId,date).map(r=>r.time);
 return{service,date,currency:settings(db).currency,slots:service.provider.slots.map(time=>({time,available:open&&!taken.includes(time)&&Date.parse(date+'T'+time+':00+07:00')>Date.now()}))};
}
function booking(row){return{id:row.id,petId:row.pet_id,provider:row.provider,providerId:row.provider_id,service:row.service,serviceId:row.service_id,date:row.date,time:row.time,status:row.status,price:row.price,currency:row.currency,providerContact:JSON.parse(row.provider_contact||'{}'),serverManaged:true};}
function createBooking(db,auth,body){
 const requestId=id(body.requestId),old=db.prepare('SELECT * FROM appointments WHERE user_id=? AND request_id=?').get(auth.id,requestId);
 if(old){if(old.pet_id!==body.petId||old.date!==body.date||old.time!==body.time||(body.serviceId&&old.service_id!==body.serviceId))fail(409,'Request ID sudah digunakan untuk booking lain.');return{booking:booking(old)};}
 const pet=JSON.parse(auth.state).pets.find(p=>p.id===body.petId);if(!pet)fail(400,'Hewan tidak ditemukan.');
 const service=body.serviceId?services(db).find(s=>s.id===body.serviceId):services(db).find(s=>s.name===body.service);if(!service)fail(400,'Layanan tidak tersedia.');
 const slot=availability(db,service.id,body.date).slots.find(s=>s.time===body.time);if(!slot?.available)fail(409,'Jadwal tidak tersedia. Pilih waktu lain.');
 const bookingId=crypto.randomUUID();try{db.prepare('INSERT INTO appointments(id,user_id,pet_id,provider,service,date,time,status,request_id,provider_id,service_id,price,currency,provider_contact) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(bookingId,auth.id,pet.id,service.provider.name,service.name,body.date,body.time,'Menunggu konfirmasi',requestId,service.providerId,service.id,service.price,settings(db).currency,JSON.stringify({phone:service.provider.phone||'',address:service.provider.address||''}));}catch(e){if(e.message.includes('UNIQUE'))fail(409,'Jadwal sudah dipesan.');throw e;}
 return{booking:booking(db.prepare('SELECT * FROM appointments WHERE id=?').get(bookingId))};
}
function cancelBooking(db,auth,body){return transaction(db,()=>{const row=db.prepare('SELECT * FROM appointments WHERE id=? AND user_id=?').get(id(body.id),auth.id);if(!row)fail(404,'Booking tidak ditemukan.');if(row.status==='Dibatalkan')return{ok:true};if(!['Menunggu konfirmasi','Dikonfirmasi'].includes(row.status))fail(409,'Booking sudah selesai atau ditolak.');db.prepare('UPDATE appointments SET status=? WHERE id=?').run('Dibatalkan',row.id);return{ok:true};});}
module.exports={initialize,fail,text,id,integer,transaction,audit,settings,providers,services,products,validDate,availability,booking,createBooking,cancelBooking};

'use strict';
const crypto=require('node:crypto'),op=require('./operations.cjs');
const STALE_MS=120000;
function initialize(db){if(!db.prepare('PRAGMA table_info(devices)').all().some(c=>c.name==='source'))db.exec("ALTER TABLE devices ADD COLUMN source TEXT NOT NULL DEFAULT 'physical'");}
function describe(d,now=Date.now()){
 const telemetry=d.telemetry?JSON.parse(d.telemetry):null;
 return{id:d.id,pet_id:d.pet_id,source:d.source,telemetry,updated_at:d.updated_at,
 connection:!d.updated_at?'waiting':telemetry?.connected===false?'offline':now-d.updated_at>STALE_MS?'stale':'online',
 lowBattery:telemetry?.battery!==undefined&&telemetry.battery<=20};
}
function simulate(db,auth,body){return op.transaction(db,()=>{
 const petId=op.id(body.petId),pet=JSON.parse(auth.state).pets.find(p=>p.id===petId);
 if(!pet)op.fail(404,'Hewan tidak ditemukan.');
 if(!['connect','move','low-battery','stale','offline','remove'].includes(body.action))op.fail(400,'Skenario simulasi tidak valid.');
 let device=db.prepare("SELECT * FROM devices WHERE user_id=? AND pet_id=? AND source='simulation'").get(auth.id,petId);
 if(body.action==='remove'){if(device)db.prepare('DELETE FROM devices WHERE id=?').run(device.id);return{ok:true};}
 if(!device){
  const id=crypto.randomUUID();
  db.prepare("INSERT INTO devices(id,user_id,pet_id,token_hash,source) VALUES(?,?,?,?,'simulation')").run(id,auth.id,petId,crypto.randomBytes(32).toString('hex'));
  device=db.prepare('SELECT * FROM devices WHERE id=?').get(id);
 }
 const t=device.telemetry?JSON.parse(device.telemetry):{battery:85,location:{lat:-6.2,lng:106.816666}};
 t.connected=body.action!=='offline';
 if(body.action==='connect')t.battery=85;
 if(body.action==='low-battery')t.battery=10;
 if(body.action==='move')t.location={lat:Math.min(90,(t.location?.lat||-6.2)+0.0003),lng:t.location?.lng||106.816666};
 const updated=Date.now()-(body.action==='stale'?STALE_MS+1000:0);
 db.prepare('UPDATE devices SET telemetry=?,updated_at=? WHERE id=?').run(JSON.stringify(t),updated,device.id);
 return{device:describe({...device,telemetry:JSON.stringify(t),updated_at:updated})};
 });}
module.exports={initialize,describe,simulate,STALE_MS};

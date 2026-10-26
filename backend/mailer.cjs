'use strict';
const fs=require('node:fs'),path=require('node:path');
function createMailer({database,injected,env=process.env,transportFactory}={}){
 const mode=injected?'test':env.COCO_SMTP_HOST?'smtp':env.COCO_MAIL_WEBHOOK_URL?'webhook':env.NODE_ENV==='production'?'unconfigured':'development-outbox';
 let transport;
 return {mode,async send(mail){
  if(injected){await injected(mail);return;}
  if(mode==='smtp'){
   if(!env.COCO_MAIL_FROM||!env.COCO_SMTP_USER||!env.COCO_SMTP_PASSWORD)throw Error('Konfigurasi SMTP belum lengkap.');
   if(!transport){const port=Number(env.COCO_SMTP_PORT||587);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Port SMTP tidak valid.');transport=(transportFactory||require('nodemailer').createTransport)({host:env.COCO_SMTP_HOST,port,secure:port===465,requireTLS:true,auth:{user:env.COCO_SMTP_USER,pass:env.COCO_SMTP_PASSWORD},tls:{rejectUnauthorized:true},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});}
   const result=await transport.sendMail({...mail,from:env.COCO_MAIL_FROM});if(!result.accepted?.length)throw Error('Email ditolak oleh server SMTP.');return;
  }
  if(mode==='webhook'){const response=await fetch(env.COCO_MAIL_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(env.COCO_MAIL_WEBHOOK_TOKEN||'')},body:JSON.stringify(mail),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Layanan email menolak permintaan.');return;}
  if(mode==='unconfigured')throw Error('Layanan email belum dikonfigurasi.');
  const directory=database&&database!==':memory:'?path.dirname(path.resolve(database)):path.join(__dirname,'data');const outbox=path.join(directory,'outbox');fs.mkdirSync(outbox,{recursive:true});fs.writeFileSync(path.join(outbox,require('node:crypto').randomUUID()+'.json'),JSON.stringify(mail,null,2),{mode:0o600});
 }};
}
module.exports={createMailer};

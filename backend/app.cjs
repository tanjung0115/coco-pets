'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {pbkdf2}=require('node:crypto');
let pendingHashes=0;
const root = path.resolve(__dirname, '../frontend');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const allowed = /^(?:(?:index|manage|privacy)\.html|(?:js|css|assets)\/[^\0]+)$/;
function createServer(options={}){const api=require('./api.cjs').createApi(options);const server=http.createServer(async (req,res) => {
  if(await api.handle(req,res))return;
  let relative;
  try {relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'') || 'index.html';}
  catch {res.writeHead(400).end();return;}
  // Web Crypto is unavailable on HTTP LAN origins. Use the same password KDF
  // on the local Node server for phone trials; never persist passwords here.
  if(relative==='api/password-hash'){
    if(req.method!=='POST'){res.writeHead(405,{'Allow':'POST'}).end();return;}
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403).end();return;}
    if(pendingHashes>=4){res.writeHead(429).end();return;}
    let body='',bytes=0;
    req.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192){res.writeHead(413).end();req.destroy();return;}body+=chunk;});
    req.on('end',()=>{
      if(res.writableEnded)return;
      let password,salt;
      try{({password,salt}=JSON.parse(body));if(typeof password!=='string'||typeof salt!=='string'||password.length>1024||salt.length>256||!salt)throw Error();}
      catch{res.writeHead(400).end();return;}
      if(pendingHashes>=4){res.writeHead(429).end();return;}
      pendingHashes++;
      pbkdf2(password,salt,150000,32,'sha256',(err,key)=>{
        pendingHashes--;if(res.destroyed)return;
        if(err){res.writeHead(500).end();return;}
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify({hash:key.toString('hex')}));
      });
    });return;
  }
  const target = path.resolve(root,relative);
  if(!allowed.test(relative)||relative.split(/[\\/]/).includes('..')||!target.startsWith(root+path.sep)){res.writeHead(404).end('Not found');return;}
  fs.readFile(target,(err,data)=>{
    if(err){res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
    res.end(data);
  });
});server.on('close',()=>api.close());return server;}
module.exports={createServer};


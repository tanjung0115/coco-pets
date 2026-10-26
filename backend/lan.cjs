'use strict';
const os=require('node:os');
process.env.HOST='0.0.0.0';
if(!process.env.COCO_PUBLIC_URL){
 const entries=Object.entries(os.networkInterfaces()).filter(([name])=>/wi-?fi|wlan|ethernet/i.test(name));
 const address=entries.flatMap(([,items])=>items).find(i=>i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254.'))?.address;
 if(address)process.env.COCO_PUBLIC_URL=`http://${address}:${process.env.PORT||4173}`;
}
require('./server.cjs');

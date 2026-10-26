'use strict';
const {createServer}=require('./app.cjs');
const port=Number(process.env.PORT||4173);
const host=process.env.HOST||'127.0.0.1';
process.env.COCO_PUBLIC_URL=process.env.COCO_PUBLIC_URL||`http://localhost:${port}`;
createServer().listen(port,host,()=>console.log(`COCO ready: http://localhost:${port} | Phone: ${process.env.COCO_PUBLIC_URL}`));

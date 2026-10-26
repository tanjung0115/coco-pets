'use strict';
// Keep recovery independent of the main renderer; never clear saved data.
(()=>{
 function show(){
  if(document.getElementById('coco-recovery'))return;
  const box=document.createElement('aside');box.id='coco-recovery';box.setAttribute('role','alert');
  box.style.cssText='position:fixed;bottom:100px;left:16px;right:16px;z-index:10000;padding:18px;background:#fff;color:#293d49;border:2px solid #4b82b2;border-radius:18px;box-shadow:0 4px 20px #0003';
  const text=document.createElement('p');text.textContent='Terjadi gangguan. Muat ulang untuk mencoba kembali. Perubahan yang belum tersimpan mungkin perlu diulangi.';
  const retry=document.createElement('button');retry.textContent='Muat ulang';retry.style.cssText='min-height:48px;padding:12px 24px';retry.onclick=()=>location.reload();
  const close=document.createElement('button');close.textContent='Tutup';close.style.cssText='min-height:48px;padding:12px 24px';close.onclick=()=>box.remove();
  box.append(text,retry,close);document.body.append(box);
 }
 window.addEventListener('error',event=>{if(event.error)show();});
 window.addEventListener('unhandledrejection',show);
})();

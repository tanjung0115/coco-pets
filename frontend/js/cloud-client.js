/* Server accounts retain an offline cache; legacy accounts are never migrated silently. */
'use strict';
window.COCO_CLOUD=(()=>{
 const CONFIG='coco.server.url',SESSION='coco.server.session',native=window.Capacitor?.getPlatform?.()==='android';
 let installing=false,storeSettings=null;
 let base=localStorage.getItem(CONFIG)||(native?'':location.origin),meta={},timer,flight,dirty=false,lastError='',health=null;
 try{meta=JSON.parse(localStorage.getItem(SESSION)||'{}');}catch{}
 if(meta.base!==base)meta={};dirty=!!meta.dirty||!!(user()?.id===meta.uid&&user()?._serverPending);
 try{storeSettings=JSON.parse(localStorage.getItem('coco.server.catalog.'+base)||'null');}catch{}
 const save=()=>localStorage.setItem(SESSION,JSON.stringify({...meta,base,dirty}));
 async function request(route,method='GET',data,authenticated=true){
  if(!base)throw Error('Atur alamat server dahulu.');
  let res;try{res=await fetch(base+'/api/v1/'+route,{method,headers:{'Content-Type':'application/json',...(authenticated&&meta.token?{Authorization:'Bearer '+meta.token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(route==='health'?3000:15000)});}catch{throw Error('Server tidak terjangkau. Pastikan komputer menyala dan tersambung ke Wi-Fi yang sama.');}
  const value=await res.json().catch(()=>({error:'Respons server tidak valid.'}));if(!res.ok){const error=Error(value.error||'Permintaan server gagal.');error.status=res.status;throw error;}return value;
 }
 function install(value){
  const account=value.user;db.users=db.users.filter(u=>u.id!==account.id);db.users.push(account);db.session=account.id;
  meta={...meta,uid:account.id,revision:value.revision,...(value.token?{token:value.token}:{})};dirty=false;save();installing=true;try{if(!persist())throw Error('Cache perangkat belum tersimpan.');}finally{installing=false;}
 }
 async function probe(){health=await request('health','GET',undefined,false);return health;}
 async function flush(){
  clearTimeout(timer);if(flight)return flight;
  if(!dirty||!meta.token||!user()?.serverAccount||user().id!==meta.uid)return;
  flight=(async()=>{try{while(dirty&&user()?.id===meta.uid){dirty=false;const snapshot=JSON.parse(JSON.stringify(user()));try{const value=await request('account','PUT',{user:snapshot,revision:meta.revision});meta.revision=value.revision;save();}catch(e){dirty=true;throw e;}}lastError='';if(user()?.id===meta.uid){user()._serverPending=false;installing=true;try{persist();}finally{installing=false;}}save();}catch(e){lastError=e.message;save();toast('Data tersimpan di perangkat; sinkronisasi belum berhasil. Buka Penyimpanan server.');throw e;}finally{flight=null;}})();return flight;
 }
 function beforePersist(){if(!installing&&meta.token&&user()?.serverAccount&&user().id===meta.uid){dirty=true;user()._serverPending=true;}}
 function queue(){if(installing)return;if(!user()?.serverAccount||user().id!==meta.uid||!meta.token)return;dirty=true;save();clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),700);}
 function applyCatalog(value){for(const p of catalog)p.serverActive=false;for(const product of value.products){let local=catalog.find(p=>p.id===product.id);if(local)Object.assign(local,product,{serverActive:true});else catalog.push({...product,serverActive:true,image:product.image||'assets/catalog/product.svg'});}}
 function hydrateCatalog(){if(user()?.serverAccount&&storeSettings?.products)applyCatalog(storeSettings);}
 async function refreshCatalog(){const value=await request('catalog');storeSettings=value;applyCatalog(value);try{localStorage.setItem('coco.server.catalog.'+base,JSON.stringify({...value,products:value.products.map(p=>({...p,image:p.image?.startsWith('data:')?'assets/catalog/product.svg':p.image}))}));}catch{}return value;}

 async function authenticate(email,password,name,state){
 const pending=dirty&&user()?.serverAccount&&user().id===meta.uid?{id:meta.uid,revision:meta.revision}:null;
 if(pending)try{await flush();}catch(e){if(e.status!==401)throw e;}
 const value=await request(name?'auth/register':'auth/login','POST',{email,password,...(name?{name,state}: {})},false);
 if(pending&&dirty&&pending.id===value.user.id){meta={...meta,token:value.token,revision:pending.revision};save();await flush().catch(()=>{});}
 else install(value);
 await refreshCatalog().catch(()=>{});return value;
 }

 async function refreshAuthStatus(){const value=await request('auth/status');if(user()?.id===value.id){user().emailVerified=value.emailVerified;installing=true;try{persist();}finally{installing=false;}}return value;}
 async function clearSession(){clearTimeout(timer);if(flight)await flight.catch(()=>{});meta={};dirty=false;lastError='';db.session=null;save();persist();}
 async function pull(){if(dirty)throw Error('Masih ada perubahan lokal. Unduh Backup data terlebih dahulu; gunakan Ambil data server untuk menggantinya secara sadar.');install(await request('account'));}
 async function replaceFromServer(){clearTimeout(timer);if(flight)await flight.catch(()=>{});install(await request('account'));lastError='';}
 async function logout(){if(meta.token){await flush();await request('auth/logout','POST',{});}meta={};dirty=false;save();}
 async function setServer(url){if(dirty)await flush();const next=new URL(url);if(!['http:','https:'].includes(next.protocol)||next.username||next.password||next.pathname!=='/'||next.search||next.hash)throw Error('Masukkan alamat server tanpa path, misalnya http://192.168.1.10:4173');const old=base;base=next.origin;try{await probe();}catch(e){base=old;throw e;}if(base!==old){meta={};dirty=false;storeSettings=null;}localStorage.setItem(CONFIG,base);save();}
 const ready=(async()=>{if(!base)return;try{await probe();if(meta.token&&user()?.serverAccount&&user().id===meta.uid){if(dirty)await flush();else await pull();}}catch(e){lastError=e.message;}})();
 window.addEventListener('online',()=>{if(dirty)flush().catch(()=>{});});
 return{ready,request,hydrateCatalog,refreshAuthStatus,clearSession,beforePersist,refreshCatalog,authenticate,probe,queue,flush,pull,replaceFromServer,logout,setServer,get settings(){return storeSettings;},get enabled(){return!!health;},get base(){return base;},get health(){return health;},get dirty(){return dirty;},get error(){return lastError;},get active(){return!!meta.token&&user()?.serverAccount&&user().id===meta.uid;},async password(currentPassword,password){const value=await request('auth/password','POST',{currentPassword,password});meta.token=value.token;save();},async deleteAccount(password){await request('account','DELETE',{password});const id=meta.uid;meta={};dirty=false;save();db.users=db.users.filter(u=>u.id!==id);db.session=null;persist();}};
})();

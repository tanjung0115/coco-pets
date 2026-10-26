/* Native Figma SVG elements + semantic HTML controls. No screen screenshots are
 * used as application backgrounds. Account, pet, cart and booking data remain live. */
'use strict';
// Android already supplies the real system clock, connectivity and battery.
document.documentElement.classList.toggle('coco-native',window.Capacitor?.getPlatform?.()==='android');
const designs=window.COCO_DESIGNS;
const designCache=new Map();
const svgFragments=new Map();
const pictureCache=new Map();
let navigationSvg='';
let designVersion=0,partId=0,currentBoard=null,currentTemplate='',referenceIndex=0;
let bookingMonth=new Date().getMonth(),bookingYear=new Date().getFullYear();
let foodSpecies='Semua';
const demoPrice=(n,currency)=>{const code=currency||(window.COCO_CLOUD?.active?window.COCO_CLOUD.settings?.currency:null);return code&&code!=='LKR'?new Intl.NumberFormat('id-ID',{style:'currency',currency:code,maximumFractionDigits:0}).format(n):'Rs '+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
const deliveryFee=()=>window.COCO_CLOUD?.active?(window.COCO_CLOUD.settings?.delivery??520):520;
function photoImage(src,name,size){return `<img class="d-user-photo" src="${esc(src)}" alt="Foto ${esc(name)}" width="${size}" height="${size}">`;}
function photoPicker(label,photo){return `<div class="d-photo-picker"><div class="d-photo-preview">${photo?photoImage(photo,label,100):'<span>Belum ada foto</span>'}</div><label>${label}<input type="file" name="photoUpload" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG, atau WebP, maksimal 10 MB. Foto disesuaikan ukurannya otomatis.</small></div>`;}
async function readPhoto(file,existing=''){
 if(!file?.size)return existing||'';
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Pilih foto JPG, PNG, atau WebP.');
 if(file.size>10*1024*1024)throw Error('Ukuran foto maksimal 10 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;await img.decode();
  const scale=Math.min(1,800/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.8);
 }catch{throw Error('Foto tidak dapat dibaca. Pilih file gambar yang valid.');}
 finally{URL.revokeObjectURL(url);}
}
function wirePhotoPreview(){
 const input=document.querySelector('[name=photoUpload]');let version=0;
 input?.addEventListener('change',async()=>{const current=++version;try{const photo=await readPhoto(input.files[0]);if(current!==version)return;input.closest('.d-photo-picker').querySelector('.d-photo-preview').innerHTML=photo?photoImage(photo,'pratinjau',100):'<span>Belum ada foto</span>';}catch(err){toast(err.message);}});
}
const designPositions=(x,y,w,h)=>`left:${x}px;top:${y}px;width:${w}px;${h?'height:'+h+'px;':''}`;
const commonParts=['home','profile','shopFood','shopAccessories','shopIoT','shopVet','devices','addPet'];
async function getDesign(name){
 if(!designs[name])throw Error('Desain tidak tersedia: '+name);
 if(!designCache.has(name))designCache.set(name,fetch(designs[name].file).then(r=>{if(!r.ok)throw Error('Aset desain gagal dimuat.');return r.text();}));
 const xml=await designCache.get(name);designCache.set(name,xml);return xml;
}
function fragment(name,box){
 let xml=designCache.get(name);if(typeof xml!=='string')return '';
 xml=xml.replace(/<svg\b[^>]*>/,`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:html="http://www.w3.org/1999/xhtml" width="${box[2]}" height="${box[3]}" viewBox="${box.join(' ')}" fill="none" aria-hidden="true" focusable="false">`);
 return queueSvg(xml);
}
function queueSvg(xml){
 const prefix='part'+(++partId)+'_';
 xml=xml.replace(/\bid="([^"]+)"/g,(_,id)=>`id="${prefix}${id}"`).replace(/url\(#([^\)]+)\)/g,(_,id)=>`url(#${prefix}${id})`).replace(/href="#([^"]+)"/g,(_,id)=>`href="#${prefix}${id}"`);
 svgFragments.set(prefix,xml);return `<span data-svg-part="${prefix}"></span>`;
}
function svgNode(xml){
 const doc=new DOMParser().parseFromString(xml,'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('SVG XML tidak valid.');
 // Editor/prototype hit-area outlines are not part of the navigation artwork.
 for(const rect of doc.querySelectorAll('rect[stroke="black"]'))if(Number(rect.getAttribute('width'))===36&&Number(rect.getAttribute('height'))===33)rect.remove();
 if(!location.hash.startsWith('#reference/')){
  for(const node of doc.querySelectorAll('[fill],[stroke],[stop-color],[style]'))for(const attribute of ['fill','stroke','stop-color','style']){
   if(node.hasAttribute(attribute))node.setAttribute(attribute,window.COCO_THEME.recolor(node.getAttribute(attribute)));
  }
  const frame=doc.querySelector('g[clip-path] > rect');
  if(frame&&Number(frame.getAttribute('width'))===430&&Number(frame.getAttribute('height'))>=900)frame.setAttribute('fill',window.COCO_THEME.background);
  for(const card of doc.querySelectorAll('rect[fill-opacity]')){
   if(['white','#ffffff'].includes((card.getAttribute('fill')||'').toLowerCase())&&Number(card.getAttribute('width'))>=100&&Number(card.getAttribute('height'))>=80&&Number(card.getAttribute('rx'))>0)card.setAttribute('fill-opacity','1');
  }
 }
 return document.importNode(doc.documentElement,true);
}
function hydrate(parent){for(const part of parent.querySelectorAll('[data-svg-part]')){const key=part.dataset.svgPart;part.replaceWith(svgNode(svgFragments.get(key)));svgFragments.delete(key);}}
function put(html,parent=currentBoard){parent.insertAdjacentHTML('beforeend',window.COCO_THEME.recolor(html));hydrate(parent);return parent.lastElementChild;}
function clearOriginal(box){
 const svg=currentBoard.querySelector('.d-vector > svg'),ns='http://www.w3.org/2000/svg';
 const defs=svg.querySelector('defs')||svg.appendChild(document.createElementNS(ns,'defs'));
 const clip=document.createElementNS(ns,'clipPath');clip.id='live-clip-'+designVersion+'-'+(++partId);clip.setAttribute('clipPathUnits','userSpaceOnUse');
 const [x,y,w,h]=box,path=document.createElementNS(ns,'path');
 path.setAttribute('d',`M0 0H430V1000H0Z M${x} ${y}h${w}v${h}h${-w}Z`);path.setAttribute('clip-rule','evenodd');path.setAttribute('fill-rule','evenodd');clip.appendChild(path);defs.appendChild(clip);
 // Independent clipping holes preserve original backdrop blur and image fills.
 const content=document.createElementNS(ns,'g');content.setAttribute('clip-path',`url(#${clip.id})`);
 for(const child of [...svg.children])if(child.tagName!=='defs')content.appendChild(child);
 svg.insertBefore(content,defs);
}

function textAt(value,box,options={}){
 clearOriginal(box);
 return put(`<${options.tag||'p'} class="d-layer d-label ${options.className||''}" style="${designPositions(...box)}font-size:${options.size||16}px;font-weight:${options.weight||400};color:${options.color||'#141415'};${options.background?'background:'+options.background+';':''}${options.align?'text-align:'+options.align+';':''}">${esc(value)}</${options.tag||'p'}>`);
}
function blockAt(html,box,background='white'){
 clearOriginal(box);return put(`<div class="d-content" style="${designPositions(...box)}background:${background}">${html}</div>`);
}
function cleanBody(background='white',top=94){
 if(background==='white'||background==='#f7f7f7')background=window.COCO_THEME.background;
 clearOriginal([0,top,430,1000-top]);
 // Bound the complete SVG paint area as well as its paths: exported filters,
 // shadows and foreignObject backdrops can paint beyond a path clipping hole.
 const vector=currentBoard.querySelector('.d-vector');
 Object.assign(vector.style,{height:top+'px',bottom:'auto',overflow:'hidden'});
 currentBoard.classList.add('d-clean-board');
 currentBoard.style.setProperty('--body-color',background);
 put(`<div class="d-body-plane" style="top:${top}px;background:${background}" aria-hidden="true"></div>`);
}
function flowBody(html,{background='white',top=116,left=22,width=386,headerBottom=94}={}){
 cleanBody(background,headerBottom);
 return put(`<section class="d-clean-content d-flow" style="margin-top:${top}px;margin-left:${left}px;width:${width}px">${html}</section>`);
}
function flowLink(label,route,secondary=false){return `<a class="d-flow-button ${secondary?'secondary':''}" href="#${route}">${label}</a>`;}
function navigationTab(route){
 if(['provider','reviews','review-new','shop','product','cart','checkout','payment','payment-failed','order-success','services','vets','grooming','boarding','booking-new','booking-pet','booking-date','booking-edit','booking-review','booking-success','slot-conflict','retail'].includes(route))return 'shop';
 if(['profile','profile-edit','change-password','addresses','backup','order','orders','bookings','help'].includes(route))return 'profile';
 if(['devices','device-add','pair-permission','pair-failed','device-detail','activity','sleep','camera','feeder','status','status-guide'].includes(route))return 'devices';
 return route==='location'?'location':'home';
}
function navigationArt(){
 if(!navigationSvg){
  const source=new DOMParser().parseFromString(designCache.get('home'),'image/svg+xml');
  const marker=[...source.querySelectorAll('rect[stroke="black"]')].find(rect=>Number(rect.getAttribute('width'))===36&&Number(rect.getAttribute('height'))===33);
  if(!marker)throw Error('Komponen navigasi asli tidak ditemukan.');
  const root=source.documentElement.cloneNode(false);root.setAttribute('width','430');root.setAttribute('height','54');root.setAttribute('viewBox','0 881 430 54');root.setAttribute('aria-hidden','true');root.removeAttribute('data-design');
  const translated=source.documentElement.firstElementChild.cloneNode(false),frame=source.documentElement.firstElementChild.firstElementChild.cloneNode(false);
  frame.appendChild(marker.parentElement.cloneNode(true));translated.appendChild(frame);root.appendChild(translated);root.appendChild(source.querySelector('defs').cloneNode(true));
  navigationSvg=new XMLSerializer().serializeToString(root);
 }
 return queueSvg(navigationSvg);
}
function topBrands(){
 const brands={'Makanan':['Josera','Pedigree','BlackHawk','Royal Canin'],'Perangkat':['Fi','Petcube'],'Vet Items':['Orondo','Nexgard','Petro']};
 const names=brands[filter]||[];
 return `<section class="d-top-brands" aria-labelledby="top-brands-title"><h2 id="top-brands-title">Top Brands</h2>${names.length?`<ul class="d-brand-grid">${names.map(name=>`<li>${name}</li>`).join('')}</ul>`:'<p class="d-muted">Belum ada informasi merek untuk kategori ini.</p>'}</section>`;
}
function fitContent(){requestAnimationFrame(()=>{if(currentBoard)currentBoard.style.minHeight=Math.max(designs[currentTemplate]?.height||935,innerHeight/(Math.min(innerWidth,430)/430))+'px';});}
function hit(label,box,route,action){
 const attrs=route?`href="#${route}"`:`type="button" data-command="${action||''}"`;
 return put(`<${route?'a':'button'} class="d-hit" style="${designPositions(...box)}" aria-label="${esc(label)}" ${attrs}><span class="sr-only">${esc(label)}</span></${route?'a':'button'}>`);
}
function nativeButton(label,box,route,action,style=''){
 clearOriginal(box);
 return put(`<${route?'a':'button'} class="d-button ${style}" style="${designPositions(...box)}" ${route?`href="#${route}"`:`type="button" data-command="${action||''}"`}>${label}</${route?'a':'button'}>`);
}
function formOnBoard(onSubmit,errorBox=[34,640,362,27]){
 const f=put('<form id="form" class="d-native-form"></form>');
 f.insertAdjacentHTML('beforeend',`<p id="form-error" class="d-error" role="alert" style="${designPositions(...errorBox)}" hidden></p>`);
 f.addEventListener('submit',async e=>{e.preventDefault();const submit=f.querySelector('[type=submit]');if(submit)submit.disabled=true;const err=f.querySelector('[role=alert]');err.hidden=true;try{await onSubmit(Object.fromEntries(new FormData(f)));}catch(ex){err.textContent=ex.message||'Coba lagi.';err.hidden=false;}finally{if(submit)submit.disabled=false;}});
 return f;
}
function inputAt(f,label,name,box,options={}){
 clearOriginal(box);
 const id='field-'+name;const kind=options.type||'text';
 f.insertAdjacentHTML('beforeend',`<label class="sr-only" for="${id}">${esc(label)}</label><input id="${id}" class="d-input" style="${designPositions(...box)}${options.background?'background:'+options.background+';':''}${options.css||''}" name="${name}" type="${kind}" value="${esc(options.value||'')}" placeholder="${esc(options.placeholder||'')}" ${options.required===false?'':'required'} ${options.attrs||''}>`);
 return f.querySelector('#'+id);
}
function submitAt(f,label,box){
 f.insertAdjacentHTML('beforeend',`<button type="submit" class="d-hit" style="${designPositions(...box)}" aria-label="${esc(label)}"><span class="sr-only">${esc(label)}</span></button>`);
}
function artwork(name,box,where){return `<span class="d-photo" style="width:${where?.[0]||box[2]}px;height:${where?.[1]||box[3]}px">${where?`<span style="display:block;zoom:${where[0]/box[2]}">`:''}${fragment(name,box)}${where?'</span>':''}</span>`;}
function petArt(index=0,size=60){const p=user()?.pets[index];if(p?.photo)return photoImage(p.photo,p.name,size);return artwork('home',[56+114*(index%3),190,91,92],[size,size]);}
function patternPicture(name,key,select,size,label){
 if(!pictureCache.has(key)){
  const source=new DOMParser().parseFromString(designCache.get(name),'image/svg+xml'),rect=select(source);
  if(!rect)throw Error('Gambar tidak ditemukan: '+label);
  const w=Number(rect.getAttribute('width')),h=Number(rect.getAttribute('height')),root=source.documentElement.cloneNode(false);
  root.setAttribute('width',w);root.setAttribute('height',h);root.setAttribute('viewBox',[rect.getAttribute('x')||0,rect.getAttribute('y')||0,w,h].join(' '));root.setAttribute('aria-hidden','true');root.removeAttribute('data-design');
  root.appendChild(rect.cloneNode(true));root.appendChild(source.querySelector('defs').cloneNode(true));
  pictureCache.set(key,{xml:new XMLSerializer().serializeToString(root),w,h});
 }
 const {xml,w,h}=pictureCache.get(key),scale=Math.min(size/w,size/h);
 return `<span class="d-product-picture" data-product-art="${esc(label)}" style="width:${w*scale}px;height:${h*scale}px"><span style="width:${w}px;height:${h}px;transform:scale(${scale});transform-origin:top left;display:block">${queueSvg(xml)}</span></span>`;
}
function itemArt(index,size=88){
 const p=catalog[index];
 if(!p.art&&!p.image)p.image='assets/catalog/product.svg';
 if(p.image)return `<span class="d-product-picture r-catalog-art" data-product-art="${esc(p.id)}" style="width:${size}px;height:${size}px"><img src="${esc(p.image)}" alt="${esc(p.name)}" width="${size}" height="${size}"></span>`;
 const name=p.design||'shopFood',key=name+':'+p.art[0]+':'+p.art[1];
 return patternPicture(name,key,source=>{
  const rects=[...source.documentElement.firstElementChild.querySelectorAll('rect')].filter(r=>r.getAttribute('fill')?.startsWith('url(#pattern')&&Number(r.getAttribute('y'))-designs[name].sourceY>330).slice(-4);
  return rects[(p.art[1]>500?2:0)+(p.art[0]>200?1:0)];
 },size,p.id);
}
function deviceArt(index){
 return patternPicture('addDevice','device:'+index,source=>[...source.documentElement.firstElementChild.querySelectorAll('rect')].filter(r=>r.getAttribute('fill')?.startsWith('url(#pattern')).sort((a,b)=>Number(a.getAttribute('y'))-Number(b.getAttribute('y')))[index],70,'device-'+index);
}

function updateScale(){const scale=Math.min(innerWidth,430)/430;document.documentElement.style.setProperty('--d-scale',scale);document.documentElement.style.setProperty('--d-viewport-height',innerHeight/scale+'px');}
window.addEventListener('resize',updateScale);updateScale();
async function board(name,title,version,withNav=true){
 await Promise.all([...new Set([name,...commonParts])].map(getDesign));
 if(version!==designVersion)return false;
 currentTemplate=name;
 const d=designs[name];
 app.innerHTML=`<div class="d-shell"><main class="d-board" data-screen="${name}" style="--d-frame-height:${d.height}px"><h1 class="sr-only">${esc(title)}</h1><div class="d-vector" aria-hidden="true"></div></main></div>`;
 currentBoard=app.querySelector('.d-board');
 currentBoard.querySelector('.d-vector').appendChild(svgNode(designCache.get(name)));
 currentBoard.querySelector('.d-vector svg').setAttribute('aria-hidden','true');
 const frameFill=currentBoard.querySelector('.d-vector g[clip-path] > rect')?.getAttribute('fill');
 if(frameFill&&/^(#[0-9a-f]{3,8}|white)$/i.test(frameFill))currentBoard.style.backgroundColor=frameFill;
 if(withNav&&user()){
  clearOriginal([0,881,430,54]);
  const route=navigationTab(location.hash.slice(1).split('/')[0]);
  app.querySelector('.d-shell').insertAdjacentHTML('beforeend',`<nav class="d-nav" aria-label="Navigasi utama"><div class="d-nav-art">${navigationArt()}</div>${[['home','Home'],['shop','Shop'],['location','Location'],['devices','Devices'],['profile','Profile']].map(([r,l])=>`<a href="#${r}" aria-label="${l}" ${route===r?'aria-current="page"':''}><span class="sr-only">${l}</span></a>`).join('')}</nav>`);
  hydrate(app);
  // Remove the prototype hit-area outline retained in the pasted Home export.
  for(const rect of app.querySelectorAll('.d-nav-art rect[stroke="black"][width="36"][height="33"]'))rect.remove();
 }
 if(user()&&['home','firstRun','profile','about','addresses','locationOffline'].includes(name)){
  const avatarBox=[364,40,48,48],headerBottom=name==='home'?96:94;
  clearOriginal([328,32,102,64]);
  put(`<div class="d-layer d-avatar-header-fill" aria-hidden="true" style="${designPositions(328,32,102,headerBottom-32)}"></div><a class="d-layer d-account-avatar" href="#profile-edit" aria-label="Foto profil - buka About me" style="${designPositions(...avatarBox)}">${user().photo?photoImage(user().photo,user().name,48):'<span aria-hidden="true">'+esc(user().name.trim().slice(0,1).toUpperCase())+'</span>'}</a>`);
 }
 document.title='COCO · '+title;
 return true;
}
function headerName(name){const title=textAt(name,[48,44,306,50],{size:name.length>28?17:20,weight:500,color:'white',background:'#4b82b2',align:'center'});title.classList.add('d-header-title');}
const navigationSession=String(Date.now())+Math.random();
let navigationPosition=-1;
const navigationRoutes=new Map();
function trackNavigation(){
 const route=location.hash.slice(1)||'welcome',saved=history.state?.cocoNavigation;
 if(saved?.session===navigationSession&&saved.route===route)navigationPosition=saved.position;
 else{navigationPosition++;history.replaceState({...history.state,cocoNavigation:{session:navigationSession,position:navigationPosition,route}},'',location.href);}
 navigationRoutes.set(navigationPosition,route);
}
function backTo(route='home'){currentBoard.dataset.backRoute=route;}
function homeGreeting(date=new Date()){
 const hour=date.getHours();
 return hour>=5&&hour<12?['Good morning','☀️']:hour>=12&&hour<18?['Good evening','🌤️']:['Good night','🌙'];
}
function updateHomeGreeting(){
 const greeting=document.querySelector('.d-home-greeting');if(!greeting||!user())return;
 const [salutation,icon]=homeGreeting();
 greeting.querySelector('.d-greeting-salutation').textContent=salutation+' '+icon;
 greeting.querySelector('.d-greeting-name').textContent=user().name;
}
setInterval(updateHomeGreeting,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateHomeGreeting();});
function showPageBack(){
 document.querySelectorAll('.d-page-back,.d-page-header').forEach(el=>el.remove());
 const route=location.hash.slice(1)||'welcome';
 if(['login','register','server-login'].includes(route))return;
 let previous=navigationPosition-1;
 while(previous>=0&&user()&&/^(welcome|login|register)$/.test(navigationRoutes.get(previous)))previous--;
 const fallback=currentBoard?.isConnected?currentBoard.dataset.backRoute|| (user()?'home':'welcome'):(user()?'home':'welcome');
 const button=document.createElement('button');
 button.type='button';button.className='d-page-back';button.setAttribute('aria-label','Kembali');
 button.innerHTML='<svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 4-8 8 8 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 button.disabled=previous<0&&fallback===route;
 button.onclick=()=>{if(previous>=0)history.go(previous-navigationPosition);else go(fallback);};
 const shell=document.querySelector('.d-shell');
 if(!shell||!user()||route.startsWith('reference/')){document.body.append(button);return;}
 if(!route.startsWith('pet/')){
  const mask=document.createElement('div');mask.className='d-legacy-header-mask';mask.setAttribute('aria-hidden','true');currentBoard.append(mask);
 }
 const header=document.createElement('header');header.className='d-page-header';header.setAttribute('aria-label','Header halaman');
 const title=document.createElement('span');title.className='d-page-heading';title.textContent=route==='home'?'Hey '+user().name+',':currentBoard.querySelector('h1')?.textContent||'COCO';
 const avatar=document.createElement('a');avatar.href='#profile-edit';avatar.className='d-fixed-avatar';avatar.setAttribute('aria-label','Foto profil - buka About me');
 if(user().photo){const image=document.createElement('img');image.src=user().photo;image.alt=user().name;avatar.append(image);}else avatar.textContent=user().name.trim().slice(0,1).toUpperCase();
 currentBoard.querySelectorAll('.d-account-avatar').forEach(el=>{el.setAttribute('aria-hidden','true');el.tabIndex=-1;});
 if(route==='home'){
  header.classList.add('d-home-header');shell.classList.add('d-home-header-shell');
  title.classList.add('d-home-greeting');title.textContent='';
  for(const [tag,className,text] of [['span','d-greeting-salutation',''],['strong','d-greeting-name',''],['span','d-greeting-subtitle',"How’s your pet today?"]]){const line=document.createElement(tag);line.className=className;line.textContent=text;title.append(line);}
  header.append(title,avatar);
 }else header.append(button,title,avatar);
 document.body.append(header);updateHomeGreeting();
 shell.classList.add('d-has-fixed-header');
 if(route.startsWith('pet/'))shell.classList.add('d-hero-fixed-header');

}
function selectPet(box=[30,104,373,44]){
 const el=put(`<label class="d-layer" style="${designPositions(...box)}"><span class="sr-only">Hewan aktif</span><select id="pet-select" style="height:44px;min-height:44px;background:#f0f0f0;border:0;font-family:Fredoka">${user().pets.map(p=>`<option value="${p.id}" ${p.id===user().selectedPetId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`);return el;
}
function configureCatalog(){
 const values=[
  {name:'Josera Mini Deluxe',price:2900,design:'shopFood',art:[24,372,177,105],description:'900g'},
  {name:'Pedigree Chicken & Vege',price:5390,design:'shopFood',art:[225,372,176,105],description:'3kg'},
  {name:'BlackHawk Puppy Lamb & Rice',price:36500,design:'shopFood',art:[24,630,177,100],description:'20kg'},
  {name:'Royal Canin Labrador',price:11450,design:'shopFood',art:[225,630,176,100],description:'3kg'},
  {name:'Automatic Pet Feeder',price:24489,design:'shopIoT',art:[24,373,177,96],description:'',category:'Perangkat'},
  {name:'GPS Pet Tracker',price:10580,design:'shopIoT',art:[225,373,176,96],description:'',category:'Perangkat'}
 ];
 values.forEach((p,i)=>Object.assign(catalog[i],p));catalog[2].category='Makanan';catalog[3].category='Makanan';
 // These four original food listings are dog food, regardless of the active pet.
 catalog.slice(0,4).forEach((p,i)=>{p.targetSpecies='Anjing';p.brand=['Josera','Pedigree','BlackHawk','Royal Canin'][i];});
 const additions=[
  ['accessory1','Dog Collar',1390,'Aksesori','shopAccessories',0,''],
  ['accessory2','Warm fleece vest',1780,'Aksesori','shopAccessories',1,''],
  ['accessory3','Pet Nail Clipper & Claws Scissors',900,'Aksesori','shopAccessories',2,''],
  ['accessory4','Flea Comb',285,'Aksesori','shopAccessories',3,''],
  ['vet1','Wet Dog – Flea & Tick',700,'Vet Items','shopVet',0,'210ml'],
  ['vet2','Orondo Spray',2800,'Vet Items','shopVet',1,'250ml'],
  ['vet3','Nexgard – Afoxolaner',3480,'Vet Items','shopVet',2,'136mg'],
  ['vet4','Petro Mange Cream',650,'Vet Items','shopVet',3,'70g'],
  ['iot3','Fi Smart Collar',9200,'Perangkat','shopIoT',2,''],
  ['iot4','Petcube Pet Camera',15965,'Perangkat','shopIoT',3,'']
 ];
 for(const [id,name,price,category,design,i,description] of additions)if(!catalog.some(p=>p.id===id))catalog.push({id,name,price,category,design,art:[i%2?225:24,i<2?373:630,i%2?176:177,i<2?96:100],description,stock:10});
}
configureCatalog();
for(const p of window.COCO_EXTRA_FOOD||[])if(!catalog.some(item=>item.id===p.id))catalog.push(p);
window.COCO_CLOUD?.hydrateCatalog();
const savedAuth=async(data,register)=>{
 const email=data.email.trim().toLowerCase(),cloud=window.COCO_CLOUD;
 if(cloud?.enabled&&(register||!db.users.some(u=>u.email===email&&!u.serverAccount)||db.users.some(u=>u.email===email&&u.serverAccount))){if(register&&data.password!==data.confirm)throw Error('Kata sandi belum sama.');await cloud.authenticate(email,data.password,register?data.name.trim():undefined);if(register)toast('Akun server dibuat. Buka About me untuk verifikasi email.');go('home');return;}
 if(!cloud?.enabled&&db.users.some(u=>u.email===email&&u.serverAccount))throw Error('Server tidak terjangkau. Hubungkan server dahulu.');
 if(register){if(!data.name.trim())throw Error('Nama wajib diisi.');if(data.password.length<8)throw Error('Gunakan minimal 8 karakter.');if(data.password!==data.confirm)throw Error('Kata sandi belum sama.');if(db.users.some(u=>u.email===email))throw Error('Email sudah terdaftar di browser ini.');
  const salt=uid(),passwordHash=await hashPassword(data.password,salt),u={id:uid(),name:data.name.trim(),email,salt,passwordHash,pets:[],selectedPetId:null,cart:[],orders:[],bookings:[],address:'',checkoutDraft:{},bookingDraft:{}};db.users.push(u);db.session=u.id;
 }else{const u=db.users.find(u=>u.email===email);if(!u||await hashPassword(data.password,u.salt)!==u.passwordHash)throw Error('Email atau kata sandi tidak sesuai.');db.session=u.id;}
 if(persist())go('home');
};
async function authDesign(route,v){
 const register=route==='register';if(!await board(route,register?'Create an account':'Login',v,false))return;
 const f=formOnBoard(d=>savedAuth(d,register),register?[34,645,362,24]:[34,457,362,27]);
 if(register){
  inputAt(f,'Full name','name',[34,292,362,46],{placeholder:'Full name',attrs:'maxlength="80" autocomplete="name"'});
  inputAt(f,'Email address','email',[34,378,362,46],{type:'email',placeholder:'you@example.com',attrs:'autocomplete="email"'});
  inputAt(f,'Password','password',[34,464,362,46],{type:'password',placeholder:'At least 8 characters',attrs:'minlength="8" autocomplete="new-password"'});
  inputAt(f,'Confirm password','confirm',[34,550,362,46],{type:'password',placeholder:'Enter password again',attrs:'minlength="8" autocomplete="new-password"'});
  submitAt(f,'Create account',[29,670,373,60]);hit('Already have an account? Login',[48,742,335,44],'login');
 }else{
  inputAt(f,'Email address','email',[34,265,353,46],{type:'email',placeholder:'Email Address',background:'#edf4fa',css:'padding-left:54px;',attrs:'autocomplete="email"'});
  inputAt(f,'Password','password',[34,342,353,46],{type:'password',placeholder:'Password',background:'#edf4fa',css:'padding-left:54px;',attrs:'minlength="8" autocomplete="current-password"'});
  for(const [name,y,path] of [['email',277,'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>'],['password',354,'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>']])f.insertAdjacentHTML('beforeend',`<svg class="d-login-field-icon" data-field-icon="${name}" style="position:absolute;left:50px;top:${y}px;width:22px;height:22px;z-index:4;pointer-events:none;color:#67859b" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`);
  submitAt(f,'LOGIN',[48,484,318,46]);hit('Forgot Password?',[204,409,190,45],'forgot');
  for(const [label,y] of [['Google',636],['Facebook',697],['Apple',758]])hit('Login With '+label,[48,y,318,45],null,'social');
  hit("Don't have an account? Register",[65,820,300,44],'register');
 }
}
async function welcomeDesign(v){const name=['welcome','onboarding2','onboarding3'][onboarding];if(!await board(name,['Hey! Welcome','A world of care','Your companion'][onboarding],v,false))return;hit(onboarding<2?'Next':'Get started',[31,824,367,55],null,'next');hit('Login',[305,887,90,44],'login');}
async function homeDesign(v){
 const u=user();if(!await board(u.pets.length?'home':'firstRun',u.pets.length?'Home':'Welcome to COCO',v))return;
 if(!u.pets.length){hit('Add my first pet',[30,774,373,60],'pet-new');hit('Explore the shop',[22,262,386,105],'shop');backTo('profile');return;}
 clearOriginal([20,44,285,50]);
 textAt('Hey '+u.name+',',[68,60,250,27],{size:15,weight:600,color:'white',background:'#4b82b2'});
 hit('Notifications',[283,96,125,40],'notifications');
 // Remove the old card and its backdrop blur instead of cutting a rectangular
 // hole through a filtered SVG group (which leaves an inset shadow behind).
 const sourceCard=[...currentBoard.querySelectorAll('.d-vector > svg rect[fill]')].find(rect=>Number(rect.getAttribute('width'))===397&&Number(rect.getAttribute('height'))===168);
 if(sourceCard){const group=sourceCard.parentElement,blur=group.previousElementSibling;if(blur?.localName==='foreignObject')blur.remove();group.remove();}
 put(`<section class="d-layer d-card d-home-pets-card" style="${designPositions(17,141,397,168)}" aria-label="My Pets"><h2><span aria-hidden="true">${fragment('home',[39,158,28,28])}</span>My Pets</h2><div class="d-home-pet-list">${u.pets.map((p,i)=>`<a href="#pet/${p.id}" aria-label="${esc(p.name)}">${petArt(i,90)}<p>${esc(p.name)}</p></a>`).join('')}</div></section>`);
 hit('Tambah hewan',[39,151,330,34],'pet-new');
 blockAt('<p class="d-muted" style="text-align:center;padding:62px 5px 0">No device connected</p>',[38,385,159,197]);
 blockAt(`<div class="r-home-status" aria-label="Pet Status">${u.pets.map((p,i)=>`<a class="r-home-status-pet" href="#pet/${p.id}" aria-label="Pet Status: ${esc(p.name)}">${petArt(i,42)}<span class="r-home-status-metrics">${['Health','Food','Mood'].map(kind=>`<span class="r-home-status-metric ${kind.toLowerCase()}" aria-label="${kind}: no device data"><span>${kind}</span><span class="r-home-status-track" aria-hidden="true"></span><span class="r-home-status-value" aria-hidden="true">—</span></span>`).join('')}</span></a>`).join('')}</div>`,[236,386,173,193]);
 hit('Track Pets',[30,578,180,38],'location');hit('Check Pets',[230,578,180,38],'status');
 cleanBody('white',638);
 put(`<section class="d-clean-content d-home-food" style="margin-top:642px;margin-left:17px;width:397px"><article class="d-card d-flow"><h2 class="d-food-heading"><span aria-hidden="true">${fragment('home',[39,658,28,27])}</span>Pet Food</h2>${catalog.filter(p=>(!window.COCO_CLOUD?.active||p.serverActive!==false)&&p.category==='Makanan'&&(!pet()||pet().species==='Lainnya'||p.targetSpecies===pet().species)).slice(0,4).map((p,i)=>`<a class="d-food-row" href="#product/${p.id}" aria-label="${esc(p.name)}">${itemArt(catalog.indexOf(p),70)}<span class="d-food-copy"><small>${esc(p.brand||p.targetSpecies||'Pet Food')}</small><strong>${esc(p.name)}</strong><span>${esc(p.description)}</span></span><span class="d-food-bag" aria-hidden="true">${fragment('home',[332,725,45,45])}</span></a>`).join('')}</article></section>`);
}
async function petFormDesign(id,v){
 const p=user().pets.find(p=>p.id===id);
 if(!await board(user().pets.length?'addPet':'firstPet',p?'Edit pet':'Add Pets',v))return;
 headerName(p?'Edit Pet':'Add Pets');backTo(p?'pet/'+p.id:'home');
 const body=flowBody('<div id="pet-form"></div>');
 inlineForm(`${photoPicker('Foto hewan',p?.photo)}<label>Pet Name<input name="name" required maxlength="60" value="${esc(p?.name||'')}"></label><label>Species<select name="species">${['Anjing','Kucing','Kelinci','Hamster','Burung','Ikan','Kura-kura','Marmut','Lainnya'].map(x=>`<option ${p?.species===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Breed Name<input name="breed" maxlength="80" value="${esc(p?.breed||'')}"></label><label>Sex<select name="sex">${['Female','Male','Unknown'].map(x=>`<option ${(p?.sex||'Unknown')===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Date of birth<input name="dob" type="date" max="${today()}" value="${esc(p?.dob||'')}"></label><label>Colour<input name="colour" maxlength="80" value="${esc(p?.colour||'')}"></label><label>Height (cm)<input name="height" type="number" min="0.01" step="0.01" value="${esc(p?.height||'')}"></label><label>About your pet<textarea name="description" aria-label="About your pet" maxlength="2000">${esc(p?.description||'')}</textarea></label><label>Weight (kg)<input name="weight" type="number" required min="0.01" max="1000" step="0.01" value="${esc(p?.weight||'')}"></label>`,p?'Save pet':'Add Pet',async data=>{data.photo=await readPhoto(data.photoUpload,p?.photo);savePet(data,p);},body.querySelector('#pet-form'));
 wirePhotoPreview();
 if(p)put(`<button type="button" class="d-flow-button secondary" data-command="delete-pet" data-id="${p.id}">Delete pet</button>`,body);
 put(flowLink('Back to home','home',true),body);
}
function savePet(data,p){if(!data.name.trim())throw Error('Nama hewan wajib diisi.');if(!(Number(data.weight)>0))throw Error('Berat harus lebih dari nol.');if(data.dob&&data.dob>today())throw Error('Tanggal lahir tidak boleh di masa depan.');const values={description:(data.description||'').trim(),photo:data.photo||'',name:data.name.trim(),species:data.species.trim(),breed:data.breed.trim(),dob:data.dob,weight:Number(data.weight),colour:data.colour||'',height:data.height||'',sex:data.sex||p?.sex||'Unknown'};if(p)Object.assign(p,values);else{p={...values,id:uid(),records:[]};user().pets.push(p);user().selectedPetId=p.id;}if(persist()){toast('Data hewan tersimpan');go('pet/'+p.id);}}
async function petDesign(id,v){return referencePetDesign(id,v);}
function inlineForm(contents,label,handler,parent){
 parent.innerHTML=`<form class="d-form-inline" id="form">${contents}<p id="form-error" class="d-error" role="alert" hidden></p><button type="submit" class="d-button">${label}</button></form>`;
 bindForm(handler);return parent.querySelector('form');
}
async function recordsDesign(v){const p=pet();if(!p){go('pet-new');return;}if(!await board('records','Medical Records',v))return;backTo('pet/'+p.id);hit('Wellness',[55,85,120,35],'wellness');
 const body=flowBody('<div id="records-body" class="d-flow"></div>',{top:140,headerBottom:120,left:22,width:386});
 const list=body.querySelector('#records-body');list.innerHTML=`<h2 style="font-size:24px;margin:0">${esc(p.name)} · Care records</h2><div id="record-form"></div><div class="d-flow">${p.records.length?[...p.records].reverse().map(r=>`<article class="d-card" style="padding:16px;border:1px solid #ddd"><h3>${esc(r.type)}</h3><p>${esc(r.note)}</p><div class="d-record-meta"><small>${esc(r.date)}</small><button type="button" class="d-small-link" data-command="delete-record" data-id="${r.id}">Delete</button></div></article>`).join(''):'<p class="d-muted">No records yet</p>'}</div>`;
 inlineForm(`<label>Type<select name="type"><option>Perawatan</option><option>Vaksinasi</option><option>Alergi</option><option>Pengobatan</option><option>Makan</option><option>Suasana hati</option></select></label><label>Date<input name="date" type="date" required max="${today()}" value="${today()}"></label><label>Note<textarea name="note" required maxlength="2000"></textarea></label>`,'Add care record',data=>{if(!data.note.trim()||data.date>today())throw Error('Periksa catatan dan tanggal.');p.records.push({...data,note:data.note.trim(),id:uid()});if(persist()){toast('Catatan tersimpan');render();}},list.querySelector('#record-form'));
 fitContent();
}
async function shopDesign(v){
 if(window.COCO_CLOUD?.active)try{await window.COCO_CLOUD.refreshCatalog();}catch(e){toast(e.message);}
if(filter==='Semua')filter='Makanan';const name=filter==='Aksesori'?'shopAccessories':filter==='Perangkat'?'shopIoT':filter==='Vet Items'?'shopVet':'shopFood';if(!await board(name,'Shop',v))return;
 hit('Keranjang ('+user().cart.reduce((n,c)=>n+c.qty,0)+')',[373,44,51,47],'cart');
 const searchField=put(`<label class="sr-only" for="search">Search products</label><input id="search" class="d-layer d-input" style="${designPositions(74,125,321,45)}background:#f4f4f8" value="${esc(search)}" placeholder="Search keywords..">`);
 clearOriginal([74,125,321,45]);
 const categoryBoxes=[[51,201,65,80],[137,201,65,80],[219,201,65,80],[300,201,75,80]];
 ['Makanan','Vet Items','Aksesori','Perangkat'].forEach((c,i)=>hit(c,categoryBoxes[i],null,'category').dataset.value=c);
 hit('Check Retail Stores',[255,309,149,28],'retail');hit('Care services',[21,94,386,26],'services');
 cleanBody('#f7f7f7',344);
 const speciesOptions=['Semua',...new Set(catalog.filter(p=>p.category==='Makanan').map(p=>p.targetSpecies).filter(Boolean))];
 const speciesControl=filter==='Makanan'?`<label class="r-species-filter">Jenis hewan<select id="food-species">${speciesOptions.map(value=>`<option ${foodSpecies===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>`:'';
 const results=put('<section class="d-clean-content d-shop-content" style="margin-top:350px;margin-left:21px;width:382px">'+speciesControl+'<div id="products" class="d-product-grid"></div>'+topBrands()+'</section>');
 const repaint=()=>{
  const entries=catalog.filter(p=>(!window.COCO_CLOUD?.active||p.serverActive!==false)&&(filter==='Semua'||p.category===filter||filter==='Makanan'&&p.category==='Makanan')&&(filter!=='Makanan'||foodSpecies==='Semua'||p.targetSpecies===foodSpecies)&&[p.name,p.targetSpecies,p.brand].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()));
  results.querySelector('#products').innerHTML=entries.map(p=>{const c=user().cart.find(c=>c.id===p.id),i=catalog.indexOf(p);return `<article class="d-product"><a href="#product/${p.id}" aria-label="${esc(p.name)}">${itemArt(i,96)}</a><p style="color:#4b82b2">${demoPrice(p.price)}</p><h2>${esc(p.name)}</h2><p class="d-muted">${esc(p.description)}${p.targetSpecies?' ? '+esc(p.targetSpecies):''}</p>${c?`<div class="d-quantity"><button aria-label="Kurangi ${esc(p.name)}" data-command="quantity" data-id="${p.id}" data-step="-1">−</button><span>${c.qty}</span><button aria-label="Tambah ${esc(p.name)}" data-command="quantity" data-id="${p.id}" data-step="1">＋</button></div>`:`<button aria-label="Add to cart" data-command="add-item" data-id="${p.id}"><span class="d-cart-icon" aria-hidden="true">${fragment('shopFood',[67,552,18,21])}</span>Add to cart</button>`}</article>`;}).join('')||'<p>No products found.</p>';
  hydrate(results);fitContent();
 };
 document.querySelector('#food-species')?.addEventListener('change',e=>{foodSpecies=e.target.value;repaint();});
 repaint();document.querySelector('#search').addEventListener('input',e=>{search=e.target.value;repaint();});
}
async function productDesign(id,v){const p=catalog.find(p=>p.id===id)||catalog[0];if(!await board('product',p.name,v))return;backTo('shop');
 headerName(p.name);
 flowBody(`<figure class="d-product-hero" aria-label="${esc(p.name)}">${itemArt(catalog.indexOf(p),290)}</figure><article class="d-product-details"><h2>${esc(p.name)}</h2>${p.description?`<p class="d-muted">${esc(p.description)}</p>`:''}<p class="d-detail-price">${demoPrice(p.price)}</p><p class="d-muted">Stok lokal: ${p.stock}</p></article><button class="d-flow-button" data-command="add-item" data-id="${p.id}">Add to cart</button>`,{background:'#f7f7f7',top:110,left:22,width:386});
 hit('Cart',[365,39,54,55],'cart');
}
async function cartDesign(v){const u=user();if(!await board(u.cart.length?'cart':'emptyCart','Cart',v))return;backTo('shop');
 if(!u.cart.length){hit('Browse the shop',[30,774,373,60],'shop');return;}
 flowBody(`<div class="d-flow">${u.cart.map(item=>{const p=catalog.find(p=>p.id===item.id);return `<article class="d-cart-line">${itemArt(catalog.indexOf(p),72)}<div class="d-cart-description"><h2>${esc(p.name)}</h2><p class="d-price">${demoPrice(p.price*item.qty)}</p><div class="d-quantity"><button aria-label="Kurangi ${esc(p.name)}" data-command="quantity" data-id="${p.id}" data-step="-1">−</button><span>${item.qty}</span><button aria-label="Tambah ${esc(p.name)}" data-command="quantity" data-id="${p.id}" data-step="1">＋</button><button aria-label="Hapus ${esc(p.name)}" data-command="remove-item" data-id="${p.id}" class="d-remove">×</button></div></div></article>`;}).join('')}</div><p class="d-total">Subtotal: ${demoPrice(cartTotal())}</p>${flowLink('Checkout','checkout')}<button class="d-flow-button secondary" data-command="clear-cart">Clear cart</button>`,{background:'#f7f7f7',left:30,width:370});
}
async function checkoutDesign(v){if(!user().cart.length){go('cart');return;}if(!await board('checkout','Checkout',v))return;backTo('cart');const u=user(),d=u.checkoutDraft;
 const body=flowBody('<div id="checkout-form" class="d-settings-form"></div>');
 const f=inlineForm(`<article class="d-card d-flow"><h2>Delivery address</h2><label>Recipient<input name="recipient" required maxlength="80" value="${esc(d.recipient||u.name)}"></label><label>Phone<input name="phone" type="tel" required pattern="[+0-9 ()-]{8,20}" value="${esc(d.phone||u.phone||'')}"></label><label>Delivery address<textarea name="address" required maxlength="500" rows="3">${esc(d.address||u.address)}</textarea></label></article><article class="d-card"><h2>Order summary</h2><p>${u.cart.reduce((n,c)=>n+c.qty,0)} products · Quantities as shown in Cart</p></article><article class="d-card d-flow"><h2>Payment summary</h2><div class="d-summary-line"><span>Subtotal</span><b>${demoPrice(cartTotal())}</b></div><div class="d-summary-line"><span>Delivery</span><b>${demoPrice(deliveryFee())}</b></div><div class="d-summary-line d-total"><span>Total</span><b>${demoPrice(cartTotal()+deliveryFee())}</b></div></article>`,'Continue to payment',data=>{if(!data.recipient.trim()||!data.address.trim())throw Error('Nama dan alamat wajib diisi.');u.checkoutDraft=data;u.address=data.address;if(persist())go('payment');},body.querySelector('#checkout-form'));
 f.addEventListener('input',()=>{u.checkoutDraft=Object.fromEntries(new FormData(f));persist();});
}
async function paymentDesign(v){
 if(window.COCO_CLOUD?.active)return serverPaymentDesign(v);
if(!user().cart.length){go('cart');return;}if(!await board('payment','Payment · Local simulation',v))return;backTo('checkout');
 const b=flowBody('<article class="d-card d-flow"><h2>Payment simulation</h2><p>No real payment is collected.</p><div id="payment-form"></div></article>',{background:'#f7f7f7'});
 inlineForm(`<p>Total: <b>${demoPrice(cartTotal()+520)}</b></p><label>Simulation result<select name="outcome"><option value="success">Success</option><option value="failed">Failed</option></select></label>`,'Confirm simulation',data=>{if(data.outcome==='failed'){go('payment-failed');return;}const u=user(),d=u.checkoutDraft;u.orders.unshift({id:uid(),createdAt:new Date().toISOString(),items:u.cart.map(c=>({...c,name:catalog.find(p=>p.id===c.id).name,price:catalog.find(p=>p.id===c.id).price})),total:cartTotal()+520,address:d.address,recipient:d.recipient,phone:d.phone,status:'Pesanan simulasi'});u.cart=[];u.checkoutDraft={};if(persist())go('order-success');},b.querySelector('#payment-form'));
}
async function ordersDesign(v){if(window.COCO_CLOUD?.active)try{await window.COCO_CLOUD.flush();const value=await window.COCO_CLOUD.request('orders');user().orders=[...value.orders,...user().orders.filter(o=>!o.serverManaged)];persist();}catch(e){toast(e.message);}if(!await board('orders','My Orders',v))return;backTo('profile');
 const items=user().orders;flowBody(`${items.length?items.map(o=>`<article class="d-card d-flow"><h2>Order · ${esc(o.status)}</h2><p>${new Date(o.createdAt).toLocaleString('id-ID')}</p>${o.items.map(i=>`<p>${esc(i.name)} × ${i.qty}</p>`).join('')}<p class="d-price">${demoPrice(o.total,o.currency)}</p><p>${esc(o.address)}</p>${o.serverManaged?`<p>Status pembayaran: ${esc(({unpaid:'Menunggu pembayaran',paid:'Sudah dibayar',cancelled:'Dibatalkan',expired:'Kedaluwarsa',refunded:'Dana dikembalikan'})[o.paymentStatus]||o.paymentStatus)}</p>${o.paymentStatus==='unpaid'?`<p class="r-payment-instructions">${esc(o.paymentInstructions||'Hubungi pengelola toko untuk instruksi pembayaran.')}</p>${o.expiresAt?`<p>Batas pembayaran: ${esc(new Date(o.expiresAt).toLocaleString('id-ID'))}</p>`:''}`:''}${o.trackingNumber?`<p>${esc(o.courier)} ? Resi: ${esc(o.trackingNumber)}</p>`:''}`:''}${o.serverManaged&&o.paymentStatus==='unpaid'?`<button class="d-flow-button secondary" data-command="cancel-server-order" data-id="${o.id}">Batalkan pesanan</button>`:''}</article>`).join(''):'<article class="d-card"><h2>No orders yet</h2><p>Your local orders will appear here.</p></article>'}${flowLink('Browse shop','shop')}`);
}
async function profileDesign(v){const u=user();if(!await board('profile','Profile',v))return;backTo('home');headerName(u.name);
 const svg=currentBoard.querySelector('.d-vector>svg');
 const rect=[...svg.querySelectorAll('rect')].find(r=>Number(r.getAttribute('width'))===430&&Number(r.getAttribute('height'))===348);
 const pattern=svg.querySelector(rect.getAttribute('fill').slice(4,-1));
 const ns='http://www.w3.org/2000/svg',background=document.createElementNS(ns,'rect'),image=document.createElementNS(ns,'image');
 for(const [key,value] of Object.entries({width:1,height:1,fill:'white'}))background.setAttribute(key,value);
 for(const [key,value] of Object.entries({href:'assets/images/logo.png',width:1,height:1,preserveAspectRatio:'xMidYMid meet',class:'d-profile-brand'}))image.setAttribute(key,value);
 pattern.replaceChildren(background,image);
 textAt(u.name,[61,430,230,34],{size:23,weight:650,background:'white'});textAt(u.email,[110,480,260,29],{size:17,background:'white'});textAt(u.phone||'Add phone number',[110,533,260,29],{size:17,background:'white'});
 hit('Sign out',[304,424,94,48],null,'logout');
 [['About me','profile-edit',593],['My Orders','orders',643],['My Address','addresses',694],['Add Pet','pet-new',743],['Add Device','device-add',792],['Help & support','help',823]].forEach(([l,r,y])=>hit(l,[31,y,369,48],r));
}
async function profileEditDesign(v,addresses=false){const u=user();if(!await board(addresses?'addresses':'about',addresses?'My Address':'About me',v))return;backTo('profile');
 const parent=flowBody('<div id="profile-form" class="d-settings-form"></div>'+(!addresses?flowLink('Ganti password','change-password',true)+flowLink('Penyimpanan server','server',true)+(u.serverAccount?flowLink(u.emailVerified?'Email terverifikasi':'Verifikasi email','verify-email',true):''):'')+'<div class="d-settings-links">'+flowLink('My bookings','bookings',true)+flowLink('Backup data','backup',true)+'</div>');
 inlineForm(`${addresses?'':`${photoPicker('Foto profil',u.photo)}<label>Full name<input name="name" required maxlength="80" value="${esc(u.name)}"></label><label>Email address<input type="email" value="${esc(u.email)}" readonly aria-readonly="true"></label><label>Phone number<input name="phone" type="tel" value="${esc(u.phone||'')}"></label>`}<label>Delivery address<textarea name="address" maxlength="500" rows="3">${esc(u.address)}</textarea></label>`,'Save',async data=>{if(!addresses){const photo=await readPhoto(data.photoUpload,u.photo);if(!data.name.trim())throw Error('Nama wajib diisi.');u.name=data.name.trim();u.phone=data.phone.trim();u.photo=photo;}u.address=data.address.trim();if(persist()){toast('Profil tersimpan');go('profile');}},parent.querySelector('#profile-form'));if(!addresses)wirePhotoPreview();
}
async function changeLocalPassword(password,confirmation,currentPassword){
 const account=user();if(!account)throw Error('Silakan login terlebih dahulu.');
 if(typeof password!=='string'||password.length<8||password.length>1024||!password.trim())throw Error('Password harus berisi 8–1024 karakter.');
 if(password!==confirmation)throw Error('Konfirmasi password belum sama.');
 if(account.serverAccount){await window.COCO_CLOUD.password(currentPassword,password);return;}
 const salt=uid(),passwordHash=await hashPassword(password,salt);
 if(user()!==account)throw Error('Sesi berubah. Silakan buka kembali halaman ini.');
 const previous={salt:account.salt,passwordHash:account.passwordHash};
 Object.assign(account,{salt,passwordHash});
 if(!persist()){Object.assign(account,previous);throw Error('Password belum tersimpan. Coba lagi setelah penyimpanan tersedia.');}
}
async function changePasswordDesign(v){
 if(!await board('about','Ganti password',v))return;backTo('profile-edit');
 const parent=flowBody(`<article class="d-card d-flow"><h2>Ganti password</h2><p>Akun: ${esc(user().email)}</p><p>${user().serverAccount?'Untuk akun server, masukkan password saat ini dan password baru.':'Kamu masih login, jadi kamu bisa membuat password baru tanpa password lama.'} Data profil dan hewan tetap tersimpan.</p></article><div id="password-form" class="d-settings-form"></div>`);
 const form=inlineForm((user().serverAccount?'<label>Password saat ini<input name="currentPassword" type="password" required autocomplete="current-password"></label>':'')+'<label>Password baru<input name="password" type="password" required minlength="8" maxlength="1024" autocomplete="new-password"></label><label>Konfirmasi password baru<input name="confirmation" type="password" required minlength="8" maxlength="1024" autocomplete="new-password"></label>','Simpan password',async data=>{await changeLocalPassword(data.password,data.confirmation,data.currentPassword);form.reset();toast('Password berhasil diganti. Gunakan password baru saat login berikutnya.');},parent.querySelector('#password-form'));
}
async function backupDesign(v){if(!await board('about','Backup data',v))return;backTo('profile');headerName('Backup data');
 flowBody('<article class="d-card d-flow"><h2>Cadangan data</h2><p>File berisi profil, hewan, alamat, dan riwayat akun lokal ini. Simpan secara pribadi.</p><button class="d-flow-button" data-action="export">Unduh cadangan JSON</button><label>Pulihkan data akun dari cadangan<input type="file" id="import" accept="application/json,.json"></label></article>');document.querySelector('#import').addEventListener('change',importBackup);
}
async function bookingPetDesign(v){if(!user().pets.length){go('pet-new');return;}if(!await board('bookingPet','Choose a pet',v))return;backTo('shop');
 flowBody(`<h2>Pick your pet</h2>${user().pets.map((p,i)=>`<button type="button" class="d-pet-row" data-command="book-pet" data-id="${p.id}">${petArt(i,60)}<h3>${esc(p.name)}</h3></button>`).join('')}`);
}
async function bookingDesign(id,v){
 if(window.COCO_CLOUD?.active){if(id){toast('Batalkan booking server lama lalu buat jadwal baru.');go('bookings');return;}return serverCalendarDesign(v);}

 if(!user().pets.length){go('pet-new');return;}
 const u=user(),existing=u.bookings.find(b=>b.id===id);
 if(existing&&u.bookingDraft.id!==id)u.bookingDraft={...existing};
 const d=u.bookingDraft;d.petId=d.petId||u.selectedPetId;d.service=d.service||'Konsultasi dokter hewan';d.provider=d.provider||'Dr. Nambuvan';
 if(!await board('booking',existing?'Reschedule':'Choose a Date',v))return;backTo(d.sourcePetId?'pet/'+d.sourcePetId:'booking-pet');
 headerName(d.provider);
 textAt('Pet: '+(u.pets.find(p=>p.id===d.petId)?.name||'Choose a pet'),[31,120,361,32],{size:19,weight:500,background:window.COCO_THEME.background});
 const card=blockAt('<div id="calendar" style="background:white;border-radius:12px;box-shadow:0 18px 40px #0002;padding:23px 25px;height:356px"></div>',[31,182,361,356],'transparent');
 const calendar=card.querySelector('#calendar');
 const draw=()=>{
  const start=(new Date(bookingYear,bookingMonth,1).getDay()+6)%7,days=new Date(bookingYear,bookingMonth+1,0).getDate();
  calendar.innerHTML=`<div class="d-row" style="justify-content:center;margin-bottom:15px"><label><span class="sr-only">Month</span><select id="booking-month" aria-label="Month" style="border:0;width:105px;background:#f8f6fa;color:#4b82b2;font-size:15px;height:40px;min-height:40px;padding:8px">${Array.from({length:12},(_,i)=>`<option value="${i}" ${i===bookingMonth?'selected':''}>${new Date(2026,i,1).toLocaleString('en',{month:'long'})}</option>`).join('')}</select></label><label><span class="sr-only">Year</span><select id="booking-year" aria-label="Year" style="border:0;width:90px;background:white;font-size:15px;height:40px;min-height:40px;padding:8px">${Array.from({length:4},(_,i)=>new Date().getFullYear()+i).map(y=>`<option ${y===bookingYear?'selected':''}>${y}</option>`).join('')}</select></label></div><div class="d-calendar">${['M','Tu','W','Th','Fri','Sa','Su'].map(t=>`<b style="height:30px;font-weight:500">${t}</b>`).join('')}${Array.from({length:start},()=>'<span></span>').join('')}${Array.from({length:days},(_,i)=>{const date=`${bookingYear}-${String(bookingMonth+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;return `<button type="button" data-command="book-date" data-value="${date}" class="${d.date===date?'selected':''}" ${date<today()?'disabled':''} aria-label="${date}" aria-pressed="${d.date===date}">${i+1}</button>`;}).join('')}</div>`;
  calendar.querySelector('#booking-month').addEventListener('change',e=>{bookingMonth=Number(e.target.value);draw();});
  calendar.querySelector('#booking-year').addEventListener('change',e=>{bookingYear=Number(e.target.value);draw();});
 };
 draw();
 clearOriginal([30,621,360,154]);
 const slots=[['09:30','9:30'],['10:30','10:30'],['11:30','11:30'],['15:30','3:30'],['16:30','4:30'],['17:30','5:30']];
 slots.forEach(([value,label],i)=>{const x=i%2?224:31,y=623+Math.floor(i/2)*54;nativeButton(label,[x,y,164,40],null,'book-time',d.time===value?'':'secondary').dataset.value=value;});
 hit('Book an Appointment',[30,793,373,60],null,'review-booking');
 const selected=put(`<p class="d-layer d-static-note" style="${designPositions(32,548,365,30)}">${d.date?esc(d.date):'Select a future date'}${d.time?' · '+esc(d.time):''}</p>`);
}
async function bookingReviewDesign(v){if(window.COCO_CLOUD?.active)return serverBookingReviewDesign(v);const d=user().bookingDraft,p=user().pets.find(p=>p.id===d.petId);if(!p||!d.date||!d.time){go('booking-pet');return;}if(!await board('bookingConfirm','Review booking',v))return;backTo('booking-date');
 flowBody(`<article class="d-card d-flow"><h2>Pet & service</h2><p>${esc(p.name)} · ${esc(d.service)}</p><p>${esc(d.provider)}</p></article><article class="d-card d-flow"><h2>Date & time</h2><p>${esc(d.date)} · ${esc(d.time)}</p></article><article class="d-card d-flow"><h2>Local booking</h2><p>${demoPrice(150000)} · simulation</p><p class="d-muted">${window.COCO_CLOUD?.active?'Menunggu konfirmasi pengelola setelah dikirim.':'Not sent to the provider.'}</p></article><button class="d-flow-button" data-command="confirm-booking">Confirm booking</button>`);
}
async function bookingsDesign(v){if(window.COCO_CLOUD?.active)try{await window.COCO_CLOUD.flush();const value=await window.COCO_CLOUD.request('bookings');user().bookings=value.bookings;persist();}catch(e){toast(e.message);}if(!await board('bookings','My Bookings',v))return;backTo('profile');
 const list=user().bookings;
 flowBody(`${list.length?list.map(b=>`<article class="d-card d-flow"><h2>${esc(b.service)}</h2><p>${esc(user().pets.find(p=>p.id===b.petId)?.name||'Hewan dihapus')} · ${esc(b.date)} ${esc(b.time)}</p><p>${esc(b.provider)} · ${esc(b.status)}</p>${b.providerContact?.address?`<p>${esc(b.providerContact.address)}</p>`:''}${b.providerContact?.phone?`<p>Kontak: ${esc(b.providerContact.phone)}</p>`:''}<small>${demoPrice(b.price,b.currency)} · ${b.serverManaged?'booking server':'local simulation'}</small>${['Dibatalkan','Ditolak','Selesai'].includes(b.status)?'':`<div class="d-row"><a class="d-small-link" href="#booking-edit/${b.id}">Reschedule</a><button class="d-small-link" data-command="cancel-booking" data-id="${b.id}" style="background:transparent">Cancel</button></div>`}</article>`).join(''):'<article class="d-card"><h2>No bookings yet</h2><p>Find care services for your pet.</p></article>'}${flowLink('Find services','services')}`);
}
async function servicesDesign(name,v,petId){if(window.COCO_CLOUD?.active)return serverServicesDesign(name,v,petId);if(!await board(name,name==='vets'?'Veterinary':name==='grooming'?'Grooming':'Boarding',v))return;backTo('shop');
 const contextPet=user().pets.find(p=>p.id===petId),suffix=contextPet?'/'+contextPet.id:'';
 for(const [i,kind] of ['vets','grooming','boarding'].entries())hit(kind==='vets'?'Veterinary':kind==='grooming'?'Grooming':'Boarding',[22+i*151,168,i===1?130:84,93],kind+suffix);
 for(const y of [325,480,635]){hit('View '+name+' details',[21,y,265,135],'provider/'+name+suffix);const book=hit('Book local '+name+' service',[290,y,116,135],null,'service');book.dataset.value=name;book.dataset.petId=contextPet?.id||'';}
 hit('My Bookings',[30,805,373,55],'bookings');
}
async function unavailableDesign(route,v){
 if(route==='devices'&&window.COCO_CLOUD?.active){await serverDevicesDesign(v);return;}

 const source=route==='location'?'locationOffline':route==='device-add'?'addDevice':'devices';
 if(!await board(source,route==='location'?'Pet Location':route==='device-add'?'Add Device':'Devices',v))return;backTo('home');
 if(route==='location'){
  if(pet())headerName(pet().name);
  const locationBody=flowBody('<article class="d-card d-flow"><h2>No device connected</h2><p>Connect a GPS collar to receive location updates.</p></article><article class="d-card d-flow"><h2>No location data</h2><p>No live or last-known position is available.</p></article>'+flowLink('Devices','devices')+(pet()?flowLink('Pet details','pet/'+pet().id,true):''));
  if(user().pets.length>1){locationBody.insertAdjacentHTML('afterbegin','<label>Change pet<select id="pet-select">'+user().pets.map(p=>`<option value="${p.id}" ${p.id===user().selectedPetId?'selected':''}>${esc(p.name)}</option>`).join('')+'</select></label>');}
 }else if(route==='devices'){
  flowBody('<article class="d-card d-flow"><h2>No devices connected</h2><p>Pair a collar, feeder or camera to begin.</p></article>'+flowLink('Add Device','device-add')+'<section class="d-flow"><h2>Explore</h2>'+flowLink('Fi Smart Collar','device-detail',true)+flowLink('Activity Tracker','activity',true)+flowLink('Sleep Monitor','sleep',true)+flowLink('Petcube Pet Camera','camera',true)+flowLink('Food Dispenser','feeder',true)+'</section>');
 }else{
  cleanBody('#f7f7f7',194);
  put(`<section class="d-clean-content d-device-options" style="margin-top:214px;margin-left:33px;width:363px">${['Smart Collar','Pet Feeder','GPS Tracker','Pet Camera','Petcube Play','Petcube bites','GPS Pet Tracker'].map((name,i)=>`<a href="#pair-permission" aria-label="${name}">${deviceArt(i)}<span>${name}</span><span aria-hidden="true">${fragment('addDevice',[343,241,24,24])}</span></a>`).join('')}</section>`);
  hit('Scan Device',[252,114,160,32],'pair-permission');
 }
}
async function stateDesign(name,title,v,buttons,message){
 if(!await board(name,title,v))return;backTo('home');
 if(message){const body=flowBody(`<article class="d-card d-flow">${message}</article><div class="d-state-actions">${buttons.map(([label,route])=>flowLink(label,route)).join('')}</div>`);body.classList.add('d-state-content');}
 else for(const [label,route,y=774] of buttons)nativeButton(label,[30,y,373,60],route);
}
async function helpDesign(v){if(!await board('help','Help & support',v))return;backTo('profile');
 flowBody('<article class="d-card d-flow"><h2>COCO Local</h2><p>Data is stored in this browser. Payments and service bookings are local simulations.</p><p>Device integrations and email services are not connected.</p><a href="#backup" class="d-small-link">Export or restore a backup</a><a href="#bookings" class="d-small-link">My Bookings</a><a href="#reviews/app" class="d-small-link">Reviews</a><a href="#designs" class="d-small-link">View all original Figma screens</a></article>'+flowLink('Back to profile','profile'));
}
async function forgotDesign(v){
 if(window.COCO_CLOUD?.enabled){if(!await board('about','Lupa password',v,false))return;backTo('login');const body=flowBody('<article class="d-card d-flow"><h2>Lupa password server</h2><p>Masukkan email akun server. Tautan reset berlaku 30 menit.</p><div id="reset-form"></div></article>');inlineForm('<label>Email akun<input name="email" type="email" required autocomplete="email"></label>','Minta reset password',async d=>{const result=await window.COCO_CLOUD.request('auth/forgot','POST',{email:d.email},false);const status=document.createElement('p');status.setAttribute('role','status');status.textContent=result.message+(window.COCO_CLOUD.health?.mail==='development-outbox'?' Mode trial: tautan ada di outbox pengelola server.':' Periksa kotak masuk dan folder spam.');body.querySelectorAll('[data-reset-result]').forEach(e=>e.remove());status.dataset.resetResult='true';body.append(status);},body.querySelector('#reset-form'));return;}
if(!await board('forgot','Forgot password',v,false))return;
 flowBody('<article class="d-card d-flow"><h2>Local account</h2><p>This version has no email reset service. Log in using the password created in this browser, or create another local account.</p></article>'+flowLink('Back to login','login'));hit('Login',[30,40,50,50],'login');
}
function galleryDesign(){app.innerHTML=`<main class="d-gallery"><h1>Original Figma screens</h1><p>107 native SVG exports · original artwork and reference data.</p><p><a href="#${user()?'home':'welcome'}">‹ Back to COCO</a></p><div class="d-gallery-grid">${Object.keys(designs).map((n,i)=>`<a href="#reference/${n}">${String(i+1).padStart(3,'0')} · ${esc(n)}</a>`).join('')}</div></main>`;}
async function referenceDesign(name,v){if(!designs[name]){go('designs');return;}if(!await board(name,'Figma reference · '+name,v,false))return;
 app.insertAdjacentHTML('afterbegin',`<div class="d-ref-banner">Original Figma reference · ${esc(name)} · example data, not account data. <a href="#designs">All screens</a></div>`);
 const names=Object.keys(designs),i=names.indexOf(name);referenceIndex=i;
 app.insertAdjacentHTML('beforeend',`<div class="d-ref-actions">${i>0?`<a href="#reference/${names[i-1]}">‹ Previous</a>`:''}<a href="#${user()?'home':'welcome'}">App</a>${i<names.length-1?`<a href="#reference/${names[i+1]}">Next ›</a>`:''}</div>`);
}
function ask(message){return confirm(message);}
app.addEventListener('click',async e=>{
 const button=e.target.closest('[data-command]');if(!button)return;e.preventDefault();
 const command=button.dataset.command,id=button.dataset.id,value=button.dataset.value,u=user();
 if(command==='next'){if(onboarding<2){onboarding++;render();}else go('register');return;}
 if(command==='social'){toast('Login sosial belum terhubung. Gunakan akun lokal melalui email.');return;}
 if(!u)return;
 switch(command){
 case 'submit-pet':document.querySelector('#form')?.requestSubmit();return;
 case 'category':filter=value;render();return;
 case 'add-item':{const p=catalog.find(p=>p.id===id),c=u.cart.find(c=>c.id===id);const amount=Number(document.querySelector('#product-quantity')?.value||1);if(!Number.isInteger(amount)||amount<1){toast('Jumlah harus berupa angka bulat minimal 1.');return;}if((c?.qty||0)+amount>p.stock){toast('Jumlah mencapai batas stok lokal.');return;}if(c)c.qty+=amount;else u.cart.push({id,qty:amount});if(persist()){toast('Added to cart');render();}return;}
 case 'quantity':{const p=catalog.find(p=>p.id===id),c=u.cart.find(c=>c.id===id);if(!c)return;const next=c.qty+Number(button.dataset.step);if(next<1){if(!ask('Hapus produk ini dari keranjang?'))return;u.cart=u.cart.filter(c=>c.id!==id);}else if(next<=p.stock)c.qty=next;else{toast('Stok lokal tidak mencukupi.');return;}break;}
 case 'remove-item':if(!ask('Hapus produk ini dari keranjang?'))return;u.cart=u.cart.filter(c=>c.id!==id);break;
 case 'clear-cart':if(!ask('Kosongkan seluruh keranjang?'))return;u.cart=[];break;
 case 'delete-pet':if(!ask('Hapus hewan beserta catatan perawatannya?'))return;u.pets=u.pets.filter(p=>p.id!==(id||u.selectedPetId));if(!u.pets.some(p=>p.id===u.selectedPetId))u.selectedPetId=u.pets[0]?.id||null;persist();go('home');return;
 case 'delete-record':if(!ask('Hapus catatan ini?'))return;pet().records=pet().records.filter(r=>r.id!==id);break;
 case 'logout':if(!ask('Keluar dari akun ini?'))return;if(window.COCO_CLOUD?.active){try{await window.COCO_CLOUD.logout();}catch(e){toast(e.message);return;}}db.session=null;search='';filter='Semua';persist();go('login');return;
 case 'scan-pets':toast('Pemindaian belum terhubung. Tambahkan hewan melalui formulir.');return;
 case 'book-pet':u.selectedPetId=id;u.bookingDraft.petId=id;persist();go('booking-date');return;
 case 'book-date':u.bookingDraft.date=value;u.bookingDraft.time='';break;
 case 'book-time':u.bookingDraft.time=value;break;
 case 'server-service':{try{const value=await window.COCO_CLOUD.request('services'),service=value.services.find(s=>s.id===id);if(!service)throw Error('Layanan tidak tersedia.');const context=u.pets.find(p=>p.id===button.dataset.petId);u.bookingDraft={serviceId:service.id,service:service.name,provider:service.provider.name,price:service.price,currency:value.currency,...(context?{petId:context.id,sourcePetId:context.id}:{})};persist();go(context?'booking-date':'booking-pet');}catch(e){toast(e.message);}return;}
 case 'service':{const contextPet=u.pets.find(p=>p.id===button.dataset.petId);u.bookingDraft={service:value==='vets'?'Konsultasi dokter hewan':value==='grooming'?'Grooming':'Penitipan',provider:value==='vets'?'Dr. Nambuvan':value==='grooming'?'Grooming service':'Boarding service',...(contextPet?{petId:contextPet.id,sourcePetId:contextPet.id}:{})};persist();go(contextPet?'booking-date':'booking-pet');return;}
 case 'review-booking':{const d=u.bookingDraft;if(!d.date||!d.time){toast('Pilih tanggal dan waktu.');return;}if((window.COCO_CLOUD?.active?new Date(`${d.date}T${d.time}+07:00`):new Date(`${d.date}T${d.time}`))<=new Date()){toast('Pilih waktu di masa depan.');return;}persist();go('booking-review');return;}
 case 'cancel-server-order':{if(!ask('Batalkan pesanan server ini?'))return;try{const value=await window.COCO_CLOUD.request('orders/cancel','POST',{id});u.orders=u.orders.map(o=>o.id===id?value.order:o);persist();await window.COCO_CLOUD.flush();render();}catch(e){toast(e.message);}return;}
 case 'confirm-booking':{const d=u.bookingDraft;if(window.COCO_CLOUD?.active){try{if(d.id)throw Error('Untuk mengubah jadwal server, batalkan lalu buat booking baru.');d.requestId=d.requestId||uid();persist();await window.COCO_CLOUD.flush();const result=await window.COCO_CLOUD.request('bookings','POST',d);u.bookings=[result.booking,...u.bookings.filter(b=>b.id!==result.booking.id)];u.bookingDraft={};persist();await window.COCO_CLOUD.flush();toast('Booking tersimpan di server, menunggu konfirmasi penyedia.');go('bookings');}catch(e){toast(e.message);}return;}if(new Date(`${d.date}T${d.time}`)<=new Date()){toast('Pilih waktu di masa depan.');go('booking-date');return;}if(u.bookings.some(b=>b.id!==d.id&&b.status!=='Dibatalkan'&&b.date===d.date&&b.time===d.time)){go('slot-conflict');return;}const b=u.bookings.find(b=>b.id===d.id);if(b)Object.assign(b,d);else u.bookings.push({...d,id:uid(),price:150000,status:'Terjadwal lokal'});u.bookingDraft={};if(persist())go('booking-success');return;}
 case 'cancel-booking':if(!ask('Batalkan jadwal ini?'))return;if(window.COCO_CLOUD?.active&&u.bookings.find(b=>b.id===id)?.serverManaged){try{await window.COCO_CLOUD.request('bookings/cancel','POST',{id});}catch(e){toast(e.message);return;}}u.bookings.find(b=>b.id===id).status='Dibatalkan';break;
 }
 persist();render();
});
// Retain the existing data layer and listeners, replacing only screen rendering.
window.removeEventListener('hashchange',render);
render=async function(){
 trackNavigation();
 if(!app.firstElementChild)app.innerHTML='<main class="d-gallery" role="status">Menyiapkan aplikasi?</main>';
 await window.COCO_CLOUD?.ready;
 const version=++designVersion,[route,id,contextPetId]=(location.hash.slice(1)||'welcome').split('/');
 const publicRoutes=['welcome','login','register','forgot','server-login','designs','reference','server','privacy','account-token'];
 if(!user()&&!publicRoutes.includes(route)){go('login');return;}
 if(user()&&['welcome','login','register'].includes(route)){go('home');return;}
 try{
  switch(route){
   case 'welcome':await welcomeDesign(version);break;
   case 'server-login':await authDesign('login',version);break;
   case 'login':case 'register':await authDesign(route,version);break;
   case 'forgot':await forgotDesign(version);break;
   case 'home':await homeDesign(version);break;
   case 'pet-new':await petFormDesign(null,version);break;
   case 'pet-edit':await petFormDesign(id,version);break;
   case 'pet':await petDesign(id,version);break;
   case 'records':await recordsDesign(version);break;
   case 'shop':await shopDesign(version);break;
   case 'product':await referenceProductDesign(id,version);break;
   case 'cart':await cartDesign(version);break;
   case 'checkout':await checkoutDesign(version);break;
   case 'payment':await paymentDesign(version);break;
   case 'orders':await ordersDesign(version);break;
   case 'profile':await profileDesign(version);break;
   case 'profile-edit':case 'addresses':await profileEditDesign(version,route==='addresses');break;
   case 'change-password':await changePasswordDesign(version);break;
   case 'verify-email':await verificationDesign(version);break;
   case 'server-devices':await serverDevicesDesign(version);break;
   case 'server':await serverSettingsDesign(version);break;
   case 'privacy':await privacyDesign(version);break;
   case 'account-token':await accountTokenDesign(id,contextPetId,version);break;
   case 'backup':await backupDesign(version);break;
   case 'booking-new':case 'booking-pet':await bookingPetDesign(version);break;
   case 'booking-date':case 'booking-edit':await bookingDesign(route==='booking-edit'?id:null,version);break;
   case 'booking-review':await bookingReviewDesign(version);break;
   case 'bookings':await bookingsDesign(version);break;
   case 'services':case 'vets':case 'grooming':case 'boarding':await servicesDesign(route==='services'?'vets':route,version,id);break;
   case 'location':case 'devices':case 'device-add':await unavailableDesign(route,version);break;
   case 'status':await statusDesign(version,id);break;
   case 'status-guide':await statusGuideDesign(version);break;
   case 'wellness':await wellnessDesign(version);break;
   case 'feeding':case 'mood':await diaryDesign(route,version);break;
   case 'provider':await providerDesign(['vets','grooming','boarding'].includes(id)?id:'vets',version,contextPetId);break;
   case 'reviews':await reviewsDesign(id||'app',version);break;
   case 'review-new':await addReviewDesign(id||'app',version);break;
   case 'device-detail':case 'activity':case 'sleep':case 'camera':case 'feeder':case 'whistle':await deviceFeatureDesign(route,version);break;
   case 'order':await orderDetailDesign(id,version);break;
   case 'help':await contactDesign(version);break;
   case 'help-saved':await stateDesign('helpSent','Message saved',version,[['Back to help','help']],'<h2>Message saved locally</h2><p>Your message has been stored in this browser. It has not been sent to a support team.</p>');break;
   case 'notifications':await notificationDesign(version);break;
   case 'retail':await retailDesign(version);break;
   case 'booking-success':await stateDesign('bookingSuccess','Local booking saved',version,[['My Bookings','bookings'],['Back to home','home']],'<h2>Local booking saved</h2><p>This booking has not been sent to a provider.</p>');break;
   case 'order-success':await stateDesign('orderSuccess','Local order saved',version,[['My Orders','orders'],['Back to home','home']],'<h2>Local order saved</h2><p>This is a simulation. No payment was collected.</p>');break;
   case 'payment-failed':await stateDesign('paymentFailed','Payment simulation failed',version,[['Try again','payment',698],['Back to cart','cart',774]]);break;
   case 'slot-conflict':await stateDesign('slotConflict','Slot conflict',version,[['Choose another time','booking-date']]);break;
   case 'pair-permission':await stateDesign('pairPermission','Device connection',version,[['Continue','pair-failed']]);break;
   case 'pair-failed':await stateDesign('pairFail','Device not connected',version,[['Try again','device-add'],['Back to devices','devices']],'<h2>Device integration unavailable</h2><p>No device has been paired. Physical commands are disabled.</p>');break;
   case 'designs':galleryDesign();break;
   case 'reference':await referenceDesign(id,version);break;
   default:go(user()?'home':'welcome');return;
  }
  if(version===designVersion){showPageBack();if(currentBoard?.isConnected){currentBoard.dataset.route=location.hash.slice(1)||'welcome';currentBoard.dataset.ready='true';}window.scrollTo(0,0);}
 }catch(ex){if(version!==designVersion)return;app.innerHTML=`<main class="d-gallery"><h1>Desain gagal dimuat</h1><p>${esc(ex.message)}</p><button type="button" id="retry-design">Coba lagi</button></main>`;document.querySelector('#retry-design').onclick=()=>render();console.error(ex);}
};
welcome=()=>render();shop=()=>render();profile=()=>render();
window.addEventListener('hashchange',()=>render());
render();

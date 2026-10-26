/* Interactive features based on the original design references.
 * User data replaces sample content; hardware readings require a real device. */
'use strict';
function petAge(dob){
 if(!dob)return '—';
 const start=new Date(dob+'T00:00:00'),end=new Date(today()+'T00:00:00');
 if(!Number.isFinite(start.getTime())||start>end)return '—';
 let totalMonths=(end.getFullYear()-start.getFullYear())*12+end.getMonth()-start.getMonth();
 const anniversary=n=>{const date=new Date(start.getFullYear(),start.getMonth()+n,1);date.setDate(Math.min(start.getDate(),new Date(date.getFullYear(),date.getMonth()+1,0).getDate()));return date;};
 if(anniversary(totalMonths)>end)totalMonths--;
 const years=Math.floor(totalMonths/12),months=totalMonths%12,days=Math.round((end-anniversary(totalMonths))/86400000);
 return `${years}y ${months}m ${days}d`;
}
function petSectionTitle(icon,title){return `<h2 class="r-section-title"><span aria-hidden="true">${icon}</span>${esc(title)}</h2>`;}
function lastRecord(p,type){return [...p.records].reverse().find(r=>r.type===type);}
function recordSummary(p,type){const r=lastRecord(p,type);return r?`${r.date} · ${r.note}`:'No records yet';}
async function referencePetDesign(id,v){
 const p=user().pets.find(p=>p.id===id)||pet();if(!p){go('pet-new');return;}
 user().selectedPetId=p.id;persist();
 const source=/roudy|rottweiler/i.test(p.name+' '+p.breed)?'petRoudy':/furry/i.test(p.name)?'petFurry':'pet';
 await Promise.all([getDesign(source),getDesign('pet')]);if(!await board('petNoData',p.name,v))return;
 const sex=p.sex==='Female'?'♀':p.sex==='Male'?'♂':'—';
 const content=flowBody(`<figure class="r-pet-hero" aria-label="${esc(p.name)}">${p.photo?`<img src="${esc(p.photo)}" alt="Foto ${esc(p.name)}">`:fragment(source,[0,0,430,340])}</figure><div class="r-pet-body"><article class="r-pet-name d-card"><div><h2>${esc(p.name)}</h2><p>${esc(p.breed||p.species)}</p></div><span class="r-sex ${p.sex==='Male'?'male':''}" aria-label="Sex: ${esc(p.sex||'Unknown')}">${sex}</span></article><section>${petSectionTitle(fragment('pet',[21,489,29,29]),'About '+p.name)}<dl class="r-pet-facts">${[['Age',petAge(p.dob)],['Weight',p.weight+' kg'],['Height',p.height?p.height+' cm':'—'],['Color',p.colour||'—']].map(([k,val])=>`<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl><p class="r-pet-description">${esc(p.description||'Add a description about your pet in Edit Pet.')}</p></section><section>${petSectionTitle(fragment('pet',[21,694,29,29]),p.name+"’s Status")}<div class="r-status-list">${[
 ['Health','♡','health','Contact Vet','vets',recordSummary(p,'Vaksinasi')],
 ['Food','♧','food','Check food','feeding',recordSummary(p,'Makan')],
 ['Mood','☺','mood','Whistle','whistle',recordSummary(p,'Suasana hati')],
 ].map(([label,icon,kind,action,route,note])=>`<article class="r-status-row"><a class="r-status-icon ${kind}" href="#${kind==='health'?'wellness/'+p.id:kind==='food'?'feeding':'mood'}" aria-label="${label}">${fragment('pet',kind==='health'?[32,735,44,44]:kind==='food'?[32,792,44,44]:[32,845,44,44])}</a><div><a href="#${kind==='health'?'wellness/'+p.id:kind==='food'?'feeding':'mood'}">${label}</a><p>No device data</p><small>${esc(note)}</small></div><a class="r-status-action ${kind==='food'?'green':''}" href="#${route}${kind==='health'?'/'+p.id:''}">${action}<span aria-hidden="true"> ›</span></a></article>`).join('')}</div></section><div class="d-flow r-pet-links">${flowLink('Care records','records',true)}${flowLink('Location','location',true)}${flowLink('Pet Status','status',true)}${flowLink('Connect a device','device-add')}<div class="d-settings-links">${flowLink('Edit Pet','pet-edit/'+p.id)}${flowLink('Back to home','home')}</div></div></div>`,{top:0,left:0,width:430,headerBottom:0});
 content.classList.add('r-pet-page');
 backTo('home');
}
function healthTiles(records){return records.length?`<div class="r-health-tiles">${records.map(r=>`<article><h3>${esc(r.title||r.type)}</h3><p>${esc(r.date)}</p>${r.note?`<p>${esc(r.note)}</p>`:''}${r.provider?`<p>${esc(r.provider)}</p>`:''}</article>`).join('')}</div>`:'<p class="d-muted">No records yet</p>';}
async function wellnessDesign(v){
 const p=pet();if(!p){go('pet-new');return;}if(!await board('health','Pet Health',v))return;
 backTo('pet/'+p.id);hit('Medical Records',[225,85,185,35],'records');
 const appointments=user().bookings.filter(b=>b.petId===p.id&&b.status!=='Dibatalkan');
 flowBody(`<section class="r-health-panel"><div class="d-row d-between"><h2>Vaccinations</h2><a href="#records">See all ›</a></div>${healthTiles(p.records.filter(r=>r.type==='Vaksinasi'))}</section><section class="r-health-panel"><div class="d-row d-between"><h2>Allergies</h2><a href="#records">See all ›</a></div>${healthTiles(p.records.filter(r=>r.type==='Alergi'))}</section><section class="r-health-panel"><h2>Appointments</h2>${appointments.length?healthTiles(appointments.map(b=>({title:b.service,date:b.date,provider:b.provider}))):'<h3>When you schedule an appointment, you’ll see it here. Let’s set your first appointment.</h3>'}${flowLink('Start','vets/'+p.id)}</section>`,{top:142,headerBottom:120,left:11,width:408});
}
async function diaryDesign(kind,v){
 const p=pet();if(!p){go('pet-new');return;}const food=kind==='feeding',type=food?'Makan':'Suasana hati';
 if(!await board(food?'pushFood':'pushHealth',food?'Food':'Mood',v))return;headerName(food?'Food':'Mood');backTo('pet/'+p.id);
 const body=flowBody(`<article class="d-card d-flow"><h2>${esc(p.name)} · ${food?'Food':'Mood'}</h2><p>No device data</p></article><div id="diary-form"></div><section class="d-flow"><h2>${food?'Feeding':'Mood'} records</h2>${p.records.filter(r=>r.type===type).reverse().map(r=>`<article class="d-card"><h3>${esc(r.date)}</h3><p>${esc(r.note)}</p></article>`).join('')||'<p>No records yet</p>'}</section>${flowLink(food?'Browse pet food':'Care records',food?'shop':'records',true)}`);
 inlineForm(`<label>Date<input name="date" type="date" required max="${today()}" value="${today()}"></label><label>${food?'Feeding note':'Mood note'}<textarea name="note" required maxlength="2000"></textarea></label>`,'Save record',d=>{if(!d.note.trim()||d.date>today())throw Error('Periksa tanggal dan catatan.');p.records.push({id:uid(),type,date:d.date,note:d.note.trim()});if(persist())render();},body.querySelector('#diary-form'));
}
async function statusDesign(v,id){
 if(!await board('petStatus','Pet Status',v))return;headerName('Pet Status');backTo('home');
 flowBody(`<section class="r-all-pet-status" aria-label="Status semua hewan">${user().pets.map((p,i)=>`<article class="d-card d-flow r-pet-status-card" data-pet-id="${esc(p.id)}"><a class="r-status-pet-heading" href="#pet/${p.id}" aria-label="Detail ${esc(p.name)}">${petArt(i,64)}<span><h2>${esc(p.name)}</h2><small>${esc(p.breed||p.species)}</small></span><span aria-hidden="true">›</span></a>${['Health','Food','Mood'].map(t=>`<div class="r-status-meter ${t.toLowerCase()}"><span>${t}</span><span class="r-empty-meter" aria-hidden="true"></span><small>No device data</small></div>`).join('')}</article>`).join('')||`<article class="d-card d-flow"><h2>No pets yet</h2><p>Add a pet to see their status here.</p>${flowLink('Add a pet','pet-new')}</article>`}</section><a class="d-small-link" href="#status-guide">How are Health, Food and Mood measured?</a>`);
}
async function statusGuideDesign(v){
 if(!await board('statusGuide','Pet Status guide',v))return;headerName('Pet Status guide');backTo('status');
 flowBody(`<article class="d-card d-flow"><h2>Health</h2><p>Review vaccinations, allergies and care notes in Pet Health. This local app does not diagnose your pet.</p><h2>Food</h2><p>Your feeding notes are saved per pet. Automatic food readings require a connected feeder or collar.</p><h2>Mood</h2><p>Keep a daily mood note. Automatic activity, sleep and mood readings are unavailable without a connected device.</p></article>${flowLink('Pet Health','wellness')}${flowLink('Care records','records',true)}`);
}
async function providerDesign(kind,v,petId){
 if(window.COCO_CLOUD?.active)return serverServicesDesign(kind,v,petId);
 const contextPet=user().pets.find(p=>p.id===petId),suffix=contextPet?'/'+contextPet.id:'';
 if(kind!=='vets'){
  if(!await board(kind,kind==='grooming'?'Grooming':'Boarding',v))return;backTo(kind+suffix);
  flowBody(`<article class="d-card d-flow"><h2>${kind==='grooming'?'Grooming service':'Boarding service'}</h2><p>Choose your pet, date and time to save a local booking.</p><a class="d-small-link" href="#reviews/${kind}">Reviews</a></article><button class="d-flow-button" data-command="service" data-value="${kind}" data-pet-id="${contextPet?.id||''}">Book an Appointment</button>`);return;
 }
 const vet=kind==='vets';if(!await board('vetDetail',vet?'Dr. Nambuvan':kind==='grooming'?'Grooming':'Boarding',v))return;
 backTo(kind);if(!vet)headerName(kind==='grooming'?'Grooming service':'Boarding service');
 const reviews=(user().reviews||[]).filter(r=>r.target===kind);
 textAt(`${reviews.length?(reviews.reduce((n,r)=>n+r.rating,0)/reviews.length).toFixed(1):'—'} · ${reviews.length} local reviews`,[60,493,300,33],{size:15,background:'white'});
 textAt(demoPrice(150000)+' per local appointment',[47,555,335,28],{size:15,color:'#4b82b2',background:'white'});
 textAt('Selected pet: '+(contextPet?.name||'Choose a pet'),[30,735,370,25],{size:13,background:'white'});
 hit('Reviews',[60,493,300,33],'reviews/'+kind);
 const book=hit('Book an Appointment',[30,793,373,60],null,'service');book.dataset.value=kind;book.dataset.petId=contextPet?.id||'';
 put(`<p class="d-layer d-static-note" style="${designPositions(30,758,370,28)}background:white">Local service listing · booking saved in this browser</p>`);
}
async function contactDesign(v){
 if(!await board('help','Help & support',v))return;headerName('Help & support');backTo('profile');
 const body=flowBody('<h2>How can we help?</h2><div id="contact-form"></div><p class="d-muted">Messages are saved locally. No email is sent.</p>'+flowLink('Reviews','reviews/app',true)+flowLink('Backup data','backup',true)+flowLink('View original Figma screens','designs',true));
 inlineForm('<label>Subject<input name="subject" required maxlength="120"></label><label>Message<textarea name="message" required maxlength="2000"></textarea></label>','Save message',d=>{if(!d.subject.trim()||!d.message.trim())throw Error('Isi subjek dan pesan.');(user().supportMessages||=[]).push({id:uid(),subject:d.subject.trim(),message:d.message.trim(),date:today()});if(persist())go('help-saved');},body.querySelector('#contact-form'));
}
function productPetContext(product,activePet){
 if(!product.targetSpecies)return '';
 const normalize=value=>({dog:'anjing',cat:'kucing'}[String(value||'').trim().toLowerCase()]||String(value||'').trim().toLowerCase());
 const match=activePet&&normalize(activePet.species)===normalize(product.targetSpecies);
 return `<div class="r-product-pet-context"><p>Untuk: ${esc(product.targetSpecies)}</p>${match?`<p>Hewan aktif: <a class="r-pet-pill" href="#pet/${activePet.id}">${esc(activePet.name)}</a></p>`:activePet?`<p class="r-product-species-note">Hewan aktif ${esc(activePet.name)} (${esc(activePet.species)}) berbeda jenis dengan peruntukan produk ini.</p>`:''}</div>`;
}
async function referenceProductDesign(id,v){
 if(window.COCO_CLOUD?.active)try{await window.COCO_CLOUD.refreshCatalog();}catch(e){toast(e.message);}

 const p=catalog.find(p=>p.id===id)||catalog[0];if(!await board('product',p.name,v))return;headerName(p.name);backTo('shop');
 const reviews=(user().reviews||[]).filter(r=>r.target===p.id),avg=reviews.length?(reviews.reduce((n,r)=>n+r.rating,0)/reviews.length).toFixed(1):'—';
 const brand=p.brand|| (p.name.startsWith('Josera')?'Josera':p.name.startsWith('Pedigree')?'Pedigree':p.name.startsWith('BlackHawk')?'BlackHawk':p.name.startsWith('Royal Canin')?'Royal Canin':p.name.startsWith('Fi ')?'Fi':p.name.startsWith('Petcube')?'Petcube':'');
 flowBody(`<figure class="d-product-hero" aria-label="${esc(p.name)}">${itemArt(catalog.indexOf(p),290)}</figure><article class="d-card d-product-details"><h2>${esc(p.name)}</h2><div class="d-row d-between"><p class="r-product-brand">${brand?'Brand: '+esc(brand):esc(p.category)}</p><p class="d-detail-price">${demoPrice(p.price)}</p></div><a href="#reviews/${p.id}" class="r-product-reviews">${avg} <span class="r-stars">★★★★★</span> (${reviews.length} reviews)</a></article><p class="d-muted">${esc(p.name)}${p.description?' · '+esc(p.description):''}. Stok lokal: ${p.stock}. ${p.category==='Perangkat'?'Device connection requires an external integration.':'Product listing from the original COCO catalog.'}</p>${productPetContext(p,pet())}<label class="r-product-quantity">Quantity<input id="product-quantity" type="number" min="1" max="${p.stock}" step="1" value="1" aria-label="Quantity"></label><button class="d-flow-button" data-command="add-item" data-id="${p.id}">Add to cart</button>`,{background:'#f7f7f7',top:110});
 hit('Cart',[365,39,54,55],'cart');
}
async function retailDesign(v){
 if(!await board('retail','Find Retail Stores',v))return;backTo('shop');
 put(`<p class="d-layer r-map-notice" style="${designPositions(22,103,386,42)}">Reference map · live store search is not connected</p>`);
 textAt('Reference location · not your distance',[70,754,270,30],{size:13,background:'white'});
 nativeButton('Shop',[252,789,94,32],'shop');hit('Cart',[365,39,54,55],'cart');
}
async function reviewsDesign(target,v){
 const list=(user().reviews||[]).filter(r=>r.target===target);if(!await board('reviews','Reviews',v))return;backTo(target==='app'?'help':'provider/'+target);
 const avg=list.length?(list.reduce((n,r)=>n+r.rating,0)/list.length).toFixed(1):'—';
 flowBody(`<section class="r-review-summary"><h2>${avg}</h2><p class="r-stars">★★★★★</p><p>Based on ${list.length} local reviews</p>${[5,4,3,2,1].map(n=>`<div class="r-review-bar"><span>${n} stars</span><meter min="0" max="${Math.max(1,list.length)}" value="${list.filter(r=>r.rating===n).length}"></meter></div>`).join('')}</section>${list.map(r=>`<article class="r-review"><div class="d-row">${user().photo?photoImage(user().photo,user().name,42):''}<div><h3>${esc(user().name)}</h3><small>${esc(r.date)} · local review</small></div></div><p class="r-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</p><p>${esc(r.note)}</p></article>`).join('')||'<p>No reviews yet. Share your experience.</p>'}`,{background:'#f7f7f7'});
 put(`<a class="r-review-add" href="#review-new/${esc(target)}" aria-label="Add Review">+</a>`);
}
async function addReviewDesign(target,v){
 if(!await board('addReview','Add Review',v))return;backTo('reviews/'+target);
 const body=flowBody(`<div class="d-row">${user().photo?photoImage(user().photo,user().name,48):''}<h2>${esc(user().name)}</h2></div><p class="d-muted">Saved locally</p><div id="review-form"></div>`,{background:'#f7f7f7'});
 inlineForm(`<fieldset class="r-rating"><legend>Rating</legend>${[1,2,3,4,5].map(n=>`<label><input type="radio" name="rating" value="${n}" required aria-label="${n} stars"><span>★</span></label>`).join('')}</fieldset><label>Share more about your experience<textarea name="note" required maxlength="2000" placeholder="Share details of your own experience at this place"></textarea></label>`,'Post Review',d=>{if(!d.note.trim()||!Number.isInteger(+d.rating)||+d.rating<1||+d.rating>5)throw Error('Pilih rating dan tulis ulasan.');(user().reviews||=[]).push({id:uid(),target,rating:+d.rating,date:today(),note:d.note.trim()});if(persist())go('reviews/'+target);},body.querySelector('#review-form'));
}
async function deviceFeatureDesign(kind,v){
 const config={
  'device-detail':['deviceDetail','Device details','Fi Smart Collar'],
  activity:['activity','Activity Tracker','Activity'],sleep:['sleep','Sleep Monitor','Sleep'],
  camera:['camera','Pet Camera','Camera'],feeder:['feeder','FOOD DISPENSER','PetCube Food Dispenser E8'],
  whistle:['whistle','Whistle','Whistle'],
 }[kind];if(!config)return;
 await getDesign('shopIoT');if(!await board(config[0],config[1],v))return;headerName(config[1]);backTo(kind==='whistle'&&pet()?'pet/'+pet().id:'devices');
 const art=kind==='feeder'?itemArt(catalog.findIndex(i=>i.id==='iot1'),250):kind==='device-detail'?itemArt(catalog.findIndex(i=>i.id==='iot3'),330):'';
 flowBody(`${art?`<figure class="r-device-hero">${art}</figure>`:''}<article class="d-card d-flow"><h2>${config[2]}</h2><p>No device connected</p><p>${kind==='camera'?'No live stream is available.':kind==='activity'?'Activity history will appear here when an activity tracker is connected.':kind==='sleep'?'Sleep history will appear here when a sleep monitor is connected.':kind==='whistle'?'Connect a supported collar to use Whistle. No sound or command has been sent.':'Connect a supported device to receive readings.'}</p></article>${kind==='feeder'?'<article class="d-card d-flow"><h2>Feeding schedule</h2><p>Available quantity · Unavailable</p><p>Last refill · Unavailable</p><p>Next refill · Unavailable</p><button class="d-flow-button" disabled>Feed now · Not connected</button></article>':''}${kind==='device-detail'?flowLink('Pet Status','status',true)+flowLink('Activity Tracker','activity',true)+flowLink('Sleep Monitor','sleep',true):''}${flowLink('Add Device','device-add')}${kind==='feeder'&&pet()?flowLink('Feeding records','feeding',true):''}`,{background:'#f7f7f7'});
}
async function orderDetailDesign(id,v){
 const o=user().orders.find(o=>o.id===id);if(!o){go('orders');return;}if(!await board('orderDetail','Order details',v))return;backTo('orders');
 flowBody(`<article class="d-card d-flow"><h2>Order details</h2><p>${esc(o.status)}</p><p>${new Date(o.createdAt).toLocaleString('id-ID')}</p>${o.items.map(i=>`<div class="d-summary-line"><span>${esc(i.name)} × ${i.qty}</span><b>${demoPrice(i.price*i.qty)}</b></div>`).join('')}<p class="d-total">${demoPrice(o.total)}</p></article><article class="d-card d-flow"><h2>Delivery address</h2><p>${esc(o.recipient)}</p><p>${esc(o.address)}</p><small>Local simulation · no shipment</small></article>${flowLink('My Orders','orders',true)}`);
}
async function notificationDesign(v){
 if(!await board('notifications','Notifications',v))return;backTo('home');
 const notes=user().bookings.filter(b=>b.status!=='Dibatalkan'&&b.date>=today());
 flowBody(notes.length?notes.map(b=>`<a class="d-card d-flow" href="#bookings"><h2>${esc(b.service)}</h2><p>${esc(b.date)} · ${esc(b.time)}</p><p>${esc(user().pets.find(p=>p.id===b.petId)?.name||'Pet')} · ${esc(b.provider)}</p></a>`).join(''):'<article class="d-card"><h2>No notifications yet</h2><p>Your upcoming local bookings will appear here.</p></article>');
}

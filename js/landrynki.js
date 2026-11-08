/* Landrynki Rowerowe: moduł mapy i panelu, bez zmian w istniejących warstwach. */
(()=>{
'use strict';
const API=()=>window.DPLandrynkiAPI;
let map=null,show=null,onExit=null,active=false,items=[],selected=null,packageData=null,frame=0,last=0,revision=0;
let packageList=[],packagePins=[],detailsCache=new Map(),listSession=0,view='closed';
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
const rad=Math.PI/180;
function meters(a,b){const x=(b[0]-a[0])*rad*Math.cos((a[1]+b[1])*rad/2)*6371000,y=(b[1]-a[1])*rad*6371000;return Math.hypot(x,y)}
function build(route){
 const points=route.coordinates,parts=[],sum=[0];for(let i=1;i<points.length;i++){const d=meters(points[i-1],points[i]);sum.push(sum[i-1]+d);parts.push(d)}
 return {route,points,sum,length:sum[sum.length-1],marker:null};
}
function locate(obj,dist){
 if(obj.length<=0)return obj.points[0];
 const d=dist%obj.length;let lo=1,hi=obj.sum.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(obj.sum[mid]<d)lo=mid+1;else hi=mid}
 const prev=obj.sum[lo-1],span=obj.sum[lo]-prev||1,t=(d-prev)/span,a=obj.points[lo-1],b=obj.points[lo];return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}
function loop(time){
 if(!active)return;
 const delta=last?Math.min(80,time-last):0;last=time;
 for(const obj of items){
  obj.distance=(obj.distance||0)+delta/1000*15;
  obj.marker.setLngLat(locate(obj,obj.distance));
 }
 frame=requestAnimationFrame(loop);
}
function opacity(){
 // Stan zaznaczenia w CSS, niezależny od aktualnie załadowanego stylu Mapbox.
 // Klasa na naszym markerze nie znika przy map.setStyle().
 for(const o of items){
  const marker=o.marker.getElement();
  marker.classList.toggle('dp-landrynki-dimmed',Boolean(selected&&selected!==o.route.id));
  marker.style.removeProperty('opacity');
 }
}
function refreshOpacity(){if(view==='package')opacity();}
function back(){selected=null;opacity();render()}
function exitLandrynki(){deactivate();onExit?.();}
function removeRouteMarkers(){cancelAnimationFrame(frame);frame=0;last=0;for(const obj of items)obj.marker.remove();items=[];active=false;selected=null;packageData=null;}
function syncPins(){for(const item of packagePins)item.marker.getElement().hidden=view==='closed'||(view==='package'&&packageData?.id===item.id);}
function onPanelHide(){
 // Wygaszenie wideo bez otwierania ukrytego panelu. Animacje pozostają aktywne.
 if(view==='package'&&selected){selected=null;opacity();render({silent:true});}
}
function goList(){revision++;removeRouteMarkers();view='list';syncPins();renderList();focusPins();}
function pick(id){selected=id;opacity();render()}
function render({silent=false}={}){
 if(!active||!packageData||!show)return;
 const wrap=el('div','dp-landrynki');
 if(selected){
  const route=packageData.routes.find(r=>r.id===selected);
  if(!route){selected=null;return render()}
  const b=el('button','dp-landrynki-back','←');b.type='button';b.setAttribute('aria-label','Wróć do listy przejazdów');b.onclick=back;wrap.append(b);
  const title=el('h3','dp-landrynki-route-name',route.name);wrap.append(title);
  if(route.youtubeId){
   const video=el('iframe','dp-landrynki-video');
   const desktop=window.matchMedia('(min-width:701px)').matches;
   // Autoplay w przeglądarkach desktopowych działa niezawodniej z wyciszonym dźwiękiem.
   video.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(route.youtubeId)+'?rel=0&playsinline=1'+(desktop?'&autoplay=1&mute=1':'');
   video.title='Film: '+route.name;video.loading='lazy';video.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';video.allowFullscreen=true;wrap.append(video);
  }else wrap.append(el('p','','Brak filmu dla tego przejazdu.'));
  if(route.description)wrap.append(el('p','dp-landrynki-description',route.description));
 }else{
  const exitButton=el('button','dp-landrynki-back','←');exitButton.type='button';exitButton.setAttribute('aria-label','Wróć do listy paczuszek Landrynek');exitButton.title='Wszystkie paczuszki';exitButton.onclick=goList;wrap.append(exitButton);
  // Opis HTML z CMS wyświetlamy jako tekst; nie wstawiamy niezweryfikowanego HTML.
  if(packageData.descriptionHtml){const text=new DOMParser().parseFromString(packageData.descriptionHtml,'text/html').body.textContent||'';wrap.append(el('p','dp-landrynki-description',text));}
  const grid=el('div','dp-landrynki-thumbs');
  for(const route of packageData.routes){
   const b=el('button','dp-landrynki-thumb');b.type='button';b.title=route.name;b.setAttribute('aria-label','Pokaż przejazd: '+route.name);b.style.borderColor=route.color;
   if(route.youtubeId){const img=el('img');img.src='https://img.youtube.com/vi/'+encodeURIComponent(route.youtubeId)+'/hqdefault.jpg';img.alt='';img.loading='lazy';b.append(img)}else b.append(el('span','','▶'));
   b.onclick=()=>pick(route.id);grid.append(b);
  }
  wrap.append(grid);
 }
 if(!silent){show(packageData.title,wrap)}else{
  const panel=document.getElementById('infoContent');
  if(panel)panel.replaceChildren(el('div','tag','Landrynki Rowerowe'),el('h2','',packageData.title),wrap);
 }
}
function showCurrent(){
 if(view==='package'&&packageData){render();return true}
 if(view==='list'){renderList();return true}
 return false;
}
function deactivate(){
 revision++;listSession++;removeRouteMarkers();for(const obj of packagePins)obj.marker.remove();packagePins=[];packageList=[];detailsCache.clear();view='closed';
}
function addMarkers(data){
 for(const route of data.routes){
  const item=build(route),button=el('button','dp-landrynki-dot');button.type='button';button.style.setProperty('--landrynki-color',route.color);button.title=route.name;button.setAttribute('aria-label','Pokaż przejazd: '+route.name);
  button.onclick=e=>{e.preventDefault();e.stopPropagation();pick(route.id)};
  item.marker=new mapboxgl.Marker({element:button,anchor:'center'}).setLngLat(route.coordinates[0]).addTo(map);
  items.push(item);
 }
 opacity();
}
function framePackage(){
 const pts=packageData.routes.flatMap(r=>r.coordinates);
 if(!pts.length)return;
 const bounds=new mapboxgl.LngLatBounds(pts[0],pts[0]);pts.forEach(p=>bounds.extend(p));
 const mobile=window.matchMedia('(max-width:700px)').matches;
 map.fitBounds(bounds,{padding:mobile?{top:90,bottom:Math.round(innerHeight*.48),left:45,right:45}:{top:85,bottom:85,left:55,right:Math.min(560,Math.round(innerWidth*.40))},maxZoom:16,duration:650});
}
async function open(id){
 if(!map||!API())return;
 revision++;const current=revision;removeRouteMarkers();view='package';
 try{
  const data=detailsCache.get(Number(id))||await API().detail(id);
  if(current!==revision)return;
  if(!data.routes.length)throw Error('Brak poprawnych tras w tej paczuszce');
  detailsCache.set(data.id,data);packageData=data;active=true;syncPins();addMarkers(data);render();framePackage();frame=requestAnimationFrame(loop);
 }catch(err){if(current!==revision)return;console.warn('[Landrynki]',err);if(show)show('Landrynki',el('p','','Nie udało się wczytać paczuszki. Sprawdź API i uprawnienia CORS.'));}
}
function renderList(){
 if(view!=='list'||!show)return;
 const box=el('div','dp-landrynki-list');
 const exit=el('button','dp-landrynki-back','←');exit.type='button';exit.title='Powrót do STORY';exit.setAttribute('aria-label','Zakończ Landrynki i wróć do STORY');exit.onclick=exitLandrynki;box.append(exit);
 if(!packageList.length)box.append(el('p','','Brak opublikowanych paczuszek.'));
 for(const item of packageList){
  const b=el('button','dp-landrynki-card');b.type='button';
  if(item.featuredImageUrl){const img=el('img');img.src=item.featuredImageUrl;img.alt='';img.loading='lazy';b.append(img)}
  const content=el('span','dp-landrynki-card-text');content.append(el('strong','',item.title),el('small','',item.excerpt||item.routeCount+' przejazdy'));b.append(content);
  b.onclick=()=>open(item.id);box.append(b);
 }
 show('Landrynki Rowerowe',box);
}
function addPackagePin(data,label){
 if(view==='closed'||packagePins.some(p=>p.id===data.id))return;
 const points=data.routes.flatMap(r=>r.coordinates);
 if(!points.length)return;
 let minLon=Infinity,minLat=Infinity,maxLon=-Infinity,maxLat=-Infinity;
 for(const [lon,lat] of points){minLon=Math.min(minLon,lon);minLat=Math.min(minLat,lat);maxLon=Math.max(maxLon,lon);maxLat=Math.max(maxLat,lat)}
 const center=[(minLon+maxLon)/2,(minLat+maxLat)/2];
 const button=el('button','dp-landrynki-package-pin','🍬');
 button.type='button';button.title='Landrynki: '+label;button.setAttribute('aria-label','Otwórz paczuszkę Landrynek: '+label);
 button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open(data.id)});
 const marker=new mapboxgl.Marker({element:button,anchor:'bottom'}).setLngLat(center).addTo(map);
 packagePins.push({id:data.id,marker,center});syncPins();
}
function focusPins(){
 if(view!=='list'||!packagePins.length)return;
 const pts=packagePins.map(p=>p.center),bounds=new mapboxgl.LngLatBounds(pts[0],pts[0]);pts.forEach(p=>bounds.extend(p));
 const mobile=window.matchMedia('(max-width:700px)').matches;
 map.fitBounds(bounds,{padding:mobile?{top:80,bottom:Math.round(innerHeight*.52),left:40,right:40}:{top:80,bottom:80,left:50,right:Math.min(510,Math.round(innerWidth*.37))},maxZoom:13.5,duration:600});
}
async function loadPins(list,session){
 // Pozycja paczuszki wynika z geometrii jej tras, bez dodatkowych pól CMS.
 const results=await Promise.allSettled(list.map(async entry=>{
  const data=await API().detail(entry.id);
  if(session!==listSession||view==='closed')return;
  detailsCache.set(data.id,data);addPackagePin(data,entry.title);
 }));
 if(session!==listSession||view!=='list')return;
 if(!packagePins.length)return;
 focusPins();
 if(results.some(r=>r.status==='rejected'))console.warn('[Landrynki] Niektóre paczuszki nie mają geometrii do znacznika.');
}
async function choose(){
 if(!map||!API())return;
 deactivate();const current=revision,session=listSession;view='list';
 try{
  const list=await API().list();
  if(current!==revision||session!==listSession)return;
  packageList=list;renderList();
  // Nie wybieraj automatycznie pierwszej paczuszki, nawet jeśli jest jedyna.
  loadPins(list,session);
 }catch(err){
  if(current!==revision||session!==listSession)return;
  console.warn('[Landrynki]',err);show('Landrynki',el('p','','Nie można pobrać Landrynek z WordPressa.'));
 }
}
window.DPLandrynki=Object.freeze({init(m,renderPanel,exitCallback){map=m;show=renderPanel;onExit=exitCallback},choose,open,deactivate,onPanelHide,showCurrent,refreshOpacity,isActive:()=>view!=='closed'});
})();

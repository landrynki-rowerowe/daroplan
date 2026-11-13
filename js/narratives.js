/* DaRoPlan STORY — narrative player, using the existing map. */
(()=>{
'use strict';
const endpoint='https://lab.otwartyplan.org/wp-json/daroplan/v1/narratives';
let map,host,root,story,scenes=[],index=0,snapshot=null,request=0,active=false,restoreQueued=false;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b}
async function json(url){const r=await fetch(url,{cache:'no-store',mode:'cors',credentials:'omit'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
function mount(){if(root)return;root=el('section',null,'dp-narrative');root.setAttribute('aria-label','Opowieści DaRoPlanu');host.show(root)}
function screen(title){
 mount();root.replaceChildren();
 const h=el('header');
 const back=button('←',()=>exit());back.className='dp-story-back';back.setAttribute('aria-label','Wróć do modułu STORY');back.title='Wróć do modułu STORY';
 h.append(back,el('h2',title));root.append(h);
}
function fail(e){screen('Opowieści');root.append(el('p','Nie udało się wczytać: '+String(e.message||e)),button('Spróbuj ponownie',list))}
function safeContent(html){const out=el('div',null,'dp-narrative-copy');const doc=new DOMParser().parseFromString(String(html||''),'text/html');const allowed=new Set(['P','H2','H3','H4','UL','OL','LI','STRONG','B','EM','I','BLOCKQUOTE','BR','A','IMG','FIGURE','FIGCAPTION']);function copy(n,parent){if(n.nodeType===3){parent.append(document.createTextNode(n.textContent));return}if(n.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','EMBED'].includes(n.tagName))return;if(!allowed.has(n.tagName)){for(const c of n.childNodes)copy(c,parent);return}const x=el(n.tagName.toLowerCase());if(n.tagName==='A'||n.tagName==='IMG'){const attr=n.tagName==='A'?'href':'src';try{const u=new URL(n.getAttribute(attr)||'',endpoint);if(['http:','https:'].includes(u.protocol))x.setAttribute(attr,u.href)}catch{}if(n.tagName==='A'){x.target='_blank';x.rel='noopener noreferrer'}else{x.alt=n.getAttribute('alt')||'';x.loading='lazy'}}for(const c of n.childNodes)copy(c,x);parent.append(x)}for(const n of doc.body.childNodes)copy(n,out);return out}
function removeHighlight(){for(const id of ['dp-narrative-line','dp-narrative-point'])if(map?.getLayer(id))map.removeLayer(id)}
function highlight(){
 if(!active||!story||!map?.isStyleLoaded()||!map.getSource('dp-dasieCms'))return false;
 const ids=(scenes[index]?.map?.resources?.dasie_ids||[]).map(String);
 removeHighlight();
 if(!ids.length)return true;
 const filter=['in',['to-string',['get','dasie_id']],['literal',ids]];
 try{
  for(const [id,type,paint] of [['dp-narrative-line','line',{'line-color':'#ff3b30','line-width':7}],['dp-narrative-point','circle',{'circle-color':'#ff3b30','circle-radius':10,'circle-stroke-color':'#fff','circle-stroke-width':2}]])
   map.addLayer({id,type,source:'dp-dasieCms',filter:['all',filter,['==',['geometry-type'],type==='line'?'LineString':'Point']],paint});
  return true;
 }catch(err){console.warn('[STORY] Nie udało się odtworzyć wyróżnień Sceny',err);return false}
}
// Zmiana podkładu usuwa dynamiczne warstwy. Ponawiaj dopiero gdy styl i źródło CMS są gotowe.
function restoreHighlight(){
 if(!active||!story||!map)return;
 if(highlight())return;
 if(restoreQueued)return;
 restoreQueued=true;
 map.once('idle',()=>{
  restoreQueued=false;
  if(!active||!story)return;
  // idle może nadejść przed instalacją asynchronicznego źródła: app.js wywoła restore ponownie.
  if(map.isStyleLoaded()&&map.getSource('dp-dasieCms'))highlight();
 });
}
function padding(layout){if(layout!=='split')return {top:0,bottom:0,left:0,right:0};const r=root.closest('#infoPanel')?.getBoundingClientRect()||root.getBoundingClientRect();return innerWidth<=700?{top:0,left:0,right:0,bottom:Math.round(r.height)}:{top:0,left:0,bottom:0,right:Math.round(r.width)}}
function scene(i){
 if(!scenes[i])return;
 index=i;
 const s=scenes[i],layout=['split','map-full','content-full'].includes(s.layout)?s.layout:'split';
 root.dataset.layout=layout;
 screen(story.title||'Opowieść');
 const nav=el('nav',null,'dp-narrative-scene-nav');nav.setAttribute('aria-label','Nawigacja scenami');
 const prev=button('‹ Wstecz',()=>scene(index-1));prev.disabled=index===0;
 const count=el('span',(index+1)+' / '+scenes.length,'dp-narrative-scene-count');count.setAttribute('aria-live','polite');
 const next=button('Dalej ›',()=>scene(index+1));next.disabled=index===scenes.length-1;
 nav.append(prev,count,next);root.append(nav);
 root.append(el('h3',s.title||'Scena'));
 root.append(safeContent(s.content_html));
 const resources=host.materials?.(s.map?.resources?.dasie_ids||[]);
 if(resources){root.append(resources.node);resources.activate()}
 highlight();
 const camera=s.map?.camera;
 if(camera&&Array.isArray(camera.center)&&camera.center.length===2&&camera.center.every(Number.isFinite)&&Number.isFinite(camera.zoom)){
  map.stop();map.easeTo({center:camera.center,zoom:camera.zoom,bearing:Number.isFinite(camera.bearing)?camera.bearing:0,pitch:Number.isFinite(camera.pitch)?camera.pitch:0,padding:padding(layout),duration:650});
 }
}
async function open(id){const seq=++request;screen('Wczytywanie opowieści…');try{const data=await json(endpoint+'/'+encodeURIComponent(id));if(!active||seq!==request)return;if(!Array.isArray(data.scenes)||!data.scenes.length)throw Error('Brak scen');story=data;scenes=[...data.scenes].sort((a,b)=>Number(a.order||0)-Number(b.order||0));scene(0)}catch(e){if(active&&seq===request)fail(e)}}
async function list(){const seq=++request;story=null;scenes=[];removeHighlight();mount();root.dataset.layout='split';screen('Opowieści');root.append(el('p','Wczytywanie…'));try{const data=await json(endpoint);if(!active||seq!==request)return;const items=Array.isArray(data)?data:(data.narratives||data.items||data.results);if(!Array.isArray(items))throw Error('Nieznany format listy Opowieści');screen('Opowieści');if(!items.length)root.append(el('p','Brak opublikowanych opowieści.'));for(const item of items){if(item.id==null)continue;root.append(button(item.title?.rendered||item.title||('Opowieść '+item.id),()=>open(item.id)))}}catch(e){if(active&&seq===request)fail(e)}}
function start(){if(active||!map||!host)return;const c=map.getCenter();snapshot={center:[c.lng,c.lat],zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch(),padding:map.getPadding()};active=true;host.enter();list()}
function exit(restorePanel=true){if(!active)return;active=false;request++;removeHighlight();root?.remove();root=null;story=null;scenes=[];const old=snapshot;snapshot=null;host.leave(restorePanel);if(old){map.stop();map.jumpTo({...old,bearing:0,pitch:0})}}
window.DPNarratives=Object.freeze({init(m,h){map=m;host=h},start,exit,active:()=>active,restore:restoreHighlight,reveal:()=>{if(active)host?.reveal?.()}});
})();

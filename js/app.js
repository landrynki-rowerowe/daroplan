(()=>{'use strict';
const cfg=window.DAROPLAN_CONFIG;
console.info('[DaRoPlan] 0.9.6a-mobile — hidden / half / full bottom sheet');
const $=id=>document.getElementById(id);
const ui={menu:$('layersMenu'),panel:$('infoPanel'),content:$('infoContent'),results:$('searchResults'),input:$('searchInput')};
// Kanoniczny adres bez index.html — zachowujemy hash Mapboxa i pozostałe parametry.
if (/\/index\.html$/i.test(location.pathname)) history.replaceState(null,'',location.pathname.replace(/index\.html$/i,'')+location.search+location.hash);
let map,styleLayers=[],mode='infra',base='original',loadingSequence=0,locationMarker=null,activeFeature=null,selectedOutlineIds=[],sourceLayers={};
let sourcesReady=false, styleRevision=0;
// Padding mapy wynika z panelu, a nie ze stanu udostępnianego URL.
let panelCameraWidth=0,lastCameraBottom=0;
const mobileSheet = {state:'hidden',dragging:false,startY:0,startHeight:0,moved:false};
const isMobileSheet = ()=>window.matchMedia('(max-width:700px)').matches;
function sheetSizes(){
 const h=window.innerHeight;
 return {hidden:0,half:Math.round(h*.52),full:Math.max(240,h-12)};
}
function mobileSheetHeight(){return sheetSizes()[mobileSheet.state]||sheetSizes().half;}
function panelPadding(){return {left:0,right:panelCameraWidth,top:0,bottom:isMobileSheet()&&!ui.panel.classList.contains('hidden')&&mobileSheet.state!=='hidden'?Math.round(mobileSheetHeight()*.75):0};}
function syncMobileSheet(animate=true){
 if(!isMobileSheet())return;
 ui.panel.style.removeProperty('height');
 ui.panel.style.setProperty('--dp-sheet-height',(mobileSheet.state==='hidden'?sheetSizes().half:mobileSheetHeight())+'px');
 ui.panel.dataset.sheetState=mobileSheet.state;
 ui.panel.setAttribute('aria-hidden',String(mobileSheet.state==='hidden'));
 ui.panel.inert=(mobileSheet.state==='hidden');
 ui.panel.classList.toggle('dp-sheet-dragging',!animate);
 $('panelExpand').setAttribute('aria-expanded',String(mobileSheet.state==='full'));
 updatePanelCamera(animate);
}
function setMobileSheet(state,animate=true){
 if(!isMobileSheet())return;
 mobileSheet.state=state;
 ui.panel.classList.remove('hidden','expanded');
 document.body.classList.toggle('panel-open',state!=='hidden');
 if(state==='hidden'){clearSelection09();ui.panel.classList.remove('welcome-view');}
 syncMobileSheet(animate);
}
function setupMobileSheet(){
 const handle=$('panelExpand');
 handle.textContent='';
 handle.setAttribute('aria-label','Przeciągnij, aby rozwinąć lub zwinąć panel');
 handle.addEventListener('pointerdown',e=>{
  if(!isMobileSheet()||e.button>0)return;
  mobileSheet.dragging=true;mobileSheet.moved=false;mobileSheet.startY=e.clientY;
  mobileSheet.startHeight=ui.panel.getBoundingClientRect().height;
  handle.setPointerCapture(e.pointerId);
  ui.panel.classList.add('dp-sheet-dragging');e.preventDefault();
 });
 handle.addEventListener('pointermove',e=>{
  if(!mobileSheet.dragging)return;
  const dy=mobileSheet.startY-e.clientY;
  if(Math.abs(dy)>5)mobileSheet.moved=true;
  const sizes=sheetSizes();const height=Math.max(0,Math.min(sizes.full,mobileSheet.startHeight+dy));
  ui.panel.style.setProperty('--dp-sheet-height',height+'px');
 });
 const finish=e=>{
  if(!mobileSheet.dragging)return;
  mobileSheet.dragging=false;
  const delta=mobileSheet.startY-e.clientY;
  const sizes=sheetSizes(),height=Math.max(0,Math.min(sizes.full,mobileSheet.startHeight+delta));
  const points=['hidden','half','full'];
  let chosen=points.reduce((a,b)=>Math.abs(sizes[a]-height)<Math.abs(sizes[b]-height)?a:b);
  if(Math.abs(delta)>65){
   const i=points.indexOf(mobileSheet.state);
   if(delta>0)chosen=points[Math.min(i+1,2)];
   else chosen=points[Math.max(i-1,0)];
  }
  setMobileSheet(chosen);
 };
 handle.addEventListener('pointerup',finish);
 handle.addEventListener('pointercancel',finish);
 handle.addEventListener('click',()=>{
  if(!isMobileSheet()||mobileSheet.moved){mobileSheet.moved=false;return}
  setMobileSheet(mobileSheet.state==='hidden'?'half':mobileSheet.state==='half'?'full':'half');
 });
}

function updatePanelCamera(animate=true){
 if(!map)return;
 const isSmall=window.matchMedia('(max-width:700px)').matches;
 const isOpen=!ui.panel.classList.contains('hidden');
 // Na wąskim ekranie nie odsuwamy mapy na siłę pod szeroką nakładkę.
 const width=(!isSmall&&isOpen)?Math.min(Math.round(ui.panel.getBoundingClientRect().width),Math.round(window.innerWidth*.48)):0;
 const targetBottom=panelPadding().bottom;
 if(width===panelCameraWidth && targetBottom===lastCameraBottom)return;
 panelCameraWidth=width;lastCameraBottom=targetBottom;
 map.easeTo({padding:panelPadding(),duration:animate?380:0,essential:true});
}

const infraCategories=[
 {id:'ddr',name:'Droga dla rowerów',color:'#2632ef'},
 {id:'cpr',name:'Ciąg pieszo-rowerowy',color:'#2632ef',dash:'dashed'},
 {id:'allowed',name:'Chodnik z dopuszczonym ruchem rowerów',color:'#2632ef',dash:'dotted'},
 {id:'pas',name:'Pas rowerowy',color:'#159924'},
 {id:'contra',name:'Kontrapas / kontraruch',color:'#159924',dash:'dashed'}
];
const selection=new Set(['infra','suggestions','construction','borders','ddr','cpr','allowed','pas','contra']);
let infraExpanded=true,geoRequest=0;
const veloIds=['velo-ddr','velo-droga','velo-inna','velo-budowa','velo-plan','velo-nieokreslone'];
const veloDefaults=()=>veloIds.forEach(id=>selection.add(id));
let previousInfraSelection=null;
const krakowGroups=['infra','suggestions','ddr','cpr','allowed','pas','contra'];
function enableVelo(){if(!selection.has('velo')){previousInfraSelection=new Set(krakowGroups.filter(id=>selection.has(id)));for(const id of krakowGroups)selection.delete(id);selection.add('velo');veloDefaults();}}
function disableVelo(){selection.delete('velo');if(previousInfraSelection){for(const id of krakowGroups)selection.delete(id);for(const id of previousInfraSelection)selection.add(id);previousInfraSelection=null;}}
const sources={
 infra:{type:'vector',url:'mapbox://ibikekrk.cmmypfiet2x4g1opbk9r00o65-059oo'},
 tempoLines:{type:'vector',url:'mapbox://ibikekrk.cm3korqja33ub1pn91bx6ig9w-33wp9'},
 dasie:{type:'vector',url:'mapbox://ibikekrk.cmlz0thvh3hkx1oo68xw66v0q-2nh4q'},
 counters:{type:'vector',url:'mapbox://ibikekrk.cjxuf77kl0cuq2iqltb1a83kq-79d7h'},
 stojaki:{type:'geojson',data:'https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Stojaki_ZTP_wy%C5%9Bwietlenie/FeatureServer/1/query?where=typ%3D%27stojak%20rowerowy%27&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=2000&f=geojson'},
 ztp:{type:'geojson',data:'https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Infrastruktura_rowerowa_ZTP/FeatureServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson'},
 study:{type:'vector',url:'mapbox://ibikekrk.cm4im5749384m1mlk8p85rppw-5zejk'},
 sim:{type:'vector',url:'mapbox://ibikekrk.cmjbmirn00dxw1mk2dxu4b3l4-2aqi1'},
 borders:{type:'vector',url:'mapbox://ibikekrk.ckak3ncy600m522o196zec8x9-83qbh'},
 residences:{type:'vector',url:'mapbox://ibikekrk.cm47h9e3y0myo1ut9x4uuehes-1jj7n'},
 velo:{type:'geojson',data:'data/velomalopolska.geojson'},
 veloObjazdy:{type:'geojson',data:'data/velo-objazdy.geojson'},
 audytyOtwarte:{type:'geojson',data:{type:'FeatureCollection',features:[]}},
 audytyZamkniete:{type:'geojson',data:{type:'FeatureCollection',features:[]},cluster:true,clusterRadius:45,clusterMaxZoom:13}
};
// GeoJSON ZTP przez proxy PHP w tej samej domenie; bez CORS i bez workflow GitHub.
let audytyData=null;
function updateAuditSources(){
 if(!map||!audytyData)return;
 const opened=map.getSource('dp-audytyOtwarte');
 const closed=map.getSource('dp-audytyZamkniete');
 if(opened)opened.setData(audytyData.open);
 if(closed)closed.setData(audytyData.closed);
}
async function loadAudytyDirect(){
 try{
  const response=await fetch('api/audyty.php',{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const geo=await response.json();
  if(geo.type!=='FeatureCollection'||!Array.isArray(geo.features))throw Error('Niepoprawny GeoJSON');
  const opened=[],closed=[];
  for(const f of geo.features){
   if(f?.geometry?.type!=='Point'||!Array.isArray(f.geometry.coordinates))continue;
   const state=String(f.properties?.categories||'').toLocaleLowerCase('pl').trim();
   const properties={...f.properties};delete properties.address;
   const clean={type:'Feature',geometry:f.geometry,properties};
   if(state.includes('otwarte'))opened.push(clean);
   else if(state.includes('zamknięte')||state.includes('zamkniete'))closed.push(clean);
  }
  audytyData={open:{type:'FeatureCollection',features:opened},closed:{type:'FeatureCollection',features:closed}};
  updateAuditSources();
  console.info('[DaRoPlan] Audyty przez proxy ZTP:',opened.length,'otwartych,',closed.length,'zamkniętych');
 }catch(e){console.warn('[DaRoPlan] Pobieranie audytów przez proxy ZTP nieudane',e);toast('Nie udało się pobrać audytów ZTP przez hosting — sprawdź api/audyty.php.');}
}
const layerGroups=[
 {id:'infra',title:'Infrastruktura rowerowa'}, {id:'suggestions',title:'Sugerowane trasy w ruchu ogólnym'},
 {id:'construction',title:'W budowie'}, {id:'tempoLines',title:'Tempo 30 — ulice'}, {id:'tempo20',title:'Tempo 20 — strefy zamieszkania'}, {id:'counters',title:'Liczniki rowerowe'},
 {id:'stojaki',title:'Stojaki rowerowe'}, {id:'shelters',title:'Wiaty rowerowe'},
 {id:'supports',title:'Podpórki'}, {id:'repairs',title:'Stacje naprawy'},
 {id:'dasie',title:'DASIE — archiwum'}, {id:'study',title:'Studium tras rowerowych'},
 {id:'sim',title:'Trasy SIM — koncepcja'},
 {id:'velo',title:'VeloMałopolska'},
 {id:'audyty',title:'Audyty rowerowe ZTP'},
 {id:'residences',title:'Zameldowania'}
];
function line(id,source,sourceLayer,color,filter,dash,width=3){const layer={id:'dp-'+id,type:'line',source,paint:{'line-color':color,'line-width':['interpolate',['linear'],['zoom'],9,Math.max(.65,width*.30),11,Math.max(.85,width*.42),13.5,width*.75,16,width*1.30],'line-opacity':.93}};if(sourceLayer)layer['source-layer']=sourceLayer;if(filter)layer.filter=filter;if(dash)layer.paint['line-dasharray']=dash;layer.layout={'line-cap':'round','line-join':'round'};return layer;}
function circle(id,source,sourceLayer,color,filter){const layer={id:'dp-'+id,type:'circle',source,paint:{'circle-radius':['interpolate',['linear'],['zoom'],9,2,11,3,13.5,4.5,16,8],'circle-color':color,'circle-stroke-width':['interpolate',['linear'],['zoom'],11,.8,13.5,1.3,16,1.8],'circle-stroke-color':'#fff','circle-opacity':.9}};if(sourceLayer)layer['source-layer']=sourceLayer;if(filter)layer.filter=filter;return layer;}
function add(id,layer,group){try{if(!map.getLayer(layer.id))map.addLayer(layer);layerIndex.set(layer.id,group);map.setLayoutProperty(layer.id,'visibility',visibleGroup(group)?'visible':'none');}catch(e){console.warn('[DaRoPlan] Nie udało się dodać',id,e.message)}}
const layerIndex=new Map();
const fixedGroups=new Set(['borders']);
function visibleGroup(group){return fixedGroups.has(group)||(group.startsWith('velo-')?selection.has('velo')&&selection.has(group):selection.has(group))}
function styleLayer(id,newId,src,group){const template=styleLayers.find(l=>l.id===id);if(!template)return;const layer=JSON.parse(JSON.stringify(template));layer.id='dp-'+newId;layer.source=src;if(sourceLayers[group])layer['source-layer']=sourceLayers[group];layer.layout=layer.layout||{};layer.layout.visibility='visible';add(id,layer,group);}
function createLayers(){layerIndex.clear();for(const [id,obj] of Object.entries(sources)){if(!map.getSource('dp-'+id))try{map.addSource('dp-'+id,obj)}catch(e){console.warn('Nie można dodać źródła',id,e)}}
updateAuditSources();
// Tempo 20/30 rysujemy pierwsze, pod infrastrukturą rowerową.
// Atrybut maxspeed może mieć w danych postać liczby albo tekstu.
if(sourceLayers.tempoLines){
 const src='dp-tempoLines', sl=sourceLayers.tempoLines;
 const marker=(id,speed,color)=>({
   id:'dp-'+id,type:'line',source:src,'source-layer':sl,
   filter:['==',['to-string',['get','maxspeed']],String(speed)],
   paint:{'line-color':color,'line-opacity':0.48,
     'line-width':['interpolate',['linear'],['zoom'],9,2.5,11,4,13.5,8,16,14]}
 });
 add('tempoLines',marker('tempoLines',30,'#f5d51b'),'tempoLines');
 add('tempo20',marker('tempo20',20,'#ffb767'),'tempo20');
}
const core='DaRoPlan - infrastruktura rowerowa';
const category=(...cats)=>['in',['get','category'],['literal',cats]];
const colors=[['ddr','#2632ef'],['cpr','#2632ef',[2.5,1.5]],['c16t22','#2632ef',[1,2]],['pord','#2632ef',[1,2]],['pas','#159924'],['kontraruch','#159924',[2.5,1.5]],['kontrapas','#159924',[2.5,1.5]]];
for(const [c,color,dash] of colors){const g=({c16t22:'allowed',pord:'allowed',kontraruch:'contra',kontrapas:'contra'})[c]||c;add(c,line('infra-'+c,'dp-infra',core,color,category(c),dash,2.5),'infra:'+g);}
add('oneway',{id:'dp-oneway',type:'symbol',minzoom:13.5,source:'dp-infra','source-layer':core,filter:['all',['==',['get','category'],'ddr'],['==',['get','additional_info'],'one-way']],layout:{'symbol-placement':'line','symbol-spacing':70,'text-field':'▶','text-size':['interpolate',['linear'],['zoom'],13.5,10,16,14],'text-rotation-alignment':'map','text-keep-upright':false,'text-allow-overlap':true},paint:{'text-color':'#253bf0','text-halo-color':'#fff','text-halo-width':['interpolate',['linear'],['zoom'],13.5,.6,16,1.2]}},'infra:ddr');
add('suggestions',line('suggestions','dp-infra',core,'#e32626',category('suggestion'),[1,2],2.4),'suggestions');
add('construction',line('construction','dp-infra',core,'#ee9a12',category('ddr-p','cpr-p','kontraruch-p','kontrapas-p'),[2.5,1.5],3.2),'construction');

add('counters',circle('counters','dp-counters','liczniki_petle_pomiaru_ruchu_row','#f47a20'),'counters');
add('stojaki',circle('stojaki','dp-stojaki',null,'#0071ac'),'stojaki');
add('shelters',circle('shelters','dp-ztp',null,'#c026d3',['==',['get','typ'],'wiata']),'shelters');
add('supports',circle('supports','dp-ztp',null,'#00a676',['==',['get','typ'],'podpórka']),'supports');
add('repairs',circle('repairs','dp-ztp',null,'#0e81a6',['==',['get','typ'],'stacja naprawy rowerów']),'repairs');
// DASIE: geometrie liniowe i punktowe od razu w odpowiedniej postaci.
// Wierzchołki LineString nie są osobnymi znacznikami.
const dasieLayer='dasie_2.3';
const dasiePoints=['==',['geometry-type'],'Point'];
const dasieLines=['==',['geometry-type'],'LineString'];
add('dasie-line',line('dasie-line','dp-dasie',dasieLayer,'#dc2424',dasieLines,null,3),'dasie');
add('dasie',circle('dasie','dp-dasie',dasieLayer,'#dc2424',dasiePoints),'dasie');
// Objazdy wstawione PRZED pozostałymi liniami VeloM, aby nie zasłaniać sieci.
add('velo-objazdy-linie',{
 id:'dp-velo-objazdy-linie',type:'line',source:'dp-veloObjazdy',filter:['==',['get','kind'],'line'],
 layout:{'line-cap':'round','line-join':'round'},
 paint:{'line-color':'#ff8c24','line-opacity':.95,
  'line-width':['interpolate',['linear'],['zoom'],9,1.6,11,1.7,13.5,1.9,16,2.3]}
},'velo-objazdy');
// Siec regionalna: wlasna symbolika DaRoPlanu, a nie kolory Google.
// VeloM: czytelne linie przy oddaleniu, bez dominowania przy zoomie 16.
// Droga w ruchu ogólnym: identyczny kolor i kreskowanie jak kontraruch w Krakowie.
const veloStyles={
 ddr:{color:'#2456cb',dash:null,width:[3.3,3.3,3.2,3.25]},
 droga:{color:'#159924',dash:[1.6,1.55],width:[3.3,3.3,3.2,3.25]},
 inna:{color:'#e32626',dash:[1.6,1.7],width:[2.5,2.5,2.4,2.6]},
 budowa:{color:'#f3a414',dash:[2.1,1.65],width:[3.3,3.3,3.2,3.7]},
 plan:{color:'#9848ce',dash:[0.01,2.15],width:[3.3,3.3,3.2,3.25]},
 nieokreslone:{color:'#7d42b3',dash:[0.01,2.15],width:[2.8,2.8,2.8,3.0]}
};
for(const [cat,style] of Object.entries(veloStyles)){
 const group='velo-'+cat;
 const layer=line(group,'dp-velo',null,style.color,['==',['get','category'],cat],style.dash,3.4);
 layer.paint['line-width']=['interpolate',['linear'],['zoom'],9,style.width[0],11,style.width[1],13.5,style.width[2],16,style.width[3]];
 layer.paint['line-opacity']=.96;
 add(group,layer,group);
}

add('velo-objazdy-punkty',{
 id:'dp-velo-objazdy-punkty',type:'circle',source:'dp-veloObjazdy',filter:['==',['get','kind'],'point'],
 paint:{'circle-radius':['interpolate',['linear'],['zoom'],9,4.5,13,6,16,8],
 'circle-color':'#fc8b24','circle-stroke-color':'#fff','circle-stroke-width':2}
},'velo-objazdy');
// Zamknięte audyty mogą być klastrowane; otwarte zawsze są pojedynczymi punktami.
add('audyty-zamkniete-klastry',{
 id:'dp-audyty-zamkniete-klastry',type:'circle',source:'dp-audytyZamkniete',filter:['has','point_count'],
 paint:{'circle-color':'#818a94','circle-radius':['step',['get','point_count'],15,20,20,100,25],
 'circle-stroke-color':'#fff','circle-stroke-width':2}
},'audyty');
add('audyty-zamkniete-liczba',{
 id:'dp-audyty-zamkniete-liczba',type:'symbol',source:'dp-audytyZamkniete',filter:['has','point_count'],
 layout:{'text-field':['to-string',['get','point_count_abbreviated']],'text-font':['Open Sans Bold','Arial Unicode MS Bold'],'text-size':12},
 paint:{'text-color':'#fff'}
},'audyty');
add('audyty-zamkniete-punkty',{
 id:'dp-audyty-zamkniete-punkty',type:'circle',source:'dp-audytyZamkniete',filter:['!',['has','point_count']],
 paint:{'circle-radius':6,'circle-color':'#9299a2','circle-stroke-color':'#fff','circle-stroke-width':2}
},'audyty');
// Otwarte na wierzchu (także wtedy, kiedy pokrywają się z zamkniętymi).
add('audyty-otwarte-punkty',{
 id:'dp-audyty-otwarte-punkty',type:'circle',source:'dp-audytyOtwarte',
 paint:{'circle-radius':7,'circle-color':'#1ca65b','circle-stroke-color':'#fff','circle-stroke-width':2}
},'audyty');
styleLayer('studium24','study','dp-study','study');
if(sourceLayers.sim){
  // Trasy SIM mają różne identyfikatory source-layer zależnie od wersji tilesetu.
  // Bazujemy na kolorystyce z pierwotnego stylu, bez jego line-pattern.
  const color=['#d71930','#79b97a','#d71930','#3536af','#d71930','#00a6e4','#b15ba0','#79b97a','#135a36','#eaa323','#3536af','#80624e','#b15ba0','#eaa323','#80624e','#135a36','#80624e','#eaa323','#135a36','#00a6e4'];
  const routeColor=['match',['to-number',['coalesce',['get','nr_liczba'],['get','nr'],0]],...color.flatMap((c,i)=>[i+1,c]),'#8d569b'];
  add('sim',line('sim','dp-sim',sourceLayers.sim,routeColor,null,null,5),'sim');
}
// Oryginalna symbolika granic: czerwony pas po zewnętrznej stronie Krakowa oraz szara linia przerywana.
const borderSource=sourceLayers.borders||'Krakow_granice_miasta';
const redTemplate=styleLayers.find(l=>l.id==='krakow-granice-miasta copy');
if(redTemplate)styleLayer('krakow-granice-miasta copy','border-red','dp-borders','borders');
else {add('border-red',line('border-red','dp-borders',borderSource,'#ff5252',null,null,13),'borders');map.setPaintProperty('dp-border-red','line-opacity',.4);map.setPaintProperty('dp-border-red','line-offset',-6.5)}
styleLayer('krakow-granice-miasta','borders','dp-borders','borders');
styleLayer('zamaledowania','residences','dp-residences','residences');
}
// Jedna droga odbudowy warstw po KAŻDEJ zmianie podkładu.
// Nie uruchamiamy jej zanim metadane tilesetów i kopia stylu będą dostępne.
function restoreThematicLayers(){
 if(!sourcesReady||!map||!map.getStyle())return;
 try{
   hideStyleThemes();
   createLayers();
   syncVisibility();
   renderControls();
   // RUCH jest osobnym źródłem GeoJSON; setStyle() usuwa także jego warstwy.
   // Odtwarzamy je dopiero PO warstwach tematycznych DaRoPlanu.
   if(mode==='ruch')window.DPRuch?.install();
 }catch(err){console.error('[DaRoPlan] Przywracanie warstw po zmianie podkładu:',err);toast('Nie udało się przywrócić części warstw mapy');}
}
function clearFeatureHighlight(){
 activeFeature=null;
 for(const id of selectedOutlineIds)if(map.getLayer(id))map.removeLayer(id);
 selectedOutlineIds=[];
 if(map.getSource('dp-selected'))map.removeSource('dp-selected');
}
// Jeden tweet może opisywać wiele linii i punktów. Wyróżniamy po tweet_id
// bez kopiowania geometrii z aktualnie widocznych kafelków, aby podświetlenie
// obejmowało także fragmenty doładowane po przesunięciu mapy.
function highlightDasieGroup(feature){
 const raw=feature?.properties?.tweet_id;
 if(raw===undefined||raw===null||String(raw).trim()==='')return false;
 if(!map.getSource('dp-dasie'))return false;
 const tweetId=String(raw).trim();
 const sourceLayer=feature.layer?.['source-layer']||'dasie_2.3';
 clearFeatureHighlight();
 activeFeature=feature;
 const common=['==',['to-string',['get','tweet_id']],tweetId];
 const specs=[
  {id:'dp-selected-dasie-line-halo',type:'line',filter:['all',common,['==',['geometry-type'],'LineString']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],9,5,13,9,16,14],'line-opacity':.96}},
  {id:'dp-selected-dasie-line',type:'line',filter:['all',common,['==',['geometry-type'],'LineString']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ff3b30','line-width':['interpolate',['linear'],['zoom'],9,2.7,13,5,16,8],'line-opacity':1}},
  {id:'dp-selected-dasie-point',type:'circle',filter:['all',common,['==',['geometry-type'],'Point']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],9,6,13,10,16,14],'circle-color':'#ff3b30','circle-stroke-color':'#ffffff','circle-stroke-width':3,'circle-opacity':1}}
 ];
 try{
  for(const spec of specs){map.addLayer({...spec,source:'dp-dasie','source-layer':sourceLayer});selectedOutlineIds.push(spec.id);}
 }catch(e){console.warn('[DaRoPlan] Nie udało się wyróżnić grupy DASIE',tweetId,e);clearFeatureHighlight();return false;}
 // Bez automatycznego fitBounds: tileset wektorowy może nie zawierać w danym
 // kadrze wszystkich miejsc powiązanych z tweetem. Użytkownik zachowuje kamerę.
 return true;
}
function highlightFeature(feature){
 clearFeatureHighlight();
 if(!feature?.geometry)return;
 activeFeature=feature;
 const geom=feature.geometry;
 const geometry=JSON.parse(JSON.stringify(geom));
 const data={type:'FeatureCollection',features:[{type:'Feature',geometry,properties:{}}]};
 map.addSource('dp-selected',{type:'geojson',data});
 const type=geometry.type;
 if(type.includes('Line')){
  map.addLayer({id:'dp-selected-line',type:'line',source:'dp-selected',paint:{'line-color':'#ffffff','line-width':10,'line-opacity':.95}});
  map.addLayer({id:'dp-selected-center',type:'line',source:'dp-selected',paint:{'line-color':'#ff3b30','line-width':5,'line-opacity':1}});
  selectedOutlineIds=['dp-selected-line','dp-selected-center'];
 }else if(type.includes('Polygon')){
  map.addLayer({id:'dp-selected-area',type:'fill',source:'dp-selected',paint:{'fill-color':'#ff3b30','fill-opacity':.22}});
  map.addLayer({id:'dp-selected-edge',type:'line',source:'dp-selected',paint:{'line-color':'#ff3b30','line-width':4}});
  selectedOutlineIds=['dp-selected-area','dp-selected-edge'];
 }else if(type.includes('Point')){
  map.addLayer({id:'dp-selected-point',type:'circle',source:'dp-selected',paint:{'circle-radius':13,'circle-color':'#ff3b30','circle-stroke-color':'#fff','circle-stroke-width':4}});
  selectedOutlineIds=['dp-selected-point'];
 }
 const pts=[];
 function gather(c){if(typeof c?.[0]==='number'){pts.push(c);return;}if(Array.isArray(c))c.forEach(gather)}
 gather(geometry.coordinates);
 if(pts.length){const bounds=pts.reduce((b,p)=>b.extend(p),new mapboxgl.LngLatBounds(pts[0],pts[0]));
   if(pts.length===1)map.easeTo({center:pts[0],zoom:Math.max(map.getZoom(),14),duration:550,padding:{...panelPadding(),left:25,top:75,bottom:100}});
   else map.fitBounds(bounds,{maxZoom:15.4,padding:{...panelPadding(),left:50,right:Math.max(panelCameraWidth+40,45),top:95,bottom:window.innerWidth<=650?200:95},duration:600});
 }
}
// Identyfikator logiczny SIM jest niezależny od granic kafelków.
// Zaznaczenie przez filtr źródła wyróżnia wszystkie kafelki tej samej trasy,
// również te doładowane po przesunięciu mapy. Pełen bbox wymaga osobnego GeoJSON.
function highlightSimRoute(feature){
 const p=feature.properties||{};
 const n=Number(p.nr_liczba??p.nr);
 if(!Number.isInteger(n)||n<1||n>1000||!map.getSource('dp-sim')||!sourceLayers.sim)return false;
 clearFeatureHighlight();
 activeFeature=feature;
 const filter=['==',['to-number',['coalesce',['get','nr_liczba'],['get','nr'],0]],n];
 const layer={id:'dp-selected-sim-route',type:'line',source:'dp-sim','source-layer':sourceLayers.sim,
  filter,layout:{'line-cap':'round','line-join':'round'},
  paint:{'line-color':'#ff3b30','line-width':['interpolate',['linear'],['zoom'],5,3,11,5,16,9],'line-opacity':.96}};
 map.addLayer(layer);
 selectedOutlineIds=['dp-selected-sim-route'];
 return true;
}
// VeloM: zaznaczamy pełną geometrię ze źródłowego GeoJSON, a nie fragment
// zwrócony przez renderowanie kafelków wewnętrznych Mapbox GL.
let veloOriginalDataPromise=null;
function getVeloOriginalData(){
 if(!veloOriginalDataPromise)veloOriginalDataPromise=fetch('data/velomalopolska.geojson')
  .then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})
  .then(data=>{if(!Array.isArray(data.features))throw Error('Nieprawidłowy GeoJSON VeloM');return data})
  .catch(err=>{veloOriginalDataPromise=null;throw err});
 return veloOriginalDataPromise;
}
function highlightWholeFeatures(features,selected){
 if(!features.length)return false;
 clearFeatureHighlight();activeFeature=selected;
 const fc={type:'FeatureCollection',features:features.map(f=>({type:'Feature',geometry:f.geometry,properties:{}}))};
 map.addSource('dp-selected',{type:'geojson',data:fc});
 map.addLayer({id:'dp-selected-line',type:'line',source:'dp-selected',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':9,'line-opacity':.93}});
 map.addLayer({id:'dp-selected-center',type:'line',source:'dp-selected',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ff3b30','line-width':4.5,'line-opacity':.98}});
 selectedOutlineIds=['dp-selected-line','dp-selected-center'];
 const pts=[];const gather=c=>{if(typeof c?.[0]==='number'&&Number.isFinite(c[0])&&Number.isFinite(c[1]))pts.push(c);else if(Array.isArray(c))c.forEach(gather)};
 features.forEach(f=>gather(f.geometry?.coordinates));
 if(pts.length){const bounds=pts.reduce((b,p)=>b.extend(p),new mapboxgl.LngLatBounds(pts[0],pts[0]));
  map.fitBounds(bounds,{maxZoom:15.4,padding:{left:50,right:Math.max(panelCameraWidth+40,50),top:90,bottom:window.innerWidth<=650?190:90},duration:600});}
 return true;
}
async function highlightWholeVelo(feature){
 const p=feature.properties||{};
 if(!p.name)return false;
 activeFeature=feature;
 const source=await getVeloOriginalData();
 if(activeFeature!==feature)return true;
 // Nazwa jest identyfikatorem odcinka w źródłowym KML. Gdy jest powtórzona,
 // dodatkowo wymagamy tej samej kategorii i opisu, żeby nie łączyć obcych tras.
 const matches=source.features.filter(f=>f.geometry?.type?.includes('Line')&&
   String(f.properties?.name||'')===String(p.name)&&
   String(f.properties?.category||'')===String(p.category||'')&&
   String(f.properties?.description||'')===String(p.description||''));
 return highlightWholeFeatures(matches,feature);
}
// Studium jest tilesetem wektorowym. Jeśli ma jednoznaczny atrybut identyfikujący
// trasę, filtr po tym polu podświetla jej wszystkie kafelki (także doładowane).
// Nie traktujemy nazw rodzajowych jako identyfikatora całego przebiegu.
function highlightStudyRoute(feature){
 const p=feature.properties||{},srcLayer=feature.layer?.['source-layer']||sourceLayers.study;
 if(!srcLayer||!map.getSource('dp-study'))return false;
 const candidateKeys=['route_id','route_id_study','route_number','trasa_id','id_trasy','nr_trasy','route','nr_liczba','nr','numer','nazwa_trasy','route_name'];
 const key=candidateKeys.find(k=>p[k]!==undefined&&p[k]!==null&&String(p[k]).trim()!==''&&!/^(null|undefined)$/i.test(String(p[k])));
 if(!key)return false;
 const value=p[key];
 clearFeatureHighlight();activeFeature=feature;
 map.addLayer({id:'dp-selected-study-route',type:'line',source:'dp-study','source-layer':srcLayer,
  filter:['==',['get',key],value],layout:{'line-cap':'round','line-join':'round'},
  paint:{'line-color':'#ff3b30','line-width':['interpolate',['linear'],['zoom'],4,2.5,11,5,16,9],'line-opacity':.97}});
 selectedOutlineIds=['dp-selected-study-route'];
 return true;
}
async function detectSourceLayers(){
 // Mapbox TileJSON zwraca vector_layers z rzeczywistymi nazwami warstw.
 const wanted=['sim','tempoLines','borders'];
 const results=await Promise.all(wanted.map(async key=>{
  try{const url=sources[key].url.replace('mapbox://','https://api.mapbox.com/v4/')+'.json?secure&access_token='+encodeURIComponent(cfg.token);
   const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);const meta=await r.json();
   const names=(meta.vector_layers||[]).map(x=>x.id);
   if(!names.length)throw Error('brak vector_layers');
   sourceLayers[key]=names[0];if(names.length>1)console.info('[DaRoPlan] source-layers '+key,names);
  }catch(err){console.warn('[DaRoPlan] Metadane tilesetu '+key,err);if(key==='borders')sourceLayers[key]='Krakow_granice_miasta';if(key==='tempoLines')sourceLayers[key]='strefa-tempo-30';}
 }));
 return results;
}
function hideStyleThemes(){// W oryginalnym stylu pozostawiamy bazową kartografię, wyłączamy stare wersje danych tematycznych.
const list=['studium24','studium2020','studium2020 copy','trasy-krk-koncepcja-12-2025','metro-bike','metro-bike copy','landrynki-rowerowe','zamaledowania','zameldowanie3d','krakow-granice-miasta','krakow-granice-miasta copy'];
for(let i=1;i<=20;i++)list.push('trasa_'+i);
for(const id of list){if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none')}
}
function applySatelliteContrast(){
 // Osobne białe podkłady pod liniami zapewniają kontrast na ortofotomapie.
 for(const [id,group] of [...layerIndex]){
   if(id.endsWith('-halo')||id.includes('border')||id.startsWith('dp-selected')||group==='tempoLines'||group==='tempo20')continue;
   const layer=map.getLayer(id);
   if(!layer||layer.type!=='line')continue;
   const haloId=id+'-halo';
   if(!map.getLayer(haloId)){
     const spec={id:haloId,type:'line',source:layer.source,paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],9,2,11,2.7,13.5,4.6,16,7.8],'line-opacity':.96}};
     if(layer['source-layer'])spec['source-layer']=layer['source-layer'];
     if(layer.filter)spec.filter=layer.filter;
     try{map.addLayer(spec,id);layerIndex.set(haloId,group)}catch(e){console.warn('Nie można dodać obrysu',haloId,e)}
   }
   if(map.getLayer(haloId))map.setLayoutProperty(haloId,'visibility',base==='satellite'&&map.getLayoutProperty(id,'visibility')==='visible'?'visible':'none');
 }

 const isSat=base==='satellite';
 for(const [id,group] of layerIndex){if(!map.getLayer(id))continue;
 const l=map.getLayer(id);if(l.type==='line'&&!id.includes('borders')&&!id.includes('border-red')&&!id.startsWith('dp-selected')){
  // Obrysy obsługiwane przez warstwy -halo dodane powyżej.
 }
 }
}
// W RUCH istniejąca infrastruktura to dyskretne tło (50%), niezależne od presetów INFRA.
// Nie dopisujemy jej do selection: URL, zapamiętane warstwy i konfiguracje modułów
// pozostają nienaruszone. Nie pokazujemy planowanych inwestycji ani sugestii.
function syncVisibility(){
 const ruchBackdrop=mode==='ruch';
 for(const [id,group] of layerIndex){
  if(!map.getLayer(id))continue;
  const infrastructure=group.startsWith('infra:');
  const visible=infrastructure
   ?(ruchBackdrop||(selection.has('infra')&&selection.has(group.slice(6))))
   :visibleGroup(group);
  map.setLayoutProperty(id,'visibility',(group==='counters'&&ruchBackdrop)?'none':visible?'visible':'none');
 }
 // Obrysy linii na podkładzie satelitarnym powstają dynamicznie; ustawiamy ich
 // przezroczystość dopiero po odtworzeniu/utworzeniu ich przez Mapbox.
 applySatelliteContrast();
 for(const [id,group] of layerIndex){
  if(!group.startsWith('infra:'))continue;
  const layer=map.getLayer(id);
  if(!layer)continue;
  if(layer.type==='line'){
   map.setPaintProperty(id,'line-opacity',ruchBackdrop?0.4:(id.endsWith('-halo')?0.96:0.93));
  }else if(layer.type==='symbol'&&id==='dp-oneway'){
   map.setPaintProperty(id,'text-opacity',ruchBackdrop?0.5:1);
  }
 }
}
const baseNames={plan:'original',light:'light',satelita:'satellite'};
const basePublic={original:'plan',light:'light',satellite:'satelita'};
function baseFromURL(){const b=new URLSearchParams(location.search).get('b');return baseNames[b]||'original'}
function thumbURL(style){const match=/^mapbox:\/\/styles\/([^/]+)\/([^/]+)$/.exec(style);if(!match)return '';return 'https://api.mapbox.com/styles/v1/'+match[1]+'/'+match[2]+'/static/19.9383,50.0616,13,0/160x160?access_token='+encodeURIComponent(cfg.token)}
const baseCycle=['plan','light','satelita'];
function updateBaseControl(){
 const current=basePublic[base]||'plan';
 const start=(baseCycle.indexOf(current)+1)%baseCycle.length;
 const rotated=[baseCycle[start],baseCycle[(start+1)%3],baseCycle[(start+2)%3]];
 const trigger=$('baseTrigger'),picture=$('baseCurrentImage'),options=$('baseOptions');
 const first=options.querySelector('[data-base]');
 // Przycisk wyzwalający to pierwsza pozycja cyklicznej listy.
 trigger.dataset.base=rotated[0];
 picture.src=thumbURL(cfg.basemaps[baseNames[rotated[0]]]);
 picture.alt='Podkład '+rotated[0]+' — centrum Krakowa';
 trigger.setAttribute('aria-label','Wybierz podkład '+rotated[0]);
 const choices=Array.from(options.querySelectorAll('[data-base]'));
 choices.forEach((el,index)=>{
   const name=rotated[index+1];
   el.dataset.base=name;
   el.setAttribute('aria-label','Wybierz podkład '+name);
   const img=el.querySelector('img');
   img.src=thumbURL(cfg.basemaps[baseNames[name]]);
   img.alt='Podkład '+name+' — centrum Krakowa';
 });
}
function setBase(b){const internal=baseNames[b]||b;if(!cfg.basemaps[internal]||internal===base)return;clearFeatureHighlight();base=internal;loadingSequence++;map.setStyle(cfg.basemaps[internal],{diff:false});const url=new URL(location.href);url.searchParams.set('b',basePublic[base]);updateShareURL();updateBaseControl();}
function setupBaseControl(){
 const root=$('baseControl'),trigger=$('baseTrigger'),options=$('baseOptions');
 const close=()=>{root.classList.remove('open');trigger.setAttribute('aria-expanded','false')};
 const open=()=>{root.classList.add('open');trigger.setAttribute('aria-expanded','true')};
 // Kliknięcie głównego kwadratu od razu wybiera wskazywany podkład.
 trigger.addEventListener('click',()=>{
  if(!matchMedia('(hover:hover)').matches&&!root.classList.contains('open')){open();return}
  setBase(trigger.dataset.base);close()
 });
 options.querySelectorAll('[data-base]').forEach(el=>el.addEventListener('click',()=>{setBase(el.dataset.base);close()}));
 root.addEventListener('mouseenter',()=>{if(matchMedia('(hover:hover)').matches)open()});
 root.addEventListener('mouseleave',()=>{if(matchMedia('(hover:hover)').matches)close()});
 document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 // Na urządzeniach dotykowych: pierwsze dotknięcie rozwija pasek, kolejne wybiera podkład.
 trigger.addEventListener('focus',()=>{if(matchMedia('(hover:hover)').matches)open()});
 updateBaseControl();
}

function textNode(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e}
function openPanel(section){ui.panel.classList.toggle('welcome-view',false);ui.panel.classList.remove('hidden');ui.panel.classList.remove('expanded');$('panelExpand').setAttribute('aria-expanded','false');ui.menu.classList.toggle('hidden',section!=='layers');ui.content.classList.toggle('hidden',section==='layers');document.body.classList.add('panel-open');$('layersBtn').setAttribute('aria-expanded','true');updatePanelTab();if(isMobileSheet())setMobileSheet('half');else updatePanelCamera();}
function updatePanelTab(){
 const btn=$('layersBtn');if(!btn)return;
 const opened=!ui.panel.classList.contains('hidden');
 btn.textContent=opened?'›':'‹';
 btn.setAttribute('aria-label',opened?'Zwiń panel boczny':'Rozwiń panel boczny');
 btn.title=opened?'Zwiń panel':'Rozwiń panel';
 btn.setAttribute('aria-expanded',String(opened));
 const rect=ui.panel.getBoundingClientRect();
 const small=window.matchMedia('(max-width:700px)').matches;
 btn.style.right=(!small&&opened)?Math.max(0,window.innerWidth-rect.left-1)+'px':'0px';
}
function closePanel(){if(isMobileSheet()){setMobileSheet('hidden');return;}ui.panel.classList.remove('welcome-view');clearFeatureHighlight();ui.panel.classList.add('hidden');document.body.classList.remove('panel-open');$('layersBtn').setAttribute('aria-expanded','false');updatePanelTab();updatePanelCamera();}
// Panel powitalny: nie miesza się z konfiguracją warstw ani z zaznaczeniem obiektu.
const welcomeSlides=[
 {title:'Odkrywaj rowerowy Kraków',body:'Sprawdź istniejącą infrastrukturę rowerową, odcinki w budowie i sugerowane połączenia.',mode:'infra',action:'Odkryj infrastrukturę'},
 {title:'VeloMałopolska na mapie',body:'Odkrywaj regionalne trasy, rodzaje nawierzchni oraz objazdy i utrudnienia.',mode:'trasy',action:'Odkryj trasy'},
 {title:'Audyty rowerowe ZTP',body:'Zobacz otwarte i zamknięte audyty projektów rowerowych. Zielone punkty oznaczają audyty otwarte.',mode:'wiecej',action:'Zobacz audyty'}
];
let welcomeIndex=0, welcomeTimer=null;
const entryIsShared=(()=>{const q=new URLSearchParams(location.search);return ['m','l','b'].some(k=>q.has(k)) || Boolean(location.hash && location.hash!=='#');})();
function isSharedEntry(){return entryIsShared;}
function showWelcome(index=0){
 welcomeIndex=(index+welcomeSlides.length)%welcomeSlides.length;
 const slide=welcomeSlides[welcomeIndex];
 // Logo otwiera ekran główny bez resetowania zaznaczenia i warstw.
 const root=document.createElement('div');root.className='dp-welcome';
 const eyebrow=textNode('div','DaRoPlan 2.0 · Otwarty Plan','dp-welcome-eyebrow');root.append(eyebrow);
 root.append(textNode('h2',slide.title,'dp-welcome-title'));
 root.append(textNode('p',slide.body,'dp-welcome-description'));
 const nav=document.createElement('div');nav.className='dp-welcome-navigation';
 const dots=document.createElement('div');dots.className='dp-welcome-dots';
 welcomeSlides.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.className='dp-welcome-dot'+(i===welcomeIndex?' active':'');b.setAttribute('aria-label','Pokaż zajawkę '+(i+1));b.setAttribute('aria-current',String(i===welcomeIndex));b.onclick=()=>showWelcome(i);dots.append(b)});
 const arrows=document.createElement('div');arrows.className='dp-welcome-arrows';
 for(const [offset,label,icon] of [[-1,'Poprzednia zajawka','‹'],[1,'Następna zajawka','›']]){const b=document.createElement('button');b.type='button';b.textContent=icon;b.setAttribute('aria-label',label);b.onclick=()=>showWelcome(welcomeIndex+offset);arrows.append(b)}
 nav.append(dots,arrows);root.append(nav);
 const action=document.createElement('button');action.type='button';action.className='dp-welcome-action';action.textContent=slide.action+' →';action.onclick=()=>{configureModes(slide.mode);if(slide.mode==='wiecej'){selection.add('audyty');moduleStates.wiecej=new Set([...selection].filter(id=>moduleLayerIds.wiecej.includes(id)));syncVisibility();renderControls();updateShareURL()}};root.append(action);
 ui.content.replaceChildren(root);openPanel('content');ui.panel.classList.add('welcome-view');
}
function scheduleWelcome(){
 if(isSharedEntry())return;
 try{if(sessionStorage.getItem('dp095-welcome-seen'))return;sessionStorage.setItem('dp095-welcome-seen','1')}catch(e){}
 welcomeTimer=setTimeout(()=>{if((!ui.panel.classList.contains('hidden') && !(isMobileSheet() && mobileSheet.state==='hidden')) || activeFeature)return;showWelcome(0)},1100);
}
function showPanel(title,kind,properties={},extra){ui.content.replaceChildren();ui.content.append(textNode('div',kind,'tag'),textNode('h2',title));if(extra)ui.content.append(extra);for(const [k,v] of Object.entries(properties)){if(v===null||v===undefined||v===''||typeof v==='object')continue;const wrap=textNode('div','','property');wrap.append(textNode('b',k),textNode('span',String(v).slice(0,500)));ui.content.append(wrap)}openPanel('content');}
function link(text,url){const a=textNode('a',text,'action');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),3200)}
// Renderuj zwykły tekst i adresy HTTP(S) jako bezpieczne linki, bez interpretacji HTML z KML.
function linkedDescription(text){
 const container=document.createElement('p');
 container.style.whiteSpace='pre-line';
 const pattern=/(https?:\/\/[^\s<>"'\u201c\u201d]+|www\.[^\s<>"'\u201c\u201d]+)/gi;
 let from=0;
 for(const m of text.matchAll(pattern)){
  const raw=m[0];
  container.append(document.createTextNode(text.slice(from,m.index)));
  // Zakończenia zdań, przecinki i nawiasy nie są częścią adresu.
  const candidate=raw.replace(/[.,;:!?\])}]+$/g,'');
  const rest=raw.slice(candidate.length);
  try{
   const address=new URL(/^www\./i.test(candidate)?'https://'+candidate:candidate);
   if(['http:','https:'].includes(address.protocol)){
    const a=document.createElement('a');
    a.href=address.href;
    a.target='_blank';
    a.rel='noopener noreferrer';
    a.textContent=candidate;
    a.style.overflowWrap='anywhere';
    container.append(a);
   }else container.append(document.createTextNode(candidate));
  }catch(_){container.append(document.createTextNode(candidate));}
  container.append(document.createTextNode(rest));
  from=m.index+raw.length;
 }
 container.append(document.createTextNode(text.slice(from)));
 return container;
}
function showVeloFeature(p,group){
 const name=String(p.name||'Odcinek VeloMałopolska');
 const names={ddr:'DDR / CPR',droga:'Droga w ruchu ogólnym',inna:'Inna nawierzchnia — uwaga',budowa:'W budowie',plan:'Planowane',nieokreslone:'Do weryfikacji'};
 const category=names[p.category]||'VeloMałopolska';
 const extra=document.createElement('div');
 const description=String(p.description||'').trim();
 if(description){
   const section=textNode('section','','velo-description');
   section.append(textNode('h3','Opis odcinka'));
   const paragraph=linkedDescription(description);
   section.append(paragraph);
   extra.append(section);
 } else extra.append(textNode('p','Brak opisu w danych źródłowych.'));
 extra.append(textNode('p','Źródło: VeloMałopolska / Google My Maps','source-credit'));
 showPanel(name,category,{},extra);
}
function selectedFeature(e){const f=e.features?.find(x=>layerIndex.has(x.layer.id));if(!f)return;const group=layerIndex.get(f.layer.id);if(group==='counters'&&window.DPRuch?.visible()){window.DPRuch.clickFeature(f);return;}if(group==='sim'){
 if(!highlightSimRoute(f))highlightFeature(f);
}else if(group==='study'){
 if(!highlightStudyRoute(f))highlightFeature(f);
}else if(group.startsWith('velo-')&&group!=='velo-objazdy'){
 // Nie opóźniamy wyświetlenia panelu; geometria jest pobierana asynchronicznie.
 const clicked=f;
 highlightWholeVelo(clicked).then(ok=>{if(!ok&&activeFeature===clicked)highlightFeature(clicked)})
  .catch(err=>{console.warn('[DaRoPlan] Pełny odcinek VeloM niedostępny',err);if(activeFeature===clicked)highlightFeature(clicked)});
}else if(group==='dasie'){
 if(!highlightDasieGroup(f))highlightFeature(f);
}else highlightFeature(f);const p=f.properties||{};if(group==='velo-objazdy'){const extra=document.createElement('div');if(p.description)extra.append(linkedDescription(String(p.description)));extra.append(textNode('p','Uwaga: wpis może być archiwalny. Zweryfikuj bieżącą sytuację.','source-credit'));showPanel(p.name||'Objazd / utrudnienie','VeloM — objazdy i utrudnienia',{},extra);return;}if(group==='audyty'){const extra=document.createElement('div');if(p.publish_date)extra.append(textNode('p','Opublikowano: '+String(p.publish_date).slice(0,10)));if(p.modified_date)extra.append(textNode('p','Zmodyfikowano: '+String(p.modified_date).slice(0,10)));if(typeof p.link==='string'&&/^https:\/\//i.test(p.link))extra.append(link('Otwórz audyt ZTP ↗',p.link));showPanel(p.title||'Audyt rowerowy',p.categories||'Audyt ZTP',{},extra);return;}if(group.startsWith('velo-')){showVeloFeature(p,group);return;}const label=p.name||p.nazwa||p.title||p.NAZWA||layerGroups.find(x=>x.id===group)?.title||'Obiekt na mapie';const extra=document.createElement('div');if(group==='counters')extra.append(link('Pełne analizy pomiarów →',cfg.analysisUrl));if(group==='infra'||group==='construction')extra.append(link('Statystyki infrastruktury →',cfg.infrastructureUrl));if(group==='dasie'&&p.tweet_id){const tweetId=String(p.tweet_id).trim();extra.append(link('Otwórz oryginalny wpis w X ↗','https://x.com/i/status/'+encodeURIComponent(tweetId)));const embed=document.createElement('div');embed.className='tweet-embed';extra.append(embed);showPanel(label,'DASIE — archiwum',p,extra);renderTweet(tweetId,embed);return;}showPanel(label,layerGroups.find(x=>x.id===group)?.title||'Mapa',p,extra);}

function renderTweet(id,container){
  const embed=()=>{if(!window.twttr?.widgets?.createTweet)return false;
    window.twttr.widgets.createTweet(id,container,{lang:'pl',dnt:true,align:'center'}).then(node=>{if(!node)container.append(textNode('p','Podgląd niedostępny — użyj linku do oryginalnego wpisu.'));}).catch(()=>container.append(textNode('p','Nie udało się osadzić wpisu. Link powyżej pozostaje dostępny.')));return true;};
  if(embed())return;let tries=0;const interval=setInterval(()=>{if(!container.isConnected||embed()||++tries>40)clearInterval(interval);},200);
}
function attachClicks(){map.on('click',e=>{if(window.DPRuch?.visible()&&map.getLayer('dp-ruch-points')){const fs=map.queryRenderedFeatures(e.point,{layers:['dp-ruch-points']});if(fs.length){window.DPRuch.clickFeature(fs[0]);return;}}const ids=[...layerIndex.keys()].filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none'&&!(mode==='ruch'&&layerIndex.get(id)?.startsWith('infra:')));const feats=ids.length?map.queryRenderedFeatures(e.point,{layers:ids}):[];if(feats.length){const openAudit=feats.find(f=>f.layer.id==='dp-audyty-otwarte-punkty');if(openAudit){selectedFeature({features:[openAudit]});return;}const cluster=feats.find(f=>f.layer.id==='dp-audyty-zamkniete-klastry');if(cluster){const source=map.getSource('dp-audytyZamkniete');source.getClusterExpansionZoom(cluster.properties.cluster_id,(err,zoom)=>{if(!err)map.easeTo({center:cluster.geometry.coordinates,zoom:Math.min(zoom,16),duration:450})});return;}selectedFeature({features:feats});return} if(activeFeature){clearSelection09();if(mode==='ruch')openRuchPanel();else{renderControls();openPanel('layers')}} });map.on('mousemove',e=>{const ids=[...layerIndex.keys()].filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none'&&!(mode==='ruch'&&layerIndex.get(id)?.startsWith('infra:')));map.getCanvas().style.cursor=ids.length&&map.queryRenderedFeatures(e.point,{layers:ids}).length?'pointer':''})}
// 0.9.1: niezależne presety warstw dla modułów i kontrolowane nakładki.
const moduleLayerIds={
 infra:['infra','suggestions','construction','ddr','cpr','allowed','pas','contra','stojaki','shelters','supports','repairs'],
 ruch:['counters'],
 historia:['dasie','construction'],
 trasy:['velo','velo-ddr','velo-droga','velo-inna','velo-budowa','velo-plan','velo-nieokreslone','velo-objazdy','sim','study'],
 wiecej:['audyty','tempoLines','tempo20','residences']
};
const moduleTitles={infra:'INFRAstruktura',ruch:'Ruch',historia:'STORY',trasy:'Trasy',wiecej:'Więcej'};
const defaults={
 infra:['infra','suggestions','construction','ddr','cpr','allowed','pas','contra'],
 ruch:['counters'],historia:['dasie'],trasy:['velo','velo-ddr','velo-droga','velo-inna','velo-budowa','velo-plan','velo-nieokreslone'],wiecej:['audyty']
};
const moduleStates={};
// Kamera zapamiętywana osobno dla każdego modułu (wyłącznie na czas tej wizyty).
// Wartości startowe łatwo dostosować, kiedy uzgodnimy docelowe kadry.
const moduleInitialViews={
 infra:{center:[19.94,50.062],zoom:12.2},
 ruch:{center:[19.94,50.062],zoom:12.2},
 historia:{center:[19.94,50.062],zoom:12.2},
 trasy:{center:[19.94,50.08],zoom:10.1},
 wiecej:{center:[19.94,50.062],zoom:12.2}
};
const moduleCameraViews={};
function snapshotModuleCamera(module){
 if(!map||!moduleLayerIds[module])return;
 const c=map.getCenter();
 moduleCameraViews[module]={center:[c.lng,c.lat],zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()};
}
function switchModuleCamera(module){
 if(!map)return;
 const target=moduleCameraViews[module]||moduleInitialViews[module];
 if(!target)return;
 map.easeTo({...target,duration:600,essential:true});
}

// Nakładki utrzymywane pomiędzy modułami wyłącznie na wyraźne życzenie użytkownika.
const selectedAddons=new Set();
const addonLayers=['audyty','tempoLines','tempo20'];
// 0.9.4: odtwarzalny adres widoku (Mapbox zachowuje pozycję w #hash).
// Parametry: b = podkład, m = moduł, l = dokładna lista włączonych warstw.
// Stabilna kolejność pól kodu 1.xxxxxxx (28 warstw = 7 cyfr HEX).
// Nie zmieniać kolejności: zapisane wcześniej URL-e muszą nadal działać.
// Dla nowych warstw należy w przyszłości zdefiniować wersję 2.
const compactLayerOrder=[
 'infra','suggestions','construction','ddr','cpr','allowed','pas','contra',
 'stojaki','shelters','supports','repairs','counters','dasie',
 'velo','velo-ddr','velo-droga','velo-inna','velo-budowa','velo-plan',
 'velo-nieokreslone','velo-objazdy','sim','study',
 'audyty','tempoLines','tempo20','residences'
];
const urlLayerIds=new Set(compactLayerOrder);
function encodeCompactLayers(){
 let result='';
 for(let i=0;i<compactLayerOrder.length;i+=4){
  let n=0;
  for(let bit=0;bit<4;bit++)if(selection.has(compactLayerOrder[i+bit]))n|=1<<bit;
  result+=n.toString(16);
 }
 return '1.'+result;
}
function decodeCompactLayers(value){
 if(!/^1\.[0-9a-f]{7}$/i.test(value))return null;
 const active=[];
 const hex=value.slice(2);
 for(let i=0;i<compactLayerOrder.length;i++){
  const nibble=parseInt(hex[Math.floor(i/4)],16);
  if(nibble&(1<<(i%4)))active.push(compactLayerOrder[i]);
 }
 return active;
}
let restoringShareState=false;
function restoreSharedView(){
 const params=new URLSearchParams(location.search);
 const incomingMode=params.get('m');
 if(incomingMode&&Object.hasOwn(moduleLayerIds,incomingMode))mode=incomingMode;
 if(params.has('l')){
  const raw=params.get('l');
  // Obsługa obu formatów: nowy krótki 1.xxxxxxx oraz wcześniejsze linki z listą.
  const saved=raw.startsWith('1.')?decodeCompactLayers(raw):raw.split(',').filter(id=>urlLayerIds.has(id));
  if(saved!==null){
   selection.clear();for(const id of saved)selection.add(id);
  }
  // Nakładki spoza wybranego modułu muszą pozostać aktywne przy przełączaniu.
  selectedAddons.clear();for(const id of addonLayers)if(selection.has(id)&&!moduleLayerIds[mode].includes(id))selectedAddons.add(id);
  moduleStates[mode]=new Set([...selection].filter(id=>moduleLayerIds[mode].includes(id)));
  // VeloM ukrywa krakowskie trasy, ale odtworzony link ma pierwszeństwo.
  previousInfraSelection=null;
 }
 document.querySelectorAll('[data-mode]').forEach(el=>{const active=el.dataset.mode===mode;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))});
}
function shareURL(){
 const u=new URL(location.href);
 u.searchParams.set('b',basePublic[base]||'plan');
 u.searchParams.set('m',mode);
 u.searchParams.set('l',encodeCompactLayers());
 // Parametry licznika i okresu dotyczą wyłącznie modułu RUCH.
 if(mode!=='ruch')for(const key of ['licznik','okres','wartosc'])u.searchParams.delete(key);
 return u.pathname+u.search+u.hash;
}
function updateShareURL(){
 if(restoringShareState)return;
 history.replaceState(null,'',shareURL());
}

function clearSelection09(){if(activeFeature)clearFeatureHighlight();}
function configureModes(next,{restoreCamera=true}={}){
 if(!moduleLayerIds[next])return;
 if(next!=='ruch')window.DPRuch?.deactivate();
 if(mode===next && !ui.panel.classList.contains('hidden')){if(next==='ruch'){openRuchPanel();return;}renderControls();openPanel('layers');return;}
 if(moduleLayerIds[mode]){moduleStates[mode]=new Set([...selection].filter(id=>moduleLayerIds[mode].includes(id)));snapshotModuleCamera(mode);}
 const nextSelection=moduleStates[next]||new Set(defaults[next]);
 mode=next;clearSelection09();selection.clear();
 for(const id of nextSelection)selection.add(id);
 for(const id of selectedAddons)selection.add(id);
 // Granice pozostają widoczne niezależnie od ustawień.
 document.querySelectorAll('[data-mode]').forEach(el=>{const active=el.dataset.mode===next;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))});
 syncVisibility();renderControls();openPanel('layers');updateShareURL();
 if(restoreCamera)switchModuleCamera(next);
 if(next==='ruch')openRuchPanel();
}

function openRuchPanel(){if(!window.DPRuch)return;const node=document.createElement('div');node.className='dp-ruch-panel';showPanel('Ruch rowerowy','Pomiary automatyczne',{},node);window.DPRuch.activate(node).finally(()=>syncVisibility());}
function renderControls(){
 const box=$('layerControls');box.replaceChildren();const heading=ui.menu.querySelector('.section-head h2');if(heading)heading.textContent=moduleTitles[mode];
 const row=(id,title,swatch)=>{const label=textNode('div','','layer-line'),input=document.createElement('input');input.type='checkbox';input.checked=selection.has(id);input.addEventListener('change',()=>{if(id==='velo'){input.checked?enableVelo():disableVelo()}else{input.checked?selection.add(id):selection.delete(id)}if(addonLayers.includes(id)&&!input.checked)selectedAddons.delete(id);moduleStates[mode]=new Set([...selection].filter(key=>moduleLayerIds[mode].includes(key)));try{syncVisibility();renderControls();updateShareURL()}catch(e){console.error('[DaRoPlan] Nie udało się przełączyć warstwy',id,e);toast('Błąd przełączania warstwy — sprawdź konsolę')} });label.append(input);if(swatch)label.append(swatch);const name=textNode('span',title);name.style.cursor='pointer';name.addEventListener('click',()=>input.click());label.append(name);
  if(addonLayers.includes(id)){
   const pin=textNode('div','','dp-overlay-pin');
   const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=selectedAddons.has(id);
   toggle.title='Zachowaj warstwę także przy przełączaniu modułów';
   toggle.setAttribute('aria-label','Zachowaj jako nakładkę: '+title);
   toggle.addEventListener('change',()=>{
     if(toggle.checked){selectedAddons.add(id);selection.add(id)}else selectedAddons.delete(id);
     moduleStates[mode]=new Set([...selection].filter(key=>moduleLayerIds[mode].includes(key)));
     syncVisibility();renderControls();updateShareURL();
   });
   const pinName=textNode('span','Na innych mapach');pinName.style.cursor='pointer';pinName.addEventListener('click',()=>toggle.click());pin.append(toggle,pinName);label.append(pin);
  }
  return label};
 const swatch=(color,dash)=>{const el=document.createElement('span');el.className='legend-line'+(dash?' '+dash:'');el.style.setProperty('--legend-color',color);el.setAttribute('aria-hidden','true');return el};
 const infraHeader=document.createElement('div');infraHeader.className='infra-header';
 infraHeader.append(row('infra','Infrastruktura rowerowa'));
 const expand=document.createElement('button');expand.type='button';expand.className='expand-infra';expand.textContent=infraExpanded?'▾':'▸';expand.title=infraExpanded?'Zwiń kategorie':'Rozwiń kategorie';expand.setAttribute('aria-expanded',String(infraExpanded));expand.onclick=()=>{infraExpanded=!infraExpanded;renderControls()};infraHeader.append(expand);if(mode==='infra')box.append(infraHeader);
 if(mode==='infra'&&infraExpanded){const wrap=document.createElement('div');wrap.className='infra-children';for(const cat of infraCategories)wrap.append(row(cat.id,cat.name,swatch(cat.color,cat.dash)));box.append(wrap)}
 const legend={suggestions:['#e32626','dotted'],construction:['#ee9a12','dashed'],tempoLines:['#f5d51b',null],tempo20:['#ffb767',null],counters:['#f47a20',null],dasie:['#dc2424',null]};
 for(const layer of layerGroups){if(layer.id==='infra'||!moduleLayerIds[mode].includes(layer.id))continue;const detail=legend[layer.id];box.append(row(layer.id,layer.title,detail?swatch(...detail):null));if(layer.id==='velo'){
 const wrap=document.createElement('div');wrap.className='infra-children';
 for(const [id,title,color,dash] of [['velo-ddr','DDR / CPR','#2456cb',null],['velo-droga','Droga w ruchu ogólnym','#159924','dashed'],['velo-inna','Inna nawierzchnia — uwaga','#e32626','dashed'],['velo-budowa','W budowie','#f3a414','dashed'],['velo-plan','Planowane','#9848ce','dotted'],['velo-nieokreslone','Inne oznaczenia — do weryfikacji','#7d42b3','dotted']])wrap.append(row(id,title,swatch(color,dash)));
 wrap.append(row('velo-objazdy','Objazdy / utrudnienia',swatch('#ff8c24')));
 box.append(wrap);
 const note=textNode('div','Włączenie VeloMałopolski ukrywa sieć Krakowa. Możesz ją ponownie włączyć powyżej.','fixed-layer-note');box.append(note);
 }}
 if(mode!=='wiecej'){const label=textNode('h3','Dodatkowe nakładki');box.append(label);for(const id of addonLayers){const group=layerGroups.find(layer=>layer.id===id);if(group)box.append(row(id,group.title))}}
 if(mode==='wiecej'){
  const help=textNode('p','Warstwy specjalistyczne można nakładać na pozostałe mapy tematyczne.','note');box.prepend(help);
 }
 const fixed=document.createElement('div');fixed.className='fixed-layer-note';fixed.append(swatch('#777','dashed'),textNode('span','Granice Krakowa — zawsze widoczne'));box.append(fixed);
}
// Wyszukiwanie lokalizacji Mapbox Geocoding. Własny indeks treści dodamy w następnym etapie.
async function search(query){if(!query.trim())return;ui.results.classList.remove('hidden');ui.results.replaceChildren(textNode('p','Wyszukiwanie miejsc…'));const controller=new AbortController();if(search.previous)search.previous.abort();search.previous=controller;try{const url='https://api.mapbox.com/geocoding/v5/mapbox.places/'+encodeURIComponent(query)+'.json?access_token='+encodeURIComponent(cfg.token)+'&country=pl&language=pl&limit=6&proximity=19.94,50.06';const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();ui.results.replaceChildren();if(!data.features?.length){ui.results.append(textNode('p','Nie znaleziono lokalizacji.'));return}for(const f of data.features){const btn=document.createElement('button');btn.append(textNode('strong',f.text||'Lokalizacja'),textNode('small',f.place_name||''));btn.addEventListener('click',()=>{ui.results.classList.add('hidden');ui.input.value=f.place_name||f.text;map.flyTo({center:f.center,zoom:Math.max(map.getZoom(),15),essential:true});const nearby=textNode('p','Wybierz obiekt na mapie, aby zobaczyć jego dane. Automatyczne wyszukiwanie powiązanych treści w promieniu miejsca jest kolejnym etapem.');showPanel(f.text||'Lokalizacja','Wynik wyszukiwania',{},nearby)});ui.results.append(btn)}}catch(e){if(e.name!=='AbortError'){ui.results.replaceChildren(textNode('p','Nie udało się wyszukać. Sprawdź dostęp geokodowania dla tokenu Mapbox.'))}}}
function hideLocation(){geoRequest++;if(locationMarker){locationMarker.remove();locationMarker=null;}$('locate').classList.remove('is-active');$('locate').setAttribute('aria-pressed','false');$('locate').title='Pokaż moją lokalizację'}
function init(){base=baseFromURL();restoringShareState=true;restoreSharedView();if(!window.mapboxgl){$('status').textContent='Nie załadowano Mapbox GL JS';toast('Nie udało się załadować Mapbox GL JS');return}mapboxgl.accessToken=cfg.token;map=new mapboxgl.Map({container:'map',style:cfg.basemaps[baseFromURL()],center:cfg.home,zoom:cfg.zoom,maxZoom:16,hash:true,attributionControl:true});map.addControl(new mapboxgl.NavigationControl({showCompass:true}),'bottom-right');map.addControl(new mapboxgl.ScaleControl({unit:'metric',maxWidth:90}),'bottom-left');window.DPRuch?.init(map,{open:()=>{if(mode==='ruch')openRuchPanel()}});map.on('style.load',()=>{styleRevision++;restoreThematicLayers()});map.on('load',()=>{restoreThematicLayers();restoringShareState=false;updateShareURL();if(mode==='ruch'){openRuchPanel();}else{scheduleWelcome();}if(isMobileSheet()&&mode!=='ruch')setMobileSheet('hidden',false)});map.on('moveend',updateShareURL);window.addEventListener('popstate',()=>{const q=new URLSearchParams(location.search);const dest=q.get('m');if(dest&&moduleLayerIds[dest]&&dest!==mode){configureModes(dest,{restoreCamera:false});}if(mode==='ruch'){window.DPRuch?.restoreFromBrowser();if(ui.panel.classList.contains('hidden'))openRuchPanel();}});map.on('error',e=>console.warn('[DaRoPlan Mapbox]',e.error||e));attachClicks();loadAudytyDirect();
Promise.all([detectSourceLayers(),fetch('data/studio-layers.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Brak pliku stylu');return r.json()})]).then(([,data])=>{styleLayers=data;sourcesReady=true;restoreThematicLayers()}).catch(e=>{console.error('[DaRoPlan] Konfiguracja:',e);toast('Nie wczytano konfiguracji Studium / SIM: '+e.message)});
$('layersBtn').addEventListener('click',()=>{if(welcomeTimer){clearTimeout(welcomeTimer);welcomeTimer=null;}const isClosed=ui.panel.classList.contains('hidden')||(isMobileSheet()&&mobileSheet.state==='hidden');if(!isClosed)closePanel();else if(mode==='ruch')openRuchPanel();else {renderControls();openPanel('layers')}});window.addEventListener('resize',()=>{updatePanelTab();if(isMobileSheet())syncMobileSheet(false);else updatePanelCamera(false)});if($('infoClose'))$('infoClose').onclick=()=>{if(mode==='ruch'){openRuchPanel();return;}if(!ui.content.classList.contains('hidden')){clearSelection09();renderControls();openPanel('layers')}else closePanel()};$('panelExpand').onclick=()=>{if(isMobileSheet())return;const expanded=ui.panel.classList.toggle('expanded');$('panelExpand').setAttribute('aria-expanded',String(expanded));$('panelExpand').textContent=expanded?'⌄':'⌃'};setupMobileSheet();setupBaseControl();document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>{configureModes(el.dataset.mode);renderControls()}));$('searchForm').addEventListener('submit',e=>{e.preventDefault();search(ui.input.value)});$('brand').onclick=()=>{if(welcomeTimer){clearTimeout(welcomeTimer);welcomeTimer=null;}showWelcome(0)};$('locate').onclick=()=>{if(locationMarker){hideLocation();return}if(!navigator.geolocation)return toast('Geolokalizacja niedostępna');const requestId=++geoRequest;navigator.geolocation.getCurrentPosition(p=>{if(requestId!==geoRequest)return;const coords=[p.coords.longitude,p.coords.latitude];if(!locationMarker){const dot=document.createElement('div');dot.className='user-location-dot';dot.title='Twoja lokalizacja';locationMarker=new mapboxgl.Marker({element:dot,anchor:'center'}).setLngLat(coords).addTo(map)}else{locationMarker.setLngLat(coords)}$('locate').classList.add('is-active');$('locate').setAttribute('aria-pressed','true');$('locate').title='Ukryj moją lokalizację';map.flyTo({center:coords,zoom:Math.max(map.getZoom(),15),essential:true});},()=>toast('Nie udało się uzyskać lokalizacji. Sprawdź uprawnienia i HTTPS.'),{enableHighAccuracy:true,timeout:12000,maximumAge:30000})};$('share').onclick=async()=>{updateShareURL();try{await navigator.clipboard.writeText(location.href);toast('Skopiowano link do mapy')}catch(e){toast('Adres mapy: '+location.href)}};document.addEventListener('keydown',e=>{if(e.key==='Escape'){ui.results.classList.add('hidden');if(activeFeature){clearSelection09();if(mode==='ruch')openRuchPanel();else{renderControls();openPanel('layers')}}else if(!ui.panel.classList.contains('hidden'))closePanel();else hideLocation()}});// Nowe podpisy i układ 0.9.1 bez przebudowy znanych identyfikatorów HTML.
const captions={infra:['INFRA','struktura'],ruch:['▥','Ruch'],historia:['◷','STORY'],trasy:['⌁','Trasy'],wiecej:['•••','Więcej']};
for(const button of document.querySelectorAll('[data-mode]')){const entry=captions[button.dataset.mode];if(!entry)continue;button.replaceChildren();const icon=textNode('span',entry[0]);icon.className='module-symbol';const label=textNode('small',entry[1]);button.append(icon,label);button.title=button.dataset.mode==='infra'?'Infrastruktura':entry[1];
if(button.dataset.mode==='ruch'||button.dataset.mode==='trasy'){
 const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
 const paths=button.dataset.mode==='ruch'?[['path',{d:'M3 3v18h18'}],['path',{d:'m6 16 5-6 4 3 5-8'}]]:[['circle',{cx:'5',cy:'6',r:'2'}],['circle',{cx:'19',cy:'7',r:'2'}],['circle',{cx:'12',cy:'18',r:'2'}],['path',{d:'M7 6.2 17 7M18 9l-5 7M11 16 6 8'}]];
 for(const [tag,attrs] of paths){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);svg.appendChild(node)}icon.replaceChildren(svg)
}}
renderControls();}
init();
})();

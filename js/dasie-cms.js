/* DaRoPlan 2.0 · DASIE WordPress GeoJSON adapter (read only).
 * Each Feature represents a DASIE-entry-to-geometry relation.
 * Keep Feature.id: geometry_id alone is NOT unique across entries.
 */
(()=>{
'use strict';
const ENDPOINT='https://lab.otwartyplan.org/wp-json/daroplan/v1/dasie';
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validCoord=point=>Array.isArray(point)&&point.length>=2&&point.slice(0,2).every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90;
function normalize(payload){
 if(!isObject(payload)||payload.type!=='FeatureCollection'||!Array.isArray(payload.features))
  throw new Error('DASIE CMS: oczekiwano GeoJSON FeatureCollection');
 const features=payload.features.map((feature,index)=>{
  if(!isObject(feature)||feature.type!=='Feature'||!isObject(feature.properties)||!isObject(feature.geometry))
   throw new Error('DASIE CMS: niepoprawny Feature nr '+(index+1));
  const {type,coordinates}=feature.geometry;
  const valid=type==='Point'?validCoord(coordinates):
   type==='LineString'&&Array.isArray(coordinates)&&coordinates.length>=2&&coordinates.every(validCoord);
  if(!valid)throw new Error('DASIE CMS: niepoprawna geometria nr '+(index+1));
  if(feature.id===undefined||feature.id===null||String(feature.id).trim()==='')
   throw new Error('DASIE CMS: brak identyfikatora relacji nr '+(index+1));
  const props={...feature.properties};
  // X identifiers can exceed Number.MAX_SAFE_INTEGER: never use Number().
  if(props.tweet_id!==undefined&&props.tweet_id!==null)props.tweet_id=String(props.tweet_id).trim();
  return {type:'Feature',id:String(feature.id),geometry:{type,coordinates:type==='Point'?coordinates.slice(0,2):coordinates.map(p=>p.slice(0,2))},properties:props};
 });
 const ids=new Set();
 for(const feature of features){
  if(ids.has(feature.id))throw new Error('DASIE CMS: powtórzony identyfikator relacji '+feature.id);
  ids.add(feature.id);
 }
 return {type:'FeatureCollection',features};
}
// API stronicuje po wpisach DASIE (najwyżej 500 na stronę). Pobieramy WSZYSTKIE strony,
// aby archiwum nigdy nie było pokazane częściowo ani odrzucone po przekroczeniu jednej strony.
const PER_PAGE=500;
const MAX_PAGES=40;
function totalPages(payload){
 const page=isObject(payload)?payload.pagination:null;
 if(!isObject(page))return 1;
 const n=Number(page.total_pages||page.pages||1);
 return Number.isFinite(n)&&n>=1?Math.floor(n):1;
}
async function fetchPage(page,signal){
 const response=await fetch(ENDPOINT+'?per_page='+PER_PAGE+'&page='+page,{mode:'cors',credentials:'omit',headers:{Accept:'application/json'},signal,cache:'no-store'});
 if(!response.ok)throw new Error('DASIE CMS: HTTP '+response.status+' (strona '+page+')');
 return response.json();
}
async function load({signal}={}){
 const first=await fetchPage(1,signal);
 const pages=totalPages(first);
 if(pages>MAX_PAGES)throw new Error('DASIE CMS: nieoczekiwana liczba stron: '+pages);
 const features=normalize(first).features.slice();
 for(let page=2;page<=pages;page++){
  for(const feature of normalize(await fetchPage(page,signal)).features)features.push(feature);
 }
 // Identyfikator relacji musi być unikalny także pomiędzy stronami.
 const ids=new Set();
 for(const feature of features){
  if(ids.has(feature.id))throw new Error('DASIE CMS: powtórzony identyfikator relacji '+feature.id);
  ids.add(feature.id);
 }
 if(!features.length)throw new Error('DASIE CMS: brak opublikowanych geometrii');
 return {type:'FeatureCollection',features};
}
window.DPDasieCMS=Object.freeze({load,normalize,endpoint:ENDPOINT});
})();

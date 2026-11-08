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
 // Do not silently show an incomplete archive if pagination grows beyond page 1.
 const page=payload.pagination;
 if(isObject(page)&&(Number(page.total_pages||page.pages||1)>1||page.has_more===true||page.next_page!=null))
  throw new Error('DASIE CMS: API zwróciło więcej niż jedną stronę; wymagane stronicowanie');
 return {type:'FeatureCollection',features};
}
async function load({signal}={}){
 const response=await fetch(ENDPOINT,{mode:'cors',credentials:'omit',headers:{Accept:'application/json'},signal,cache:'no-store'});
 if(!response.ok)throw new Error('DASIE CMS: HTTP '+response.status);
 const fc=normalize(await response.json());
 if(!fc.features.length)throw new Error('DASIE CMS: brak opublikowanych geometrii');
 return fc;
}
window.DPDasieCMS=Object.freeze({load,normalize,endpoint:ENDPOINT});
})();

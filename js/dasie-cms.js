/* DaRoPlan 2.0 · DASIE WordPress adapter (read only).
 * Geometry must be explicitly published by the CMS; no inferred coordinates.
 * Accepted: GeoJSON FeatureCollection, or stories/scenes with GeoJSON geometry.
 */
(()=>{
'use strict';
const ENDPOINT='https://lab.otwartyplan.org/wp-json/daroplan/v1/stories';
const isObject=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const validCoord=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
function geometry(value){
 if(!isObject(value))return null;
 if(value.type==='Feature')return geometry(value.geometry);
 if(value.type==='Point'&&validCoord(value.coordinates))return {type:'Point',coordinates:value.coordinates.slice(0,2)};
 if(value.type==='LineString'&&Array.isArray(value.coordinates)&&value.coordinates.length>=2&&value.coordinates.every(validCoord))
  return {type:'LineString',coordinates:value.coordinates.map(p=>p.slice(0,2))};
 if(value.type==='MultiPoint'&&Array.isArray(value.coordinates)&&value.coordinates.length&&value.coordinates.every(validCoord))
  return {type:'MultiPoint',coordinates:value.coordinates.map(p=>p.slice(0,2))};
 if(value.type==='MultiLineString'&&Array.isArray(value.coordinates)&&value.coordinates.length&&value.coordinates.every(line=>Array.isArray(line)&&line.length>=2&&line.every(validCoord)))
  return {type:'MultiLineString',coordinates:value.coordinates.map(line=>line.map(p=>p.slice(0,2)))};
 return null;
}
const plain=o=>isObject(o)?o:{};
const str=v=>typeof v==='string'?v:'';
function pickTweetId(...objects){
 for(const o of objects){
  const p=plain(o);
  for(const field of ['tweet_id','tweetId']){
   if(p[field]!==undefined&&p[field]!==null&&String(p[field]).trim())return String(p[field]).trim();
  }
 }
 return '';
}
function normalProperties(props,item,scene,story){
 const p={...plain(props)},i=plain(item),s=plain(scene),t=plain(story);
 const tweetId=pickTweetId(p,i,s,t,p.meta,i.meta,s.meta,t.meta);
 if(tweetId)p.tweet_id=tweetId;
 const name=str(p.name)||str(i.name)||str(s.title)||str(t.title)||str(p.title)||'DASIE';
 if(!p.name)p.name=name;
 if(!p.title)p.title=name;
 // Historical CMS may associate a story/scene with many features.
 if(!p.story_id&&t.id!=null)p.story_id=String(t.id);
 if(!p.scene_id&&s.id!=null)p.scene_id=String(s.id);
 return p;
}
const features=[];
const keys=new Set();
function pushGeometry(candidate,props,item,scene,story){
 const g=geometry(candidate);
 if(!g)return;
 const p=normalProperties(props,item,scene,story);
 const key=JSON.stringify([g,p.tweet_id||'',p.story_id||'',p.scene_id||'']);
 if(keys.has(key))return;
 keys.add(key);
 features.push({type:'Feature',geometry:g,properties:p});
}
function traverse(input,story=null,scene=null,depth=0){
 if(depth>7||input==null)return;
 if(Array.isArray(input)){for(const x of input)traverse(x,story,scene,depth+1);return}
 if(!isObject(input))return;
 if(input.type==='FeatureCollection'&&Array.isArray(input.features)){
  for(const f of input.features)traverse(f,story,scene,depth+1);
  return;
 }
 if(input.type==='Feature'){
  pushGeometry(input.geometry,input.properties,input,scene,story);return;
 }
 const g=geometry(input);
 if(g){pushGeometry(g,input.properties,input,scene,story);return}
 const s=input.scenes||input.drp_scenes;
 const currentStory=s?input:story;
 const currentScene=story&&!s?input:scene;
 for(const key of ['geometry','geojson','map_geometry','map_geojson','feature']){
  const value=input[key];
  if(value)traverseGeometry(value,input,currentScene,currentStory,depth+1);
 }
 for(const key of ['features','geometries','points','lines']){
  if(Array.isArray(input[key]))for(const item of input[key])traverse(item,currentStory,currentScene,depth+1);
 }
 if(Array.isArray(s))for(const x of s)traverse(x,currentStory,null,depth+1);
 // Native WP REST: a story may expose a nested scene list as a non-array object.
 if(isObject(s))for(const x of Object.values(s))traverse(x,currentStory,null,depth+1);
}
function traverseGeometry(value,parent,scene,story,depth){
 if(Array.isArray(value)){for(const v of value)traverseGeometry(v,parent,scene,story,depth+1);return}
 if(!isObject(value))return;
 if(value.type==='FeatureCollection'){for(const f of value.features||[])traverseGeometry(f,parent,scene,story,depth+1);return}
 if(value.type==='Feature'){pushGeometry(value.geometry,{...plain(parent.properties),...plain(value.properties)},parent,scene,story);return}
 const g=geometry(value);
 if(g){pushGeometry(g,parent.properties,parent,scene,story);return}
 traverse(value,story,scene,depth+1);
}
function normalize(payload){
 features.length=0;keys.clear();
 if(Array.isArray(payload))traverse(payload);
 else if(isObject(payload)){
  if(payload.type==='FeatureCollection')traverse(payload);
  else if(Array.isArray(payload.stories))traverse(payload.stories);
  else if(Array.isArray(payload.items))traverse(payload.items);
  else if(Array.isArray(payload.results))traverse(payload.results);
  else traverse(payload);
 }else throw new Error('DASIE CMS: nieobsługiwany format odpowiedzi');
 return {type:'FeatureCollection',features:features.slice()};
}
async function load({signal}={}){
 const response=await fetch(ENDPOINT,{mode:'cors',credentials:'omit',headers:{Accept:'application/json'},signal,cache:'no-store'});
 if(!response.ok)throw new Error('DASIE CMS: HTTP '+response.status);
 const payload=await response.json();
 const fc=normalize(payload);
 if(!fc.features.length)throw new Error('DASIE CMS: brak poprawnych geometrii; pozostawiamy tileset Mapbox');
 return fc;
}
window.DPDasieCMS=Object.freeze({load,normalize,endpoint:ENDPOINT});
})();

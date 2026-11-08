/* DaRoPlan Landrynki — odizolowany klient publicznego REST API WordPressa.
 * Nie tworzy warstw mapy, nie modyfikuje panelu i nie wykonuje zapytań automatycznie.
 * Użycie w następnym etapie: window.DPLandrynkiAPI.list() / .detail(id).
 */
(()=>{
 'use strict';
 const API='https://lab.otwartyplan.org/wp-json/daroplan/v1/landrynki';
 const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const asText=x=>typeof x==='string'?x:'';
 function imageURL(value){
  if(!value)return '';
  try{
   const url=new URL(String(value));
   return url.protocol==='https:'?url.href:'';
  }catch(_){return ''}
 }
 function normalizeSummary(x){
  if(!isRecord(x)||!Number.isSafeInteger(Number(x.id))||Number(x.id)<=0) return null;
  return Object.freeze({
   id:Number(x.id),
   title:asText(x.title),
   routeCount:Number.isInteger(x.route_count)&&x.route_count>=0?x.route_count:0,
   excerpt:asText(x.excerpt),
   featuredImageUrl:imageURL(x.featured_image_url)
  });
 }
 async function getJSON(url,{signal}={}){
  const res=await fetch(url,{method:'GET',mode:'cors',credentials:'omit',headers:{Accept:'application/json'},signal});
  if(!res.ok)throw new Error('Landrynki API: HTTP '+res.status);
  return res.json();
 }
 async function list(options={}){
  const data=await getJSON(API,options);
  if(!Array.isArray(data))throw new Error('Landrynki API: odpowiedź listy nie jest tablicą');
  return data.map(normalizeSummary).filter(Boolean);
 }
 async function detail(id,options={}){
  const key=Number(id);
  if(!Number.isSafeInteger(key)||key<=0)throw new TypeError('Landrynki API: nieprawidłowy identyfikator');
  const data=await getJSON(API+'/'+key,options);
  if(!isRecord(data)||!Array.isArray(data.routes))throw new Error('Landrynki API: nieprawidłowe szczegóły paczuszki');
  const routes=data.routes.map(route=>{
   if(!isRecord(route)||typeof route.id!=='string'||!Array.isArray(route.geometry?.coordinates)||route.geometry?.type!=='LineString')return null;
   const coordinates=route.geometry.coordinates.filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90).map(p=>[p[0],p[1]]);
   if(coordinates.length<2)return null;
   const color=/^#[0-9a-f]{6}$/i.test(route.color||'')?route.color:'#e34c54';
   const youtubeId=/^[a-zA-Z0-9_-]{11}$/.test(route.youtube_id||'')?route.youtube_id:'';
   return {id:route.id,name:asText(route.name)||route.id,color,coordinates,youtubeId,description:asText(route.description)};
  }).filter(Boolean);
  return {id:key,title:asText(data.title),descriptionHtml:asText(data.description_html),excerpt:asText(data.excerpt),featuredImageUrl:imageURL(data.featured_image_url),routes};
 }
 window.DPLandrynkiAPI=Object.freeze({list,detail,normalizeSummary});
})();

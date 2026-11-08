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
  // Schemat odpowiedzi szczegółowej zostanie zweryfikowany na /286 przed implementacją animacji.
  const data=await getJSON(API+'/'+key,options);
  if(!isRecord(data))throw new Error('Landrynki API: nieprawidłowy obiekt szczegółów');
  return data;
 }
 window.DPLandrynkiAPI=Object.freeze({list,detail,normalizeSummary});
})();

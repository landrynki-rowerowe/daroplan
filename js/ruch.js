/* DaRoPlan RUCH A — odczyt tego samego cache co /dane/; brak embed i ponownych agregacji. */
(()=>{'use strict';
const ROOT='/dane/', PERM=ROOT+'cache/permanent/';
const urls={meta:PERM+'meta_periods.json',geo:ROOT+'data/counters.geojson'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('pl-PL'):'—';
const modeNames={month:'Miesiąc',quarter:'Kwartał',year:'Rok'};
// Nazwy parametrów identyczne jak w /dane/: licznik, okres, wartosc.
const readURL=()=>{const u=new URL(location.href);return {id:u.searchParams.get('licznik'),mode:u.searchParams.get('okres'),period:u.searchParams.get('wartosc')}};
function saveURL(push=true){if(!active)return;const u=new URL(location.href);u.searchParams.set('m','ruch');u.searchParams.set('okres',mode);if(period)u.searchParams.set('wartosc',period);if(selected)u.searchParams.set('licznik',selected);else u.searchParams.delete('licznik');const next=u.pathname+u.search+u.hash;if(next!==location.pathname+location.search+location.hash)history[push?'pushState':'replaceState'](null,'',next);}
function restoreURL(){const u=readURL();if(meta&&['month','quarter','year'].includes(u.mode)&&u.period&&((u.mode==='month'?meta.months:u.mode==='quarter'?meta.quarters:meta.years.map(String))||[]).map(String).includes(u.period)){mode=u.mode;period=u.period;}else if(meta&&!period){period=String(meta.last_full_month)}selected=u.id||null;}
let map=null,callbacks=null,meta=null,geo=null,mode='month',period='',overview=null,details=null,selected=null,container=null,token=0,charts=[],active=false,weather=null,baseline=null,previous=null,previousOverview=null,previousDetails=null;
const fetchJSON=async url=>{const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status+' · '+url);return res.json()};
const periods=()=>meta?(mode==='month'?meta.months:mode==='quarter'?meta.quarters:meta.years.map(String)):[];
const selectedItem=()=>overview?.items?.find(i=>String(i.id)===selected);
const labelPeriod=p=>mode==='month'?new Date(p+'-01T12:00:00').toLocaleDateString('pl-PL',{month:'long',year:'numeric'}):mode==='quarter'?p.replace('-Q',' · kwartał '):p;
function unloadCharts(){charts.forEach(ch=>ch.destroy());charts=[];}
function hasLayer(){return Boolean(map?.getLayer('dp-ruch-points'));}
function install(){if(!map||!map.isStyleLoaded())return;try{
 const contrast=callbacks?.highContrastBase?.();
 const pointColor=contrast?'#69b8ff':'#0d6efd';
 if(!map.getSource('dp-ruch-live'))map.addSource('dp-ruch-live',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 if(!hasLayer())map.addLayer({id:'dp-ruch-points',type:'circle',source:'dp-ruch-live',paint:{'circle-radius':['interpolate',['linear'],['to-number',['coalesce',['get','period_sum'],0]],0,4,1,18], 'circle-color':pointColor,...(contrast?{'circle-emissive-strength':1}:{}),'circle-stroke-color':'#fff','circle-stroke-width':contrast?0:1.5,'circle-opacity':.92}});
 if(!map.getLayer('dp-ruch-selected'))map.addLayer({id:'dp-ruch-selected',type:'circle',source:'dp-ruch-live',filter:['==',['get','id'],'__none__'],paint:{'circle-radius':['interpolate',['linear'],['to-number',['coalesce',['get','period_sum'],0]],0,8,1,23],'circle-color':pointColor,...(contrast?{'circle-emissive-strength':1}:{}),'circle-stroke-color':'#101010','circle-stroke-width':contrast?0:3}});
 // TOP 5 według średniej dziennej; białe numery na niebieskich punktach.
 if(!map.getLayer('dp-ruch-ranking'))map.addLayer({id:'dp-ruch-ranking',type:'symbol',source:'dp-ruch-live',filter:['>', ['to-number',['coalesce',['get','rank'],0]],0],layout:{'text-field':['to-string',['get','rank']],'text-size':13,'text-font':['Open Sans Bold','Arial Unicode MS Bold'],'text-anchor':'center','text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':contrast?'#172b37':'#fff','text-emissive-strength':contrast?1:0,'text-halo-color':'rgba(0,0,0,0.22)','text-halo-width':0.6}});
 if(!map.getLayer('dp-ruch-labels'))map.addLayer({id:'dp-ruch-labels',type:'symbol',source:'dp-ruch-live',layout:{'text-field':['coalesce',['get','name'],''],'text-size':11,'text-font':['Open Sans Regular','Arial Unicode MS Regular'],'text-anchor':'top','text-offset':[0,1.25],'text-allow-overlap':false,'text-ignore-placement':false,'symbol-sort-key':['to-number',['coalesce',['get','period_sum'],0]]},paint:{'text-color':contrast?'#eff6ff':'#182536','text-emissive-strength':contrast?1:0,'text-halo-color':contrast?'#172b37':'rgba(255,255,255,0.95)','text-halo-width':1.6,'text-halo-blur':0.5}});
 syncMap();
 }catch(e){console.warn('[RUCH] Warstwy mapy:',e)}}
function syncMap(){if(!map||!map.getSource('dp-ruch-live'))return;
 const full=(overview?.items||[]).filter(i=>i.is_full);
 // Miejsce w rankingu: średnia dzienna, niezależnie od porządku arkusza.
 const top5=[...full].filter(i=>i.avg_daily!=null&&Number.isFinite(Number(i.avg_daily)))
   .sort((a,b)=>Number(b.avg_daily)-Number(a.avg_daily)||String(a.name??'').localeCompare(String(b.name??''),'pl',{sensitivity:'base',numeric:true}))
   .slice(0,5);
 const ranks=new Map(top5.map((i,index)=>[String(i.id),index+1]));
 const byId=new Map(full.map(i=>[String(i.id),i]));const max=Math.max(1,...full.map(i=>Number(i.period_sum??i.month_sum??0)));
 const features=(geo?.features||[]).filter(f=>byId.has(String(f.properties?.id))).map(f=>({type:'Feature',geometry:f.geometry,properties:{...f.properties,period_sum:Number(byId.get(String(f.properties.id)).period_sum??byId.get(String(f.properties.id)).month_sum??0),rank:ranks.get(String(f.properties.id))??0,name:f.properties?.name||byId.get(String(f.properties.id)).name}}));
 map.getSource('dp-ruch-live').setData({type:'FeatureCollection',features});
 const radius=['interpolate',['linear'],['to-number',['coalesce',['get','period_sum'],0]],0,4,max,18];
 for(const id of ['dp-ruch-points','dp-ruch-selected'])if(map.getLayer(id)){map.setPaintProperty(id,'circle-radius',id==='dp-ruch-selected'?['+',radius,5]:radius);map.setLayoutProperty(id,'visibility',active?'visible':'none')}
 if(map.getLayer('dp-ruch-selected'))map.setFilter('dp-ruch-selected',['==',['get','id'],selected||'__none__']);
 if(map.getLayer('dp-ruch-ranking'))map.setLayoutProperty('dp-ruch-ranking','visibility',active?'visible':'none');
 if(map.getLayer('dp-ruch-labels'))map.setLayoutProperty('dp-ruch-labels','visibility',active?'visible':'none');
}
function boxCanvas(title,id){const section=document.createElement('section');section.className='dp-ruch-chart';section.innerHTML='<h3>'+esc(title)+'</h3><div class="dp-ruch-canvas"><canvas id="'+id+'"></canvas></div>';container.append(section);return section.querySelector('canvas')}
function drawChart(canvas,type,labels,values,extra={}){if(!window.Chart||!canvas)return;const ch=new Chart(canvas,{type,data:{labels,datasets:[{label:extra.label||'Rowerzyści',data:values,borderColor:extra.color||'#0d6efd',backgroundColor:extra.fill||'rgba(13,110,253,.32)',borderWidth:2,pointRadius:type==='line'?1:0,tension:.17,...extra.dataset}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:Boolean(extra.legend)}},scales:{x:{ticks:{maxTicksLimit:8,maxRotation:0}},y:{beginAtZero:true}}}});charts.push(ch)}

// Te same definicje porównań i średnich co na stronie DANE.
const pctDelta=(now,ref)=>now==null||ref==null||!Number.isFinite(Number(now))||!Number.isFinite(Number(ref))||Number(ref)===0?null:Math.round((Number(now)-Number(ref))/Number(ref)*100);
const median=a=>{const v=a.filter(n=>Number.isFinite(n)).sort((a,b)=>a-b);if(!v.length)return null;const mid=Math.floor(v.length/2);return v.length%2?v[mid]:(v[mid-1]+v[mid])/2};
const deltaText=n=>n==null?'—':(n>0?'↑ ':n<0?'↓ ':'')+Math.abs(n)+'%';
const averages=a=>{let sums=[0,0,0],counts=[0,0,0];for(const row of (a||[])){const dow=new Date(row.date+'T12:00:00').getDay(),c=Number(row.count)||0,i=(dow===0||dow===6)?2:1;sums[0]+=c;sums[i]+=c;counts[0]++;counts[i]++}return sums.map((v,i)=>counts[i]?Math.round(v/counts[i]):0)};
const prevPeriod=()=>{let key=null;if(mode==='month'){key=(Number(period.slice(0,4))-1)+period.slice(4)}else if(mode==='quarter'){key=(Number(period.slice(0,4))-1)+period.slice(4)}else{key=String(Number(period)-1)}return periods().map(String).includes(key)?key:null};
const fullDatePL=date=>{if(!date)return '—';const d=new Date(String(date)+'T12:00:00');return Number.isNaN(d.getTime())?String(date):d.toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'})};
const deltaHTML=(n,caption)=>'<div class="dp-ruch-delta-line"><span class="dp-ruch-delta '+(n==null?'dp-ruch-muted':n>0?'dp-ruch-positive':n<0?'dp-ruch-negative':'dp-ruch-neutral')+'">'+esc(deltaText(n))+'</span><span class="dp-ruch-delta-caption">'+esc(caption)+'</span></div>';
function metrics(items){const section=document.createElement('section');section.className='dp-ruch-metrics';for(const item of items){const [label,value,sub]=item;const node=document.createElement('div');node.className='dp-ruch-metric';const trendClass=typeof value==='string'&&/^[↑↓]/.test(value)?(value.startsWith('↑')?'dp-ruch-positive':'dp-ruch-negative'):'';node.innerHTML='<small>'+esc(label)+'</small><strong'+(trendClass?' class="'+trendClass+'"':'')+'>'+esc(value)+'</strong>'+(label==='Suma przejazdów i opadów'?'<span class="dp-ruch-combined-rain">Suma opadów: '+esc(item[3])+'</span>':'')+(Array.isArray(sub)?'<div class="dp-ruch-deltas">'+sub.map(x=>deltaHTML(x[0],x[1])).join('')+'</div>':sub?'<span class="dp-ruch-meta">'+esc(sub)+'</span>':'');section.append(node)}container.append(section)}
function addExports(canvas,rows,name){const bar=document.createElement('div');bar.className='dp-ruch-exports';const csv=document.createElement('button');csv.type='button';csv.textContent='CSV';csv.onclick=()=>{const text='\ufeff'+rows.map(row=>row.map(v=>String(v??'').replaceAll(';',',')).join(';')).join('\r\n');const u=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='ruch_'+name+'_'+period+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1500)};const png=document.createElement('button');png.type='button';png.textContent='PNG';png.onclick=()=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='ruch_'+name+'_'+period+'.png';a.click()};bar.append(csv,png);canvas.closest('.dp-ruch-chart').append(bar)}
function hourlyChart(raw,old,title,id,color){if(!Array.isArray(raw)||!raw.length)return;const canvas=boxCanvas(title,id);const labels=raw.map(x=>x.hour);const datasets=[{label:'minimum',data:raw.map(x=>x.min),borderColor:'transparent',pointRadius:0},{label:'Zakres min–max',data:raw.map(x=>x.max),fill:'-1',borderColor:'transparent',backgroundColor:color==='green'?'rgba(25,135,84,.12)':'rgba(220,53,69,.12)',pointRadius:0},{label:color==='green'?'dni powszednie':'weekend',data:raw.map(x=>x.avg),borderColor:color==='green'?'#198754':'#dc3545',tension:.25,pointRadius:0},{label:'typowy ruch',data:raw.map(x=>x.median),borderColor:'rgba(102,16,242,.65)',tension:.25,pointRadius:0}];if(old?.length)datasets.push({label:'rok wcześniej',data:old.map(x=>x.avg),borderColor:'#adb5bd',pointRadius:0});charts.push(new Chart(canvas,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{tooltip:{callbacks:{label:ctx=>{const names=['minimum','maksimum',color==='green'?'dni powszednie':'weekend','typowy ruch','rok wcześniej'];return names[ctx.datasetIndex]+': '+fmt(ctx.parsed.y)}}},legend:{labels:{filter:item=>item.text!=='minimum',boxWidth:10,font:{size:10}},onClick:(event,item,legend)=>{const chart=legend.chart;if(item.text==='Zakres min–max'){const show=!chart.isDatasetVisible(1);chart.setDatasetVisibility(0,show);chart.setDatasetVisibility(1,show);chart.update();}else Chart.defaults.plugins.legend.onClick(event,item,legend);}}},scales:{y:{beginAtZero:true},x:{ticks:{maxTicksLimit:8}}}}}));addExports(canvas,[['Godzina','Średnia','Mediana','Minimum','Maksimum','Rok wcześniej'],...raw.map((x,i)=>[x.hour,x.avg,x.median,x.min,x.max,old?.[i]?.avg??''])],id)}
function drawDetails(){if(!container||!selected||!details)return;const c=details.counters?.[selected];if(!c)return;const old=previousDetails?.counters?.[selected];const avg=averages(c.daily);const avgOld=old?.daily?.length?averages(old.daily):null;const base=baseline?.items?.find(x=>String(x.id)===selected);let rain=0,warm=null;for(const x of (c.daily||[])){const w=weather?.[x.date];if(!w)continue;rain+=Number(w.precip_sum)||0;if(w.temp_max!=null&&(!warm||Number(w.temp_max)>Number(warm.temp_max)))warm={date:x.date,temp_max:w.temp_max}}
 const pair=(v,med,oldv)=>[[pctDelta(v,med),'do typowego ruchu'],[avgOld?pctDelta(v,oldv):null,'do roku wcześniej']];
 metrics([['Suma przejazdów i opadów',fmt(c.total),'nie unikalni rowerzyści',weather?fmt(Math.round(rain*10)/10)+' mm':'—'],['Najcieplejszy dzień',warm?fmt(warm.temp_max)+' °C':'—',fullDatePL(warm?.date)],['Najlepszy dzień',c.best_day?fmt(c.best_day.count):'—',fullDatePL(c.best_day?.date)],['Średnia dzienna',fmt(avg[0]),pair(avg[0],base?.median_daily,avgOld?.[0])],['Średnia dnia powszedniego',fmt(avg[1]),pair(avg[1],base?.median_weekday,avgOld?.[1])],['Średnia weekendowa',fmt(avg[2]),pair(avg[2],base?.median_weekend,avgOld?.[2])]]);
 const daily=Array.isArray(c.daily)?c.daily:[];
 const dayCanvas=boxCanvas('Pomiary dzienne i pogoda','ruchDaily');
 if(window.Chart){
  const labels=daily.map(x=>x.date?.slice(5)||'');
  const w=daily.map(x=>weather?.[x.date]||{});
  charts.push(new Chart(dayCanvas,{type:'bar',data:{labels,datasets:[
   {type:'bar',label:'Suma dzienna',data:daily.map(x=>Number(x.count)||0),yAxisID:'y',backgroundColor:'rgba(13,110,253,0.7)',borderColor:'#0d6efd',borderWidth:1,borderRadius:4,order:3},
   {type:'line',label:'Śr. temp. [°C]',data:w.map(x=>x.temp_avg??null),yAxisID:'yWeather',borderColor:'#dc3545',backgroundColor:'rgba(220,53,69,0.15)',pointRadius:0,tension:.25,order:1},
   {type:'line',label:'Min temp. [°C]',data:w.map(x=>x.temp_min??null),yAxisID:'yWeather',borderColor:'rgba(13,110,253,0.8)',borderDash:[5,4],pointRadius:0,tension:.2,order:1},
   {type:'line',label:'Max temp. [°C]',data:w.map(x=>x.temp_max??null),yAxisID:'yWeather',borderColor:'rgba(220,53,69,0.8)',borderDash:[5,4],pointRadius:0,tension:.2,order:1},
   {type:'bar',label:'Opad [mm]',data:w.map(x=>x.precip_sum??null),yAxisID:'yWeather',backgroundColor:'rgba(25,135,84,0.22)',borderColor:'rgba(25,135,84,0.65)',borderWidth:1,barThickness:4,hidden:true,order:1}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},scales:{x:{ticks:{maxTicksLimit:7,maxRotation:0}},y:{beginAtZero:true,position:'left'},yWeather:{position:'right',grid:{drawOnChartArea:false}}},plugins:{tooltip:{callbacks:{title:items=>fullDatePL(daily[items[0]?.dataIndex]?.date),label:ctx=>{const labels=['suma dzienna','średnia','minimalna','maksymalna','opad'];const name=labels[ctx.datasetIndex]||ctx.dataset.label;const value=ctx.parsed.y;return name+': '+(value==null?'—':fmt(value))+(ctx.datasetIndex===0?'':ctx.datasetIndex===4?' mm':' °C')}}},legend:{display:true,labels:{boxWidth:10,font:{size:10}}}}}}));
 }
 hourlyChart(c.hourly_weekday,old?.hourly_weekday,'Profil godzinowy · dni powszednie','weekdayHourly','green');
 hourlyChart(c.hourly_weekend,old?.hourly_weekend,'Profil godzinowy · weekendy','weekendHourly','red');
 if(Array.isArray(c.weekday_stats)&&c.weekday_stats.length){const rows=c.weekday_stats,canvas=boxCanvas('Dni tygodnia · średnie i mediany','weekdayStats');charts.push(new Chart(canvas,{type:'bar',data:{labels:rows.map(x=>x.weekday),datasets:[{label:'Średnia',data:rows.map(x=>x.avg),backgroundColor:'rgba(13,110,253,.7)'},{label:'Mediana',data:rows.map(x=>x.median),backgroundColor:'rgba(102,16,242,.6)'}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:true}},scales:{y:{beginAtZero:true}}}}));addExports(canvas,[['Dzień','Średnia','Mediana'],...rows.map(x=>[x.weekday,x.avg,x.median])],'dni-tygodnia')}
 addExports(dayCanvas,[['Data','Przejazdy','Temperatura średnia','Opad'],...daily.map(x=>[x.date,x.count,weather?.[x.date]?.temp_avg??'',weather?.[x.date]?.precip_sum??''])],'dni');

}
function render(){if(!container||!active)return;unloadCharts();container.replaceChildren();
 const nav=document.createElement('section');nav.className='dp-ruch-nav';nav.innerHTML='<div class="dp-ruch-period"><label>Okres <select id="dpRuchMode">'+Object.entries(modeNames).map(([k,v])=>'<option value="'+k+'"'+(mode===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label></div><div class="dp-ruch-arrows"><button id="dpRuchPrev" aria-label="Poprzedni okres">‹</button><strong id="dpRuchPeriod">'+esc(labelPeriod(period))+'</strong><button id="dpRuchNext" aria-label="Następny okres">›</button></div><div class="dp-ruch-arrows"><button id="dpRuchPrevYear">Rok wcześniej</button><button id="dpRuchNextYear">Rok później</button></div>';
 const topline=document.createElement('div');topline.className='dp-ruch-topline';
 const controls=document.createElement('div');controls.className='dp-ruch-controls';
 controls.append(...Array.from(nav.children));
 const status=document.createElement('div');status.className='dp-ruch-selection';
 topline.append(controls,status);nav.append(topline);
 container.append(nav);nav.querySelector('#dpRuchMode').onchange=async e=>{mode=e.target.value;period=String(meta[{'month':'last_full_month','quarter':'last_full_quarter','year':'last_full_year'}[mode]]);saveURL();await loadPeriod()};
 const arr=periods(),index=arr.indexOf(String(period));
 for(const [id,offset] of [['dpRuchPrev',-1],['dpRuchNext',1]]){const b=nav.querySelector('#'+id);b.disabled=index+offset<0||index+offset>=arr.length;b.onclick=()=>{period=String(arr[index+offset]);saveURL();loadPeriod()}};
 const jump=mode==='month'?12:mode==='quarter'?4:1;
 for(const [id,offset] of [['dpRuchPrevYear',-jump],['dpRuchNextYear',jump]]){const b=nav.querySelector('#'+id);b.disabled=index+offset<0||index+offset>=arr.length;b.onclick=()=>{period=String(arr[index+offset]);saveURL();loadPeriod()}};
 if(!overview){container.append(Object.assign(document.createElement('p'),{textContent:'Ładowanie wyników…'}));return}
 if(selected&&!overview.items?.some(i=>String(i.id)===selected&&i.is_full))selected=null;
 const full=(overview.items||[]).filter(i=>i.is_full);
 if(!selected){status.textContent='Kliknij w punkt na mapie, aby zobaczyć szczegółowe wyniki pomiarów.';}else{
  const c=details?.counters?.[selected];const props=(geo?.features||[]).find(f=>String(f.properties?.id)===selected)?.properties||{};
  const head=document.createElement('div');head.className='dp-ruch-counter-description';
  const title=document.createElement('strong');title.textContent=c?.name||props.name||selected;head.append(title);
  for(const [value,cls] of [[props.lead,'dp-ruch-lead'],[props.description,'dp-ruch-description']]){if(value){const p=document.createElement('p');p.className=cls;p.textContent=value;head.append(p);}}
  const back=document.createElement('button');back.type='button';back.className='dp-ruch-reset';back.textContent='↺ Resetuj wybór';back.onclick=()=>selectCounter('');head.append(back);status.append(head);
 }
 if(selected&&details?.counters?.[selected])drawDetails();else{
 const prevItems=new Map((previousOverview?.items||[]).map(x=>[String(x.id),x]));const differences=[[],[],[]];let total=0;for(const it of full){total+=Number(it.period_sum??it.month_sum??0);const p=prevItems.get(String(it.id));if(p){for(const [i,k] of ['avg_daily','avg_weekday','avg_weekend'].entries()){const delta=pctDelta(it[k],p[k]);if(delta!==null)differences[i].push(delta)}}}
 // Metodologia identyczna z DANE: mediana zmian procentowych liczników z kompletnymi danymi.
 metrics([['Mediana dzienna',deltaText(median(differences[0])),'do ub. roku'],['Mediana dni powszednich',deltaText(median(differences[1])),'do ub. roku'],['Mediana weekendów',deltaText(median(differences[2])),'do ub. roku'],['Suma przejazdów',fmt(total),'nie unikalni rowerzyści']]);
  const ranked=[...full].sort((a,b)=>String(a.name??'').localeCompare(String(b.name??''),'pl',{sensitivity:'base',numeric:true}));
  const cv=boxCanvas('Średnie wartości dla wybranego okresu','ruchOverview');
  const section=cv.closest('.dp-ruch-chart');section.querySelector('.dp-ruch-canvas').style.height=Math.max(280,ranked.length*28)+'px';
  if(window.Chart)charts.push(new Chart(cv,{type:'bar',data:{labels:ranked.map(i=>i.name),datasets:[
   {label:'Dzienne',data:ranked.map(i=>i.avg_daily),backgroundColor:'rgba(255,193,7,0.7)'},
   {label:'Dni powszednie',data:ranked.map(i=>i.avg_weekday),backgroundColor:'rgba(25,135,84,0.7)'},
   {label:'Weekend',data:ranked.map(i=>i.avg_weekend),backgroundColor:'rgba(220,53,69,0.7)'}
  ]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:true,position:'top',labels:{boxWidth:10,font:{size:10}}}},scales:{x:{beginAtZero:true},y:{ticks:{font:{size:10}}}}}}));
 addExports(cv,[['Licznik','Średnia dzienna','Dni powszednie','Weekend','Suma','Pokrycie'],...ranked.map(x=>[x.name,x.avg_daily,x.avg_weekday,x.avg_weekend,x.period_sum??x.month_sum,x.coverage])],'sieci');
 const a=document.createElement('a');a.href=ROOT;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Otwórz pełne analizy na stronie DANE';a.className='dp-ruch-link';container.append(a);
 }
}
async function loadPeriod(){const request=++token;overview=null;details=null;baseline=null;previous=null,previousOverview=null,previousDetails=null;render();try{
 const [o,d]=await Promise.all([fetchJSON(PERM+'overview_'+mode+'_'+period+'.json'),fetchJSON(PERM+'details_'+mode+'_'+period+'.json')]);if(request!==token)return;overview=o;details=d;syncMap();render();
 const before=prevPeriod(),baselineKey=mode==='month'?period.slice(5):mode==='quarter'?period.slice(-2):null;
 const getOptional=async url=>{try{return await fetchJSON(url)}catch{return null}};
 const [prevOver,prevDet,baseData]=await Promise.all([before?getOptional(PERM+'overview_'+mode+'_'+before+'.json'):null,before?getOptional(PERM+'details_'+mode+'_'+before+'.json'):null,baselineKey?getOptional(PERM+'baseline_median_'+mode+'_'+baselineKey+'.json'):null]);
 if(request!==token)return;previousOverview=prevOver;previousDetails=prevDet;baseline=baseData;render();
 }catch(e){if(request!==token)return;console.error('[RUCH]',e);if(container){container.replaceChildren();const p=document.createElement('p');p.textContent='Nie udało się wczytać wyników okresu. '+e.message;container.append(p)}}}
async function ensure(){if(meta&&geo)return;[meta,geo]=await Promise.all([fetchJSON(urls.meta),fetchJSON(urls.geo)]);period=String(meta.last_full_month);restoreURL();fetchJSON(ROOT+'data/weather_daily.json').then(w=>{weather=w;if(active&&selected)render()}).catch(()=>{});}
async function activate(renderTo){const wasActive=active;active=true;container=renderTo;try{await ensure();install();syncMap();if(wasActive&&overview&&details){render();return;}await loadPeriod()}catch(e){console.warn('[RUCH] Dane',e);if(container)container.textContent='Nie udało się wczytać danych DANE: '+e.message}}
function deactivate(){active=false;token++;unloadCharts();syncMap();container=null}
function selectCounter(id){selected=id||null;if(!active)return;saveURL();syncMap();render();if(selected&&callbacks?.open)callbacks.open();}
async function restoreFromBrowser(){if(!meta)return;const before=mode+'|'+period;restoreURL();if(!active)return;if(before!==mode+'|'+period)await loadPeriod();else{syncMap();render();}}
function clickFeature(f){if(!active)return false;const id=f?.properties?.id;if(!id)return false;selectCounter(String(id));return true}
window.DPRuch={init(m,cb){map=m;callbacks=cb;map.on('style.load',()=>{setTimeout(install,80)});map.on('idle',()=>{if(active&&!hasLayer())install();});},activate,deactivate,install,selectCounter,clickFeature,restoreFromBrowser,visible:()=>active};
})();

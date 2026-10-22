#!/usr/bin/env python3
"""Pobiera publiczny GeoJSON ZTP i dzieli audyty po statusie bez adresów."""
import json,urllib.request
from pathlib import Path
URL='https://ztp.krakow.pl/dane/audyty.geojson'
req=urllib.request.Request(URL,headers={'User-Agent':'DaRoPlan/0.8 (+https://rowerowy.otwartyplan.org/mapa/)'})
with urllib.request.urlopen(req,timeout=50) as response:
    raw=response.read()
source=json.loads(raw.decode('utf-8-sig'))
if source.get('type')!='FeatureCollection' or len(source.get('features',[]))<50:
    raise SystemExit('Nieprawidłowa lub niekompletna odpowiedź ZTP')
open_,closed=[],[]
for f in source['features']:
    if f.get('geometry',{}).get('type')!='Point':continue
    p=f.get('properties') or {}
    status=str(p.get('categories','')).strip().casefold()
    if status=='otwarte': target=open_
    elif status=='zamknięte' or status=='zamkniete': target=closed
    else: raise SystemExit('Nieznany status: '+repr(status))
    new_p={key:p.get(key) for key in ('ID','title','link','publish_date','modified_date','categories') if p.get(key) is not None}
    target.append({'type':'Feature','geometry':f['geometry'],'properties':new_p})
if not closed: raise SystemExit('Brak zamkniętych audytów: kontrola nieudana')
out=Path(__file__).resolve().parents[1]/'data';out.mkdir(exist_ok=True)
for name,rows in (('audyty-otwarte.geojson',open_),('audyty-zamkniete.geojson',closed)):
    (out/name).write_text(json.dumps({'type':'FeatureCollection','features':rows},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
print('Otwarte:',len(open_),'Zamknięte:',len(closed))

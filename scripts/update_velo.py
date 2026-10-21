#!/usr/bin/env python3
"""Deterministyczna konwersja źródłowej mapy VeloMałopolska KML/KMZ.
Użycie: python3 scripts/update_velo.py [źródłowy-plik.kml]
Bez pliku: pobranie publicznej mapy Google My Maps (jeżeli eksport jest dostępny).
Tylko folder "Stan prac/rodzaj nawierzchni" — nie pozostałe foldery mapy.
"""
import io, json, sys, zipfile, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path

MID='16UMazp6pz-IQxUXpUl1c3suxCMHPcpFE'
URL=f'https://www.google.com/maps/d/kml?mid={MID}&forcekml=1'
NS={'k':'http://www.opengis.net/kml/2.2'}
TARGET=Path(__file__).resolve().parents[1]/'data'/'velomalopolska.geojson'
FOLDER='Stan prac/rodzaj nawierzchni'
COLOR_CATEGORY={'000000':'ddr','bdbdbd':'droga','ff5252':'inna','ffd600':'budowa','673ab7':'plan'}

def load():
    if len(sys.argv)>1:raw=Path(sys.argv[1]).read_bytes()
    else:
        req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req,timeout=45) as r:raw=r.read()
    if raw[:2]==b'PK':
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            files=[x for x in z.namelist() if x.lower().endswith('.kml')]
            if not files:raise ValueError('KMZ bez KML')
            raw=z.read(files[0])
    return ET.fromstring(raw)

def parse_coords(text):
    coords=[]
    for token in (text or '').split():
        pieces=token.split(',')
        if len(pieces)<2:continue
        lon,lat=map(float,pieces[:2])
        if not(-180<=lon<=180 and -90<=lat<=90):raise ValueError('Niepoprawne współrzędne')
        coords.append([lon,lat])
    return coords

def convert(root):
    target=next((f for f in root.findall('.//k:Folder',NS) if f.findtext('k:name',default='',namespaces=NS)==FOLDER),None)
    if target is None:raise ValueError(f'Nie znaleziono folderu: {FOLDER}. Nie nadpisuję danych.')
    # Google My Maps nadaje StyleUrl np. #line-FF5252-5000;
    # kolor źródłowy służy TYLKO ustaleniu kategorii.
    features=[];unknown=[]
    for pm in target.findall('./k:Placemark',NS):
        name=pm.findtext('k:name',default='',namespaces=NS)
        ref=pm.findtext('k:styleUrl',default='',namespaces=NS)
        parts=ref.lstrip('#').split('-')
        src=parts[1].lower() if len(parts)>=3 and parts[0]=='line' else ''
        category=COLOR_CATEGORY.get(src)
        if category is None:
            unknown.append((name,ref));continue
        for node in pm.findall('.//k:LineString/k:coordinates',NS):
            coords=parse_coords(node.text)
            if len(coords)<2:continue
            features.append({'type':'Feature','properties':{
                'name':name,'category':category,'source_color':'#'+src,
                'source_style':ref,'source':'VeloMałopolska / Google My Maps'
            },'geometry':{'type':'LineString','coordinates':coords}})
    if unknown:raise ValueError(f'Nierozpoznana kolorystyka {len(unknown)} obiektów, np. {unknown[:4]}')
    if len(features)<300:raise ValueError(f'Tylko {len(features)} odcinków — przerywam, aby nie zastąpić pełnej mapy danymi niekompletnymi')
    counts={c:sum(f['properties']['category']==c for f in features) for c in COLOR_CATEGORY.values()}
    if any(v==0 for v in counts.values()):raise ValueError(f'Brak jednej z pięciu kategorii: {counts}')
    return {'type':'FeatureCollection','features':features}, counts

def main():
    collection,counts=convert(load())
    TARGET.parent.mkdir(parents=True,exist_ok=True)
    serialized=json.dumps(collection,ensure_ascii=False,separators=(',',':'))+'\n'
    # Nie modyfikujemy pliku, jeżeli dane są identyczne.
    if TARGET.exists() and TARGET.read_text()==serialized:
        print('Bez zmian; ',counts);return
    tmp=TARGET.with_suffix('.json.tmp')
    tmp.write_text(serialized)
    tmp.replace(TARGET)
    print('Zapisano',len(collection['features']),'odcinków',counts)
if __name__=='__main__':main()

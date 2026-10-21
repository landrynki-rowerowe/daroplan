#!/usr/bin/env python3
"""Deterministyczna konwersja źródłowej mapy VeloMałopolska KML/KMZ.
Użycie: python3 scripts/update_velo.py [źródłowy-plik.kml]
Bez pliku: pobranie publicznej mapy Google My Maps (jeżeli eksport jest dostępny).
Importuje folder główny oraz "Pozostała infrastruktura rowerowa"; pozostałe foldery wykluczone.
"""
import io, json, sys, zipfile, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path

MID='16UMazp6pz-IQxUXpUl1c3suxCMHPcpFE'
URL=f'https://www.google.com/maps/d/kml?mid={MID}&forcekml=1'
NS={'k':'http://www.opengis.net/kml/2.2'}
TARGET=Path(__file__).resolve().parents[1]/'data'/'velomalopolska.geojson'
FOLDERS=('Stan prac/rodzaj nawierzchni', 'Pozostała infrastruktura rowerowa')
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
    folders = {}
    for f in root.findall('.//k:Folder', NS):
        name=f.findtext('k:name',default='',namespaces=NS)
        if name in FOLDERS:
            folders[name]=f
    missing=set(FOLDERS)-set(folders)
    if missing:
        raise ValueError(f'Brak folderów {missing}; zachowuję poprzednie dane')
    features=[]; counts_by_folder={}; unknown=[]
    for folder_name in FOLDERS:
        current=0
        for pm in folders[folder_name].findall('./k:Placemark',NS):
            name=pm.findtext('k:name',default='',namespaces=NS)
            ref=pm.findtext('k:styleUrl',default='',namespaces=NS)
            parts=ref.lstrip('#').split('-')
            src=parts[1].lower() if len(parts)>=3 and parts[0]=='line' else ''
            category=COLOR_CATEGORY.get(src)
            # Pięć obiektów w uzupełniającej warstwie ma inne barwy źródłowe.
            # Nie zgadujemy klasyfikacji: ujawniamy je jawnie jako nierozpoznane.
            if category is None:
                category='nieokreslone'
                unknown.append((name,ref))
            nodes=pm.findall('.//k:LineString/k:coordinates',NS)
            if not nodes:
                raise ValueError(f'Obiekt bez linii: {name}')
            for node in nodes:
                coords=parse_coords(node.text)
                if len(coords)<2:
                    print('UWAGA: pominięta geometria z mniej niż 2 punktami:',name)
                    continue
                features.append({'type':'Feature','properties':{
                    'name':name,'category':category,'source_color':'#'+src,
                    'source_style':ref,'source_folder':folder_name,
                    'source':'VeloMałopolska / Google My Maps'
                },'geometry':{'type':'LineString','coordinates':coords}})
                current+=1
        counts_by_folder[folder_name]=current
    if counts_by_folder[FOLDERS[0]]<300 or counts_by_folder[FOLDERS[1]]<250:
        raise ValueError(f'Podejrzanie mało odcinków: {counts_by_folder}')
    counts={c:sum(f['properties']['category']==c for f in features) for c in (*COLOR_CATEGORY.values(),'nieokreslone')}
    if any(counts.get(c,0)==0 for c in COLOR_CATEGORY.values()):
        raise ValueError(f'Brak jednej z kategorii: {counts}')
    print('Foldery:',counts_by_folder)
    if unknown: print('UWAGA: nierozpoznane kolory (nie zgaduję kategorii):',unknown)
    return {'type':'FeatureCollection','features':features},counts

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

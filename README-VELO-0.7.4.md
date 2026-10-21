# DaRoPlan VeloM 0.7.4-dev

Poprawka do v0.7.3-dev. Wgraj do gałęzi `dev` pliki `js/app.js`, `scripts/update_velo.py` i `data/velomalopolska.geojson`, zachowując katalogi. Następnie uruchom workflow „Publikuj DaRoPlan DEV” z gałęzi main.

Zmiany:
- Usunięte z opisów puste etykiety techniczne z KML (`Layer:`, `JPT_*`, `ID_BUFOR*`, `IIP_*`, `SHAPE_*`, `REGON:`, `RODZAJ:`), nie usuwając opisu merytorycznego.
- Skrócone kreski i subtelniejsze kropki na VeloM, szczególnie przy zoomie 9.
- Zaokrąglone końcówki i łączenia linii (`line-cap: round`, `line-join: round`).
- Zachowane kolory, klasyfikacja, wszystkie 683 linie, dotychczasowa logika przełączania sieci.

Uwaga: wizualna ocena kresek i kropek wymaga testu w przeglądarce na podkładach; Mapbox interpretuje line-dasharray jako wielokrotność szerokości linii. Nie zmieniono automatyzacji pobierania KML.

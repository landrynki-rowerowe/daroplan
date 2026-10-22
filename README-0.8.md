# DaRoPlan 0.8-dev — warstwy dodatkowe

## Instalacja

1. Wgraj na gałąź `dev` katalogi `js`, `data`, `scripts` z paczki, z zachowaniem ścieżek (pozostałych plików nie usuwaj). **Plik `.github/workflows/sync-audyty.yml` dodaj do `main`** — GitHub wymaga, by workflow do ręcznego uruchomienia znajdował się w gałęzi domyślnej. Skrypt synchronizacji będzie jednak checkoutować `dev` i commitować wyłącznie do `dev`.
2. **Zanim opublikujesz mapę**, uruchom w GitHub Actions ręcznie workflow `Synchronizuj audyty ZTP (DEV)` — tworzy `data/audyty-otwarte.geojson` i `data/audyty-zamkniete.geojson`, a następnie commit na `dev`.
3. Po powodzeniu workflow sprawdź obecność obu GeoJSON w gałęzi `dev`.
4. Uruchom dotychczasowy działający workflow `Publikuj DaRoPlan DEV` (zwykle uruchamiany z `main`, pobiera zawartość `dev`).
5. Sprawdź `/mapa-dev/`: włącz audyty i VeloM → Objazdy / utrudnienia. Audyty i objazdy są domyślnie wyłączone. Po zmianie podkładu warstwy powinny zostać.

## Projekt

- Audyty ZTP: zielone otwarte **bez klastrów**, szare zamknięte **z klastrami**; zielone zawsze na wierzchu. Kliknięcie szarego klastra przybliża mapę. Panel bez pola `address`.
- Dane audytów pobiera GitHub Actions z `https://ztp.krakow.pl/dane/audyty.geojson`, w repo zapisywane są tylko potrzebne atrybuty. Synchronizacja dwa razy w tygodniu i na żądanie, bez automatycznej publikacji strony (wdrożenie osobnym workflow).
- VeloM Objazdy / utrudnienia: 6 linii i 17 punktów według KML, pomarańczowe, domyślnie wyłączone. Dane mogą zawierać **archiwalne utrudnienia**; panel ostrzega, że nie są potwierdzone jako aktualne.
- Warstwa może wskazać brak danych przed pierwszą synchronizacją; dlatego punkt 2 jest obowiązkowy.
- Nie modyfikujemy `data/velomalopolska.geojson` ani dotychczasowego konwertera VeloM.

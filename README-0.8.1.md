# DaRoPlan 0.8.1-dev — audyty bez synchronizacji

Wgraj do gałęzi `dev` tylko:
- `js/app.js`
- `data/velo-objazdy.geojson`

Nie wgrywaj `.github/workflows/sync-audyty.yml` na `main` ani `scripts/sync_audyty.py`.
Jeśli workflow został już dodany do main, usuń go (także gdy jest w dev).

W tej wersji przeglądarka pobiera bezpośrednio `https://ztp.krakow.pl/dane/audyty.geojson` przez `fetch()` i rozdziela rekordy na dwie kolekcje w pamięci: otwarte, bez klastrów, i zamknięte, z klastrami. Niczego nie zapisuje w repozytorium i nie wymaga cyklicznej synchronizacji. Pole `address` jest usuwane przed przekazaniem do Mapbox.

Uwaga: bezpośredni odczyt zależy od CORS ustawionego na serwerze ZTP. W obecnym środowisku nie udało się zweryfikować nagłówka `Access-Control-Allow-Origin`, więc prawidłowość odczytu trzeba sprawdzić w przeglądarce na `/mapa-dev/`. Jeśli brak CORS, przeglądarka pokaże komunikat o błędzie i wtedy rozważymy lekki proxy, zamiast automatycznej kopii pliku.

Publikacja: na GitHub Actions uruchom wyłącznie działający workflow `Publikuj DaRoPlan DEV` (z `main`, checkout `dev`).

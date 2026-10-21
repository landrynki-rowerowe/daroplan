# DaRoPlan 2.0 — VeloMałopolska 0.7.1-dev

Kompletna warstwa z rzeczywistego eksportu KML (aktualizacja źródłowa: 14.10.2026).

## Instalacja na `dev`
1. Skopiuj pliki `js/app.js`, `scripts/update_velo.py` i `data/velomalopolska.geojson` do repozytorium zachowując ścieżki.
2. Commit wyłącznie na gałęzi `dev`.
3. Uruchom sprawdzony workflow **Publikuj DaRoPlan DEV** (z `main`); przepuszcza `js/`, `data/`, `index.html`, `css/`. Skrypt `scripts` pozostaje na GitHubie.
4. W `/mapa-dev/` sprawdź pięć kategorii, ukrywanie Krakowa oraz zmianę podkładu.

## Aktualizacje danych
`python3 scripts/update_velo.py plik.kml` lub `python3 scripts/update_velo.py` do pobrania bieżącego publicznego KML.
Konwerter wybiera tylko folder „Stan prac/rodzaj nawierzchni” i odrzuca niekompletne lub nieznane dane.
Oryginalne kolory źródła służą klasyfikacji, a DaRoPlan używa własnej palety.

Nie włączamy automatycznych commitów do `main`. Najpierw sprawdzimy pobieranie pełnej zawartości z Google w GitHub Actions.

# DaRoPlan 2.0 — VeloM 0.7.3-dev

## Zmiany
- 683 poprawne odcinki VeloM wraz z nazwą, kategorią i opisem z pliku KML z 21.10.2026.
- Prawy panel VeloM pokazuje tytuł, zrozumiałą kategorię, opis i źródło, a nie surowe pola techniczne.
- Kolor DDR/CPR niebieski; drogi w ruchu ogólnym zielone (#159924) i przerywane jak krakowski kontraruch; inne nawierzchnie czerwone, przerywane i nieco cieńsze; budowa nasycony bursztyn; planowane fioletowe kropkowane.
- Linie przy zoomie 9 są widoczne (3.3 px z wyjątkiem czerwonych), a przy zoomie 16 mają około 3.25 px, podobnie do krakowskich.
- Nie zmieniono działania przełącznika VeloM / infrastruktury Krakowa ani mechanizmu DASIE.

## Wgranie
Na gałęzi `dev` zamień: `js/app.js`, `scripts/update_velo.py`, `data/velomalopolska.geojson`. Możesz też dodać niniejszy README. Następnie uruchom workflow "Publikuj DaRoPlan DEV" z gałęzi `main`.

## Ważne
Odcinek `8.VMiechów Charsznica-inna` ma nieprawidłową geometrię (jeden punkt) i został pominięty. Pięć odcinków o nierozpoznanych kolorach źródłowych ma kategorię `nieokreslone`; wymaga to oddzielnej weryfikacji. Własna symbolika nie zmienia oryginalnej klasyfikacji. W GeoJSON pozostają źródłowe pola techniczne dla kontroli importu, ale nie są pokazywane na panelu VeloM.

Nie przeprowadzono testów interakcyjnych w przeglądarce; sprawdzono składnię JS, poprawność GeoJSON i liczbę obiektów.

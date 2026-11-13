# DASIE — edytor wyłącznie do powiązań

Źródło: aktualny pakiet `mu-plugins.zip` z `lab.otwartyplan.org` (9.11.2026).

## Zakres
- Zachowujemy Mapbox GL JS, wybór wielu istniejących punktów i linii, wyróżnianie oraz fitBounds.
- Usuwamy Mapbox Draw, formularz tworzenia geometrii i endpoint AJAX `drp032_add_geometry` z edytora DASIE.
- Tworzenie i edycja geometrii pozostaje w `DASIE → Geometrie` (istniejący `daroplan-geometries-0.3.4.php`).
- Nie zmieniamy tabel, logiki `save_post_drp_dasie`, REST API ani frontendu.

## Wdrożenie ręczne na CMS
To repozytorium nie jest automatycznym wdrożeniem WordPressa. Po akceptacji i kopii bezpieczeństwa **nadpisz** istniejący plik `wp-content/mu-plugins/daroplan-dasie-editor-0.3.2.php` wersją z tego PR. Nazwa pliku jest celowo zachowana dla bezpiecznej wymiany w miejscu (nagłówek wersji: 0.3.3). Nie wgrywaj drugiej kopii obok starej: duplikacja funkcji PHP spowoduje błąd krytyczny.

## Testy akceptacyjne
1. Otwórz istniejący DASIE z kilkoma geometriami: mapa zaznacza wszystkie powiązane.
2. Kliknij inną istniejącą geometrię i zapisz DASIE: relacja zostaje dodana.
3. Odłącz jedną geometrię i zapisz: znika tylko powiązanie, geometria pozostaje w katalogu.
4. Odłącz wszystkie i zapisz: lista powiązań jest pusta.
5. Utwórz geometrię w osobnym edytorze; po zapisaniu DASIE i odświeżeniu formularza można ją przypisać.
6. Sprawdź REST `/wp-json/daroplan/v1/dasie` i `/mapa-dev/` — istniejące punkty/linie oraz fitBounds działają.
7. Potwierdź, że w DASIE nie ma narzędzi rysowania, przycisku zapisu nowej geometrii ani żądań `drp032_add_geometry`.

## Wycofanie
Przywróć kopię `daroplan-dasie-editor-0.3.2.php` sprzed wdrożenia. Nie ma migracji danych ani schematu.

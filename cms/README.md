# Wdrożenia MU-pluginów CMS DaRoPlan

To narzędzie dotyczy **tylko** CMS `lab.otwartyplan.org`. Nie wdraża frontendu `mapa-dev/` ani `mapa/`.

## Konfiguracja jednorazowa
1. W repozytorium GitHub → **Settings → Secrets and variables → Actions → Variables** dodaj `CMS_MU_PLUGINS_PATH`, wskazując dokładny katalog CMS na dhosting (musi zawierać `lab.otwartyplan.org` i kończyć się `/wp-content/mu-plugins`). Ustal ścieżkę przez SSH: `cd .../wp-content/mu-plugins && pwd`. Nie zgaduj ścieżki.
2. Wykorzystujemy istniejące repozytoryjne sekrety `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`, `SSH_PORT`, obecnie używane przez workflow frontendu. Niczego nie wpisuj do plików repozytorium.
3. Przeglądnij `cms/mu-plugins/` i dodawaj tam **aktualne, zatwierdzone** wersje plików PHP. Starsze kopie archiwalne nie mogą być publikowane jako aktualne.

## Publikowanie
1. Zmiana CMS trafia przez PR do gałęzi `dev`, a plik do `cms/mu-plugins/`.
2. Actions → **DaRoPlan CMS - manual deployment** → **Run workflow**, branch **dev**.
3. Wpisz **dokładną nazwę jednego pliku**. Pozostaw `apply=false` (domyślnie) i sprawdź raport oraz sumy kontrolne. Plik trafia tylko do katalogu stagingowego.
4. Uruchom ponownie z `apply=true` dopiero po kontroli. Workflow tworzy kopię poprzedniego pliku pod `~/.daroplan-cms-backups/<run_id>/`, po czym atomowo zastępuje **wyłącznie wskazany** plik.
5. Sprawdź CMS i jego REST API. Ten workflow nie weryfikuje automatycznie zachowania aplikacji.

**Ważne:** pierwsze uruchomienie workflow nic nie wdroży, jeżeli w repozytorium nie ma wskazanego pliku. Celowo nie importujemy na ślepo starych MU-pluginów. Nie publikuj dwóch równoległych wersji tego samego MU-pluginu w katalogu `mu-plugins`.

### Wycofanie
Jeśli aktualizacja wywoła błąd, przywróć pojedynczy plik z odpowiedniego `~/.daroplan-cms-backups/<run_id>/` przez SSH. Backup obejmuje plik PHP, **nie bazę danych**; przed migracjami danych wykonaj osobną kopię bazy. Repozytorium przechowuje historię zmian kodu.

### Ograniczenia
- Workflow jest uruchamiany **ręcznie**, wyłącznie z gałęzi `dev`.
- Nie usuwa niepowiązanych plików ani nie synchronizuje całych katalogów.
- Waliduje składnię PHP lokalnie i na serwerze (jeśli PHP CLI jest dostępne), ale **nie stanowi pełnego testu integracyjnego**.
- SSH korzysta obecnie z hasła zgodnie z istniejącym workflow; docelowo warto przejść na osobny klucz wdrożeniowy z ograniczonymi uprawnieniami i sekrety środowiska GitHub `cms-deploy`.

## Stan MU-pluginów pobrany z serwera (15.11.2026)

Poniższe pliki zostały skopiowane 1:1 z katalogu `wp-content/mu-plugins` CMS `lab.otwartyplan.org` i dodane do repozytorium bez żadnych zmian w kodzie. Celem jest wersjonowanie i możliwość audytu. Dodanie ich tutaj **niczego nie wdraża**: workflow publikuje wyłącznie plik wskazany ręcznie przy uruchomieniu.

| Plik | Moduł | Wersja wewnętrzna |
|---|---|---|
| `daroplan-cms.php` | CMS Core: typy treści `drp_story`, `drp_scene`, `drp_dasie`, endpoint `/stories` | 0.2.0 |
| `daroplan-geometries-0.3.5.php` | Geometrie i relacje (własne tabele), ustawienia mapy | 0.3.5 |
| `daroplan-dasie-api-0.1.php` | Endpoint `/dasie` (GeoJSON) | 0.1.0 |
| `daroplan-dasie-editor-0.3.2.php` | Edytor mapowy DASIE | 0.3.3 |
| `daroplan-dasie-preview-0.4.php` | Podgląd materiału DASIE | 0.4.0 |
| `daroplan-landrynki-0.5.php` | Landrynki Rowerowe, endpoint `/landrynki` | 0.5.0 |
| `daroplan-landrynki-0.5.1.php` | Landrynki: zajawki i lista | 0.5.1 |

Uwaga: plik `daroplan-dasie-editor-0.3.2.php` ma w nagłówku wersję 0.3.3. Nazwy plików pozostają bez zmian, zgodnie z zasadą „jeden plik na moduł, rośnie wersja wewnętrzna".

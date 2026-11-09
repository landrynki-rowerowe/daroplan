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

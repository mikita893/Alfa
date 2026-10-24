# Pierwsze wdrożenie i kolejne deploymenty z GitHub Actions

## 1. Konto Oracle

Otwórz https://www.oracle.com/cloud/free/ i sprawdź aktualne warunki Always Free. Utwórz konto, przejdź weryfikację i włącz MFA. Wybierz region UE, pamiętając o dostępności bezpłatnych zasobów i ograniczeniach zmiany regionu macierzystego. Nie zamawiaj płatnych zasobów jako zamiennika. Aktualnych cen i dostępności nie potwierdzono w tej sesji.

## 2. Maszyna i domena

Utwórz maszynę Linux i dysk oznaczone jako kwalifikujące się do Always Free. Zachowaj prywatny klucz SSH lokalnie lub w menedżerze sekretów; nie wysyłaj go w czacie. Możesz użyć Linuxa ARM64, jeśli wybrany obraz systemu jest zgodny; obraz Node obsługuje również ARM64, ale w tej sesji testowano tylko architekturę środowiska chmurowego.

Przygotuj subdomenę, np. alpha.domena-parafii.pl, i ustaw DNS na publiczny adres serwera. Otwórz TCP 80/443 dla WWW; dostęp SSH ogranicz zgodnie z następnym punktem. Nie otwieraj portu 3000.

## 3. Zaufany dostęp administracyjny

Połącz się z maszyną przez SSH. Zainstaluj Git, Docker Engine, Docker Compose, curl i flock według instrukcji systemu. Sprawdź odcisk klucza hosta SSH przez niezależny, zaufany kanał (np. konsolę dostawcy).

Przygotuj osobny klucz SSH dla GitHub Actions, inny niż osobisty klucz administracyjny. Klucz publiczny dodaj do authorized_keys użytkownika wdrażającego, z wyłączonym forwardingiem i PTY, np. opcjami `restrict`. Prywatny klucz trafi wyłącznie do GitHub Secrets. Ten workflow wymaga dedykowanego klucza bez interaktywnego hasła (nie obsługuje monitu o passphrase); chroń go sekretami środowiska production. Prawo uruchamiania Dockera daje szeroki dostęp do maszyny — traktuj to konto jako uprzywilejowane.

GitHub-hosted runners wymagają osiągalnego SSH. Nie zakładaj, że znasz ich stały adres IP: dozwolone źródła połączeń trzeba dobrać świadomie do własnej sieci (np. zarządzany dostęp VPN albo runner wdrożeniowy w odpowiedniej sieci). Nie otwieraj bez zastanowienia SSH na cały internet i nie uruchamiaj runnera produkcyjnego dla niezaufanych pull requestów. Workflow nie używa pull_request i uruchamia deployment tylko z main.

## 4. Pierwsze uruchomienie ręczne

Użytkownik wdrażający musi mieć zapis do `/opt/alpha`. Zainstaluj repozytorium dokładnie w tym katalogu (albo ustaw potem DEPLOY_PATH):

```sh
git clone https://github.com/mikita893/Alfa.git /opt/alpha
cd /opt/alpha
cp .env.example .env
```

W `.env` ustaw `DOMAIN` na własną domenę. `ALFA_SEED=1` może utworzyć przykładową parafię i edycję; po inicjalizacji ustaw `ALFA_SEED=0`. Więcej informacji: [HOSTING.md](HOSTING.md).

```sh
docker compose build
docker compose run --rm --no-deps app node manage-users.js create-admin twoj-login
docker compose up -d
```

Ustal silne hasło w ukrytym monicie terminala. Sprawdź HTTPS, logowanie i blokadę API bez sesji. Wykonaj i przetestuj kopię zapasową. Używaj danych testowych do zakończenia konfiguracji.

## 5. GitHub: środowisko production

W repozytorium `mikita893/Alfa` otwórz Settings → Environments i utwórz `production`. Ogranicz deploymenty do gałęzi `main`. Jeżeli plan GitHub to umożliwia, dodaj wymagane zatwierdzenie deploymentu.

W tym środowisku dodaj sekrety:

| Nazwa | Zawartość |
| --- | --- |
| SSH_HOST | Adres IP lub nazwa serwera, bez protokołu |
| SSH_USER | Nazwa użytkownika wdrażającego |
| SSH_PRIVATE_KEY | Dedykowany prywatny klucz SSH do wdrażania |
| SSH_KNOWN_HOSTS | Zweryfikowany wpis known_hosts dla dokładnie tego hosta |

`ssh-keyscan` sam nie potwierdza autentyczności serwera. Odcisk klucza należy najpierw porównać z zaufanym źródłem. Workflow wymaga StrictHostKeyChecking=yes i nigdy nie akceptuje automatycznie obcego klucza.

Opcjonalna zmienna środowiska GitHub `DEPLOY_PATH`: domyślnie `/opt/alpha`. To musi być ten sam katalog przez cały okres działania aplikacji, aby nazwa projektu Compose i wolumeny pozostały zgodne. Nie zmieniaj jej bez zaplanowanej migracji bazy. Repozytorium na serwerze musi mieć odczyt origin (dla repozytorium prywatnego zastosuj osobny klucz GitHub deploy key wyłącznie do odczytu).

## 6. Każda kolejna aktualizacja

1. Tutaj przygotowujemy i testujemy kod, a następnie wypychamy do main.
2. W GitHub otwierasz Actions → Deploy Alpha → Run workflow, wybierając main.
3. Workflow ponownie uruchamia testy.
4. Łączy się przez zweryfikowane SSH, wykonuje kopię bazy, aktualizuje kod, buduje obraz i odtwarza kontenery z zachowaniem wolumenów.
5. Sprawdza stronę logowania i odpowiedź 401 z API bez sesji, także przez publiczne HTTPS.

Deployment zatrzyma się, jeśli zmienił się main, są lokalne zmiany na serwerze, nie da się zrobić kopii, testy nie przechodzą lub nie działa HTTPS. Nie przywraca automatycznie starej bazy po błędzie, ponieważ mogłoby to usunąć nowe dane. Błąd po uruchomieniu nowej wersji wymaga diagnozy.

## Status

Workflow i skrypt są przygotowane. Testy aplikacji, składnia skryptu i konfiguracja Compose są sprawdzane lokalnie. Nie wykonano deploymentu przez SSH, GitHub Actions ani publicznego sprawdzenia TLS — brakuje konta serwera, sieci, domeny i sekretów. Zmiany wypchnięte do repozytorium nie uruchamiają deploymentu automatycznie.

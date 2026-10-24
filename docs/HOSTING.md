# Hosting i prywatny dostęp

## Propozycja: Oracle Cloud Always Free

Obecna aplikacja potrzebuje procesu Node.js i trwałego dysku dla SQLite. Najmniej zmian wymaga własna maszyna wirtualna. Kandydatem do uruchomienia bez opłaty za zasoby mieszczące się w bezpłatnym planie jest **Oracle Cloud Always Free**.

Oficjalne strony do sprawdzenia przed rejestracją:

- oferta: https://www.oracle.com/cloud/free/
- opis zasobów Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- przetwarzanie danych i umowy Oracle: https://www.oracle.com/contracts/cloud-services/

**Status weryfikacji:** w tej sesji proxy blokuje strony Oracle i Render (HTTP 403 podczas CONNECT). Oferta, limity, regiony i bieżące ceny nie zostały sprawdzone na żywo. To propozycja oparta na znanej ofercie, a nie gwarancja dostępności darmowego serwera w październiku 2026. Podczas zakładania konta potwierdź, że wybrana maszyna i dysk są oznaczone Always Free, a nie tylko czasowym kredytem próbnym. Rejestracja może wymagać karty i weryfikacji. Dostępność maszyn zależy od regionu; bezpłatne zasoby mogą mieć ograniczenia i warunki odzyskiwania nieużywanych instancji. Nie wybieraj zasobów płatnych jako automatycznego zamiennika. Alert budżetowy nie jest twardą blokadą naliczania opłat.

Wybierz region UE i sprawdź warunki powierzenia danych. Bezpłatna maszyna nie zwalnia z administracji systemem, aktualizacji, monitorowania ani kopii zapasowych. Sama domena może kosztować oddzielnie; można użyć istniejącej subdomeny parafii, jeśli ma dostęp do DNS.

## Dlaczego nie sam darmowy hosting plików

GitHub Pages i podobny statyczny hosting nie uruchomią Node.js ani SQLite. Darmowy proces z nietrwałym dyskiem może utracić bazę przy restarcie lub wdrożeniu. Nie wdrażaj tej wersji na takim planie. W przypadku Render sprawdź aktualne zasady trwałości na https://render.com/docs/free — nie zakładaj, że darmowy web service zachowuje lokalne pliki. Alternatywny zestaw darmowego frontendu i zarządzanej bazy wymagałby zmiany obecnego backendu i ponownego testowania bezpieczeństwa.

## Przygotowanie serwera

Poniższe instrukcje nie tworzą konta ani serwera. Wymagają maszyny z Docker Engine i Compose oraz dostępu administracyjnego przez SSH. Nie były wykonane na publicznym hostingu.

1. Utwórz maszynę i trwały dysk, sprawdzając kwalifikację do darmowego planu.
2. Zainstaluj Docker Engine i Compose według dokumentacji właściwej dla systemu. Włącz aktualizacje bezpieczeństwa. Dostęp SSH ogranicz kluczem i regułami zapory.
3. Ustaw DNS wybranej domeny na publiczny adres IP serwera. Otwórz porty TCP 80 i 443 w zaporze maszyny i w regułach sieciowych dostawcy. Nie otwieraj 3000 ani portów SQLite.
4. Pobierz repozytorium na maszynie:

```sh
git clone https://github.com/mikita893/Alfa.git
cd Alfa
cp .env.example .env
```

5. Edytuj `.env`: ustaw prawdziwą domenę w `DOMAIN`. Hasła nie są częścią tego pliku. `ALFA_SEED=1` dodaje przykładową parafię, edycję i fikcyjną osobę; po pierwszym uruchomieniu ustaw `ALFA_SEED=0`, żeby nie odtwarzać demonstracyjnych wpisów.
6. Zbuduj obraz i utwórz pierwsze konto administratora w interaktywnym terminalu:

```sh
docker compose build
docker compose run --rm --no-deps app node manage-users.js create-admin twoj-login
```

Program poprosi o imię, hasło (minimum 12 znaków) i jego powtórzenie. Hasło nie jest wyświetlane. Wolumen z bazą będzie wspólny dla tego polecenia i uruchomionej aplikacji.

7. Uruchom:

```sh
docker compose up -d
```

Caddy uzyska certyfikat HTTPS po poprawnym ustawieniu DNS i dostępu do portów. Dane SQLite pozostają w wolumenie `alpha_data`. Nie wykonuj `docker compose down -v`: usuwa wolumeny i dane!

8. Otwórz adres HTTPS. Bez logowania nie powinno być dostępu do listy ani API. Zaloguj się administratorem, dodaj organizatorów w zakładce „Dostęp organizatorów”, przekaż hasła bezpiecznym kanałem i poproś o zmianę po pierwszym logowaniu. Nie udostępniaj własnego konta innym.

## Kopie zapasowe i aktualizacje

Spójna kopia bazy, również przy działającej aplikacji:

```sh
docker compose exec app node scripts/backup.js /app/data/backups
```

Plik zawiera poufne dane i skróty haseł. Nie publikuj go w repozytorium ani w niezabezpieczonej chmurze. Zabezpiecz kopie i automatycznie przenoś je do niezależnego miejsca; sama kopia na tej samej bezpłatnej maszynie nie chroni przed utratą maszyny. Ustal czas przechowywania i usuwaj stare kopie. Test odtworzenia jest wymagany przed wprowadzeniem rzeczywistych danych.

Aktualizacja:

```sh
git pull --ff-only
docker compose build
docker compose up -d
```

Wykonaj kopię przed zmianą wersji. Po odtworzeniu bazy unieważnij stare sesje (tabela sessions) przed udostępnieniem aplikacji.

## Odebranie i odzyskanie dostępu

Administrator blokuje konto w aplikacji; wszystkie sesje użytkownika są natychmiast unieważniane. Konto zablokowane nie odzyskuje dostępu po samej zmianie hasła. W razie zgubienia hasła do aktywnego konta operator serwera może wykonać w terminalu:

```sh
docker compose exec app node manage-users.js reset-password twoj-login
```

Nie ma publicznego resetowania przez e-mail ani publicznej rejestracji. Konta otrzymują dostęp do całej bazy, nie tylko wybranej parafii. Użyj innej instalacji lub dodaj szczegółowe uprawnienia, jeśli organizatorzy różnych parafii nie powinni widzieć wspólnych danych.

## Zanim dodasz poufne dane

Login i HTTPS są częścią ochrony. Organizator/parafia musi również ustalić administratora danych, właściwą podstawę przetwarzania danych o religii, obowiązek informacyjny, umowę z dostawcą, zakres dostępu i retencję. Ten kod nie daje automatycznie zgodności z RODO. Korzystaj z danych fikcyjnych do czasu sprawdzenia wdrożenia, kopii i zasad dostępu.

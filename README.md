# Alpha — organizatorzy

Prosty CRM dla organizatorów katolickich kursów Alpha. Na pierwszym ekranie: edycja i uczestnicy. Harmonogram, zadania, parafie, słownik ról i powiązania są na kolejnych kartach.

## Uruchomienie i sprawdzenie

Node.js 24+. Brak zewnętrznych zależności i procesu budowania.

```sh
node manage-users.js create-admin twoj-login
npm start
```

Polecenie tworzenia administratora pyta o hasło w terminalu i ukrywa wpisywane znaki. Nie umieszczaj hasła w argumentach, repozytorium ani czacie. Domyślnie aplikacja słucha wyłącznie lokalnie na porcie 3000, ale również lokalnie wymaga logowania. Nie ma konta domyślnego ani publicznej rejestracji. Kolejne konta dodaje administrator w zakładce **Dostęp organizatorów**.

```sh
npm run check
npm test
```

Testy uruchamiają własne serwery i tymczasowe bazy, a następnie je zatrzymują. `ALFA_DEV_NO_AUTH=1` wyłącza logowanie wyłącznie przy lokalnym nasłuchu poza trybem produkcyjnym; jest przeznaczone do testów z fikcyjnymi danymi.

## Model danych

- Parafia ma wiele edycji. Edycja ma wymagane rozpoczęcie i zakończenie. Formularz używa miesięcy; API przyjmuje miesiące lub pełne daty, np. `2026-10` albo `2026-10-15`.
- Karta osoby (imię, nazwisko, kontakt) jest niezależna od edycji i parafii.
- Osoba może mieć zero lub wiele powiązań z parafiami oraz zero lub wiele udziałów w edycjach.
- Każdy udział ma własny status, grupę i dowolną liczbę ról. Słownik ról można dodawać i edytować w ustawieniach.
- Usunięcie przypisania do edycji usuwa obecności tej osoby w tej edycji; formularz uprzedza o tym. Nie usuwa jej karty ani innych udziałów.
- Powiązanie osoby z parafią jest niezależne od udziału w edycji.

Na nowej bazie aplikacja zakłada parafię **Zmartwychwstania Pańskiego**, edycję **Jesienna 2026/2027 · Zmartwychwstania Pańskiego**, rozpoczęcie **2026-10**, zakończenie **2027-01** i osobę **Osoba Testowa** (`osoba.testowa@example.com`). Nie zgadujemy miejscowości ani dokładnych dni spotkań. Dane można edytować w interfejsie.

## Trwałość i migracja

SQLite: `data/alfa.sqlite` oraz pliki WAL. Katalog jest ignorowany przez Git i Docker. Przed aktualizacją wykonaj kopię zapasową przy zatrzymanej aplikacji (lub użyj mechanizmu SQLite backup/VACUUM INTO). Migracja zachowuje stare karty osób i obecności; nie scala automatycznie podobnych nazwisk ani adresów e-mail. Stare daty zakończenia pozostają do uzupełnienia. Po migracji historyczne tabele osób i obecności są usuwane, aby usunięta osoba nie pozostawała w ukrytej kopii. Kopie zapasowe mają odrębną retencję; nie przechowuj ich bezterminowo.

`ALFA_DB` wskazuje ścieżkę bazy, `PORT` port, `ALFA_SEED=0` wyłącza dodawanie danych startowych. Startowe wpisy tworzone są tylko, jeśli ich brakuje; edycja wprowadzona przez organizatora nie jest nadpisywana przy restarcie. Osoba testowa może zostać ponownie dodana po usunięciu, jeśli seed jest włączony — na docelowym serwerze po inicjalizacji ustaw `ALFA_SEED=0`.

## Dostęp i wdrożenie

Pierwsza konfiguracja i GitHub Actions: [docs/FIRST-DEPLOY.md](docs/FIRST-DEPLOY.md). Pełna instrukcja hostingu: [docs/HOSTING.md](docs/HOSTING.md). Przygotowano `compose.yaml` z aplikacją, trwałym wolumenem SQLite i Caddy do HTTPS. Potrzebujesz hostingu/maszyny i domeny; środowisko rozmowy nie jest publicznym hostingiem.

Wersja 0.3 zastępuje wspólne hasło HTTP Basic osobnymi kontami organizatorów:

- hasła scrypt z losową solą; brak przechowywania haseł w postaci jawnej;
- losowe sesje, w bazie tylko skróty tokenów; ciasteczka HttpOnly, SameSite=Strict i Secure dla publicznego HTTPS;
- wygaśnięcie po 8 godzinach lub 30 minutach bezczynności;
- zabezpieczenie żądań zapisu tokenem CSRF i kontrolą źródła;
- ograniczenie prób logowania;
- dodawanie kont i odbieranie dostępu przez administratora; blokada konta unieważnia sesje;
- zmiana własnego hasła unieważnia wszystkie sesje;
- dziennik operacji w tabeli audit (identyfikator użytkownika, czas, operacja i ścieżka; bez treści formularzy).

Zmienne `ALFA_ACCESS_USER` i `ALFA_ACCESS_PASSWORD` nie służą już do logowania. Dotychczasowy operator musi utworzyć nowe konto CLI. Do publicznego nasłuchu wymagany jest `ALFA_PUBLIC_URL`, np. `https://alpha.twoja-domena.pl` (bez końcowego ukośnika) i TLS na reverse proxy. Nie wystawiaj portu aplikacji bezpośrednio do internetu.

**Każdy aktywny organizator widzi całą bazę**, także inne parafie. Tylko administrator zarządza kontami. Nie zaimplementowano odrębnych uprawnień do parafii ani MFA. Testy nie są niezależnym audytem bezpieczeństwa ani potwierdzeniem zgodności z RODO. Przed użyciem danych rzeczywistych potrzebne są decyzje administratora danych o podstawie przetwarzania, dostępie i retencji oraz sprawdzone kopie zapasowe. Nie zapisuj treści rozmów ani informacji ze spowiedzi.

## Projekt wizualny

Układ zbliżony do CRM: przełącznik edycji, lista osób, wyszukiwanie, filtry i karta osoby z rozwijanymi powiązaniami. Ciepła biel i czerwone akcenty stanowią autorską oprawę roboczą; nie używamy oficjalnych logotypów ani nie deklarujemy zgodności z księgą identyfikacji Alpha. Dostęp do oficjalnej strony `polska.alpha.org` był blokowany przez politykę sieci podczas tej sesji, więc przegląd źródeł internetowych pozostaje niewykonany.

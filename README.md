# Alpha — organizatorzy

Prosty CRM dla organizatorów katolickich kursów Alpha. Na pierwszym ekranie: edycja i uczestnicy. Harmonogram, zadania, parafie, słownik ról i powiązania są na kolejnych kartach.

## Uruchomienie i sprawdzenie

Node.js 24+. Brak zewnętrznych zależności i procesu budowania.

```sh
npm start
npm run check
npm test
```

Domyślnie nasłuch wyłącznie lokalny, port 3000. Nie jest to publiczne wdrożenie. Test integracyjny uruchamia własne serwery, używa osobnej tymczasowej bazy i kończy ich działanie.

## Model danych

- Parafia ma wiele edycji. Edycja ma wymagane rozpoczęcie i zakończenie. Formularz używa miesięcy; API przyjmuje miesiące lub pełne daty, np. `2026-10` albo `2026-10-15`.
- Karta osoby (imię, nazwisko, kontakt) jest niezależna od edycji i parafii.
- Osoba może mieć zero lub wiele powiązań z parafiami oraz zero lub wiele udziałów w edycjach.
- Każdy udział ma własny status, grupę i dowolną liczbę ról. Słownik ról można dodawać i edytować w ustawieniach.
- Usunięcie przypisania do edycji usuwa obecności tej osoby w tej edycji; formularz uprzedza o tym. Nie usuwa jej karty ani innych udziałów.
- Powiązanie osoby z parafią jest niezależne od udziału w edycji.

Na nowej bazie aplikacja zakłada parafię **Zmartwychwstania Pańskiego**, edycję **Jesienna 2026/2027 · Zmartwychwstania Pańskiego**, rozpoczęcie **2026-10**, zakończenie **2027-01** i osobę **Osoba Testowa** (`osoba.testowa@example.com`). Nie zgadujemy miejscowości ani dokładnych dni spotkań. Dane można edytować w interfejsie.

## Trwałość i migracja

SQLite: `data/alfa.sqlite` oraz pliki WAL. Katalog jest ignorowany przez Git i Docker. Przed aktualizacją wykonaj kopię zapasową przy zatrzymanej aplikacji (lub użyj mechanizmu SQLite backup/VACUUM INTO). Migracja zachowuje stare karty osób i obecności; nie scala automatycznie podobnych nazwisk ani adresów e-mail. Stare daty zakończenia pozostają do uzupełnienia. Historyczne tabele pozostają jako kopia po migracji; zmiany interfejsu zapisują się w nowym modelu.

`ALFA_DB` wskazuje ścieżkę bazy, `PORT` port, `ALFA_SEED=0` wyłącza dodawanie danych startowych. Startowe wpisy tworzone są tylko, jeśli ich brakuje; edycja wprowadzona przez organizatora nie jest nadpisywana przy restarcie. Osoba testowa może zostać ponownie dodana po usunięciu, jeśli seed jest włączony — na docelowym serwerze po inicjalizacji ustaw `ALFA_SEED=0`.

## Wdrożenie na serwerze

Potrzebny hosting z Node.js 24 lub Dockerem, **trwałym dyskiem** i HTTPS. Statyczny hosting plików (np. same GitHub Pages) nie obsłuży API i SQLite. Środowisko rozmowy ChatGPT nie stanowi publicznego hostingu aplikacji.

Dockerfile przygotowuje serwer na porcie 3000. Montuj trwały dysk w `/app/data`; zapewnij uprawnienia zapisu użytkownikowi `node` (UID 1000). Ustaw bezpiecznie w hostingu:

- `ALFA_ACCESS_USER` — nazwa organizatora;
- `ALFA_ACCESS_PASSWORD` — silne hasło, nigdy w repozytorium ani w czacie;
- `HOST=0.0.0.0` (ustawione w obrazie);
- `ALFA_DB=/app/data/alfa.sqlite` (ustawione w obrazie).

Serwer odmówi publicznego nasłuchu bez danych logowania. HTTP Basic chroni wszystkie strony i API; reverse proxy musi zapewniać HTTPS i przekazywać nagłówek Authorization. Pierwsze otwarcie adresu wyświetli okno logowania przeglądarki. To jedno współdzielone konto organizatorów, bez indywidualnych uprawnień do parafii. Nie stanowi pełnego systemu kont. Przed użyciem rzeczywistych danych wymagane są odpowiednie zasady dostępu, retencji, kopie zapasowe i ustalenie zasad przetwarzania danych dotyczących religii.

Nie przechowujemy treści rozmów, ocen wiary ani informacji ze spowiedzi. Korzystaj obecnie z danych testowych.

## Projekt wizualny

Układ zbliżony do CRM: przełącznik edycji, lista osób, wyszukiwanie, filtry i karta osoby z rozwijanymi powiązaniami. Ciepła biel i czerwone akcenty stanowią autorską oprawę roboczą; nie używamy oficjalnych logotypów ani nie deklarujemy zgodności z księgą identyfikacji Alpha. Dostęp do oficjalnej strony `polska.alpha.org` był blokowany przez politykę sieci podczas tej sesji, więc przegląd źródeł internetowych pozostaje niewykonany.

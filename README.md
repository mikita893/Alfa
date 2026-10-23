# Alpha — przestrzeń organizatorów

Pierwsza lokalna wersja aplikacji do organizacji katolickich kursów Alpha. Domyślnie jedna parafia; można dodać kolejne i przełączać ich edycje. Interfejs w języku polskim, dostosowany do telefonu i komputera.

## Uruchomienie

Wymagany **Node.js 24 lub nowszy** (wbudowany `node:sqlite`). Brak zewnętrznych zależności i etapu budowania.

```sh
cd /workspace/Alfa
npm start
```

Serwer słucha wyłącznie na interfejsie lokalnym, port 3000. `npm run dev` uruchamia serwer z automatycznym restartem po zmianie kodu serwera. Po zmianie plików interfejsu odśwież przeglądarkę.

```sh
npm run check
npm test
```

Test integracyjny uruchamia osobny serwer z tymczasową bazą i sprawdza zapis osób, wiele parafii, relacje edycji, walidację, obecności, ukończenie zadań, trwałość po restarcie i usuwanie powiązanych obecności.

## Co działa

- Pulpit wybranej edycji: uczestnicy, zespół, grupy, spotkania i zadania.
- Dodawanie i edycja parafii oraz edycji kursu.
- Dodawanie, edycja, usuwanie i wyszukiwanie osób; role, statusy i grupy w ramach edycji.
- Filtry po roli i grupie. Grupa jest na razie nazwą przypisaną osobie.
- Spotkania: temat, data, godzina i miejsce; lista obecności zapisywana od razu.
- Zadania: termin, osoba odpowiedzialna i ukończenie.
- Dane w trwałej bazie SQLite; zmiana parafii lub edycji zmienia zakres widocznych wpisów.

## Dane i ograniczenia prototypu

Przy pierwszym uruchomieniu tworzona jest baza `data/alfa.sqlite` i fikcyjna parafia z przykładowymi osobami (adresy `example.com`). Baza i jej pliki WAL są ignorowane przez Git. Zatrzymaj serwer przed kopiowaniem całego katalogu `data` jako lokalnej kopii zapasowej. Nie usuwaj katalogu, jeśli zawiera potrzebne dane.

Można wskazać inną bazę, port i wyłączyć wypełnienie nowej bazy przykładami:

```sh
ALFA_DB=/tmp/alfa-empty.sqlite ALFA_SEED=0 PORT=3001 npm start
```

`ALFA_SEED=0` działa przy tworzeniu bazy; nie usuwa już zapisanych danych. Wszystkie daty i godziny spotkań są lokalnymi terminami organizatora. Pulpit ustala bieżący dzień według strefy Europe/Warsaw.

**To lokalny prototyp bez logowania. Używaj danych testowych.** Dostęp do aplikacji oznacza dostęp do wszystkich parafii. Podział parafii w interfejsie nie jest granicą uprawnień. Przed udostępnieniem aplikacji i wprowadzeniem danych rzeczywistych potrzebne są uwierzytelnianie organizatorów, uprawnienia do parafii, dziennik audytowy, bezpieczne wdrożenie, kopie zapasowe oraz zasady przetwarzania i retencji danych.

Osoba jest na tym etapie wpisem w jednej edycji z jedną rolą. W kolejnej wersji można oddzielić wspólną kartę osoby od udziałów i wielu ról w edycjach. Osoby odpowiedzialne za zadania są obecnie zapisywane jako tekst. Brak wysyłki wiadomości, publicznych zapisów, płatności i portalów uczestników. Edycje i parafie nie mają operacji usuwania, aby uniknąć przypadkowej utraty całych zbiorów.

Nie zapisujemy treści rozmów, ocen wiary ani informacji ze spowiedzi.

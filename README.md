Skaner Faktur — dokumentacja

![alt text](https://img.shields.io/badge/GPL-3?label=LICENSE&color=blue)
![alt text](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)
![alt text](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js)
![alt text](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql)
![alt text](https://img.shields.io/badge/Express.js-4.18.2-000000?logo=express)

Opis funkcjonalności:
- Dashboard i tabela faktur
  - Przegląd faktur z możliwością filtrowania po kolumnach, sortowania i paginacji.
  - Edycja w miejscu (inline) wybranych pól, bez przeładowania strony.
  - Oznaczanie statusu płatności: `niezapłacona`, `zapłacona`, `po terminie`.
- Dodawanie faktur (upload)
  - Obsługa `PDF`, `PNG`, `JPG` przez przeciągnij‑upuść lub wybór pliku.
  - Automatyczne parsowanie treści i wyodrębnianie: numer faktury, daty, NIPy, kwoty netto/VAT/brutto, pozycje.
- Silniki OCR
  - `tesseract` (domyślny) — szybki, bez zewnętrznych kosztów.
  - `google_vision` — wyższa dokładność; wymaga `GOOGLE_APPLICATION_CREDENTIALS`.
- Kategorie
  - Tworzenie, edycja, przypisywanie kategorii do faktur.
  - Zależność kategorii od użytkownika (izolacja danych).
- Integracja KSeF
  - Zarządzanie certyfikatami i sesjami, import faktur zakupowych dla wybranego okresu.
  - Mapowanie błędów i odpowiedzi do czytelnych komunikatów (`utils/ksefErrorMapper.js`).
- IMAP worker
  - Pobiera załączniki z maili i przetwarza je do faktur.
  - Konfiguracja skrzynki szyfrowana w bazie (`utils/crypto.js`, AES‑256‑GCM).
- Eksport/raporty
  - Eksport miesięczny do `xlsx` (Excel) z kolumnami zgodnymi z tabelą.
  - Raporty PDF z podsumowaniami (suma netto/VAT/brutto, liczba faktur, wg kategorii).
- Kopia zapasowa bazy
  - Generowanie i pobieranie `mysqldump` bazy `invoice_parser` jednym kliknięciem.
- Uwierzytelnianie i autoryzacja
  - Rejestracja/logowanie, tokeny JWT, przechowywanie w `localStorage` (frontend) i middleware sprawdzające token (backend).
  - Ochrona tras na froncie przez `ProtectedRoute`/`PublicRoute`.
- Ustawienia
  - Konfiguracja IMAP/KSeF, zarządzanie kluczami/certyfikatami.
  
Statusy:
- Backend: `http://localhost:3000` (`GET /api/health` zwraca `{"status":"ok"}`)
- Frontend: `http://localhost:3001`

Wymagania:
- `Node.js >= 18`
- `MySQL 8.0` (Docker lub lokalnie)
- (opcjonalnie) `Docker Desktop`

Uruchomienie w 5 krokach:
1) Backend `.env` w `invoice-backend/.env`
   - `DB_HOST=localhost`
   - `DB_USER=root`
   - `DB_PASSWORD=<hasło>`
   - `DB_NAME=invoice_parser`
   - `JWT_SECRET=<losowy_hex_32B>`
   - `ENCRYPTION_KEY=<losowy_hex_64B>`
   

2) Frontend `.env` w `invoice-frontend/.env`
   - `REACT_APP_API_URL=http://localhost:3000`

3) Baza danych MySQL
   - Docker: `docker-compose up -d` (usługi: `mysql`, `phpmyadmin` na `http://localhost:8080`)
   - Lokalnie: zainstaluj MySQL Community/XAMPP, utwórz DB `invoice_parser`
   - Import schematu: użyj `db.session.sql`

4) Instalacja zależności
   - Backend: `cd invoice-backend && npm install`
   - Frontend: `cd invoice-frontend && npm install`

5) Start aplikacji
   - Backend: `npm start` w `invoice-backend` (port `3000`)
   - Frontend: `npm start` w `invoice-frontend` (port `3001`)

Funkcje kluczowe:
- Import z KSeF (usługi w `invoice-backend/services/ksefService.js`)
- OCR: Tesseract
- Worker IMAP: `invoice-backend/imap-worker.js`
- Eksport do Excel i raporty PDF
- Kopia bazy danych

Nowe funkcje (płatności):
- Pola `payment_status` i `payment_due_date` w tabeli `invoices` (SQL).
- Upload (`POST /api/upload`) zapisuje status i termin płatności z formularza.
- Edycja w tabeli: wybór `payment_status` oraz edycja `payment_due_date` (pole daty).
- Walidacja frontend: dla statusu `zapłacona` termin płatności nie może być w przeszłości.
- Wyliczanie statusu „po terminie” odbywa się wyłącznie po stronie frontend na podstawie `payment_due_date`.
- Widok tylko‑do‑odczytu zawiera kolumnę „Termin płatności”.

Zmiany w API (płatności):
- `PUT /api/invoices/:id` — obsługuje aktualizację `payment_status` i `payment_due_date`.
- `POST /api/invoices` — ręczne tworzenie faktury z obsługą pól płatności.
- `POST /api/ksef/import-invoice` — zapisuje `payment_status` (domyślnie `niezapłacona`) i `payment_due_date` (domyślnie `NULL`).
- `GET /api/invoices` — usunięto serwerową normalizację „po terminie”; logika przeniesiona na frontend.

Migracje (setup‑mysql.sql):
- Dla istniejących instalacji dodano:
  - `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT NULL;`
  - `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_due_date DATE DEFAULT NULL;`
  Jeśli używasz starszej wersji MySQL bez `IF NOT EXISTS`, dodaj kolumny ręcznie lub dostarczymy alternatywny skrypt.

Autoryzacja API:
- Rejestracja: `POST /api/register { email, password }`
- Logowanie: `POST /api/login { email, password }` → otrzymujesz `token`
- Użycie: `Authorization: Bearer <token>`
- Przykład: `GET /api/invoices` wymaga tokena

Endpointy pomocnicze:
- `GET /api/health` — status serwera bez tokena

Bezpieczeństwo:
- `ENCRYPTION_KEY` ładowany przy starcie (`require('dotenv').config()` na początku `server.js` i `imap-worker.js`)
- Nie commituj sekretów: `.env` ignorowane w repo (root, backend, frontend)
- Produkcja: ustaw zmienne środowiskowe poza repo, korzystaj z menedżera sekretów

Konfiguracja Docker (skrót):
- `docker-compose.yml` zawiera:
  - `mysql:8.0` na `3306` z wolumenem `./.data/mysql`
  - `phpmyadmin` na `8080` (zmienna `PMA_HOST=mysql`)

Rozwiązywanie problemów:
- Frontend nie startuje: zainstaluj `react-scripts@5`, `react@18`, `react-dom@18`
- Brak tokenu: zaloguj się i użyj nagłówka `Authorization`
- ENCRYPTION_KEY ostrzeżenie: upewnij się, że `.env` ładowany jest na początku pliku
- MySQL nie działa: uruchom przez Docker/XAMPP lub zainstaluj MySQL Community

Licencja:
- GPL-3.0 (zobacz `LICENSE`)

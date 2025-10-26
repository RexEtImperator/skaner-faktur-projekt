## Architektura Projektu

Projekt składa się z dwóch głównych części: backendu w Node.js/Express (`invoice-backend`) i frontendu w React (`invoice-frontend`).

- **Backend (`invoice-backend`):**
  - Główny plik serwera to `server.js`. Zawiera on definicje wszystkich endpointów API, middleware oraz konfigurację serwera.
  - Logika biznesowa jest częściowo odseparowana w serwisach, np. `services/ksefService.js`, który odpowiada za komunikację z Krajowym Systemem e-Faktur.
  - Narzędzia pomocnicze, takie jak szyfrowanie (`utils/crypto.js`) czy mappery danych (`utils/ksefMapper.js`), znajdują się w katalogu `utils`.
  - Aplikacja łączy się z bazą danych MySQL `invoice_parser`. Schemat bazy jest zdefiniowany w pliku `db.session.sql`.

- **Frontend (`invoice-frontend`):**
  - Jest to standardowa aplikacja stworzona za pomocą Create React App.
  - Głównym plikiem jest `src/App.jsx`, który zarządza routingiem.
  - Strony (np. `pages/DashboardPage.jsx`) agregują mniejsze komponenty.
  - Komponenty reużywalne znajdują się w `src/components` i są podzielone na kategorie (np. `Auth`, `Invoices`, `Layout`, `Tools`).
  - Komunikacja z backendem odbywa się za pomocą `axios`, a konfiguracja znajduje się w `src/api/axiosConfig.js`.
  - Zarządzanie stanem uwierzytelnienia odbywa się za pomocą `AuthContext.jsx`.

## Kluczowe Przepływy Pracy

### Uruchamianie Aplikacji

1.  **Uruchomienie backendu:**
    ```bash
    cd invoice-backend
    node server.js
    ```
    Serwer nasłuchuje na porcie 3000.

2.  **Uruchomienie frontendu:**
    ```bash
    cd invoice-frontend
    npm start
    ```
    Aplikacja frontendowa uruchomi się na porcie 3001, aby uniknąć konfliktu z backendem.

### Praca z Zależnościami

- Każdy z projektów (`invoice-backend` i `invoice-frontend`) ma swój własny plik `package.json` i folder `node_modules`. Pamiętaj, aby instalować zależności w odpowiednim katalogu.

## Konwencje i Wzorce

- **API:** Wszystkie endpointy API w backendzie są prefiksowane `/api/`. Endpointy wymagające autoryzacji są chronione przez middleware `verifyToken`.
- **Obsługa błędów KSeF:** Błędy zwracane przez API KSeF są mapowane na bardziej czytelne komunikaty za pomocą `utils/ksefErrorMapper.js`.
- **Zmienne środowiskowe:** Konfiguracja bazy danych i klucze bezpieczeństwa są zarządzane za pomocą pliku `.env` w katalogu `invoice-backend`. Nigdy nie umieszczaj wrażliwych danych bezpośrednio w kodzie.
- **Struktura komponentów React:** Komponenty są podzielone na "głupie" (prezentacyjne) i "mądre" (kontenery, np. `DashboardPage.jsx`), które zarządzają stanem i logiką.

## Zewnętrzne Zależności i Integracje

- **Krajowy System e-Faktur (KSeF):** Kluczowa integracja, której logika znajduje się w `services/ksefService.js`. Komunikacja odbywa się za pomocą XML, a do jego tworzenia i parsowania używane są pakiety `xml-js` i `xml-crypto`.
- **OCR:** Aplikacja wykorzystuje `tesseract.js` oraz opcjonalnie Google Cloud Vision (`@google-cloud/vision`) do odczytywania danych z faktur.
- **Baza danych:** MySQL, zarządzana przez pakiet `mysql2`.

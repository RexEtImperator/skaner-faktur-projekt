Skaner Faktur - Zaawansowana Aplikacja Webowa

![alt text](https://img.shields.io/badge/license-MIT-blue.svg)
![alt text](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)
![alt text](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js)
![alt text](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql)
![alt text](https://img.shields.io/badge/Express.js-4.18.2-000000?logo=express)

Skaner Faktur to kompleksowa aplikacja typu full-stack, zaprojektowana do automatyzacji procesu zarządzania fakturami. Aplikacja umożliwia użytkownikom przesyłanie faktur w formacie PDF lub jako obraz, automatyczne odczytywanie kluczowych danych za pomocą technologii OCR oraz ich inteligentne katalogowanie i raportowanie. Projekt integruje się z zewnętrznymi usługami, takimi jak Google Cloud Vision i Krajowy System e-Faktur (KSeF), oraz oferuje zaawansowane funkcje automatyzacji.
<!-- Możesz tu wstawić zrzut ekranu aplikacji -->
🚀 Główne Funkcjonalności
📂 Zarządzanie Fakturami
Przesyłanie Plików: Obsługa metody "przeciągnij i upuść" (Drag & Drop) oraz standardowego wyboru plików (.pdf, .png, .jpg).
Automatyczne Odczytywanie Danych (OCR):
Wbudowany silnik Tesseract.js do szybkiego przetwarzania po stronie serwera.
Opcjonalna integracja z Google Cloud Vision API dla znacznie wyższej dokładności rozpoznawania.
Inteligentne Parsowanie: Wyodrębnianie kluczowych informacji z tekstu: numeru faktury, dat, NIP-ów sprzedawcy i nabywcy, kwot brutto.
Edycja w Miejscu: Możliwość szybkiej korekty odczytanych danych bezpośrednio w tabeli, bez przeładowywania strony.
Zaawansowane Sortowanie i Wyszukiwanie: Błyskawiczne filtrowanie i sortowanie listy faktur po dowolnej kolumnie.
🔌 Automatyzacja i Integracje
Automatyczne Pobieranie z E-mail: Dedykowany proces typu "worker" w tle, który monitoruje skonfigurowaną przez użytkownika skrzynkę pocztową (przez IMAP), automatycznie pobiera załączniki z fakturami i przetwarza je.
Integracja z Krajowym Systemem e-Faktur (KSeF):
Bezpieczne zarządzanie certyfikatami i tokenami autoryzacyjnymi.
Implementacja pełnego cyklu życia sesji z autoryzacją za pomocą podpisu cyfrowego.
Pobieranie listy faktur zakupu z KSeF dla zadanego okresu.
Importowanie wybranych faktur bezpośrednio do systemu.
Elastyczny Silnik OCR: Użytkownik może w ustawieniach wybrać, którego silnika OCR chce używać.
🔐 Bezpieczeństwo i Zarządzanie Użytkownikiem
Pełny System Uwierzytelniania: Rejestracja i logowanie użytkowników z hashowaniem haseł (bcrypt) i sesjami opartymi na tokenach JWT.
Izolacja Danych: Każdy użytkownik ma dostęp wyłącznie do swoich faktur, kategorii i ustawień.
Szyfrowanie Wrażliwych Danych: Kluczowe dane konfiguracyjne (hasło do IMAP, token KSeF) są szyfrowane w bazie danych (AES-265-GCM).
Bezpieczne Przechowywanie Certyfikatów: Pliki certyfikatów KSeF są przechowywane w odizolowanym, bezpiecznym miejscu na serwerze, poza dostępem publicznym.
📊 Raportowanie i Narzędzia
Eksport do Excel: Możliwość wyeksportowania listy faktur z wybranego miesiąca do pliku .xlsx.
Generowanie Raportów PDF: Tworzenie podsumowujących raportów miesięcznych w formacie .pdf.
Kopia Zapasowa: Funkcja tworzenia i pobierania pełnego zrzutu (dump) bazy danych SQL jednym kliknięciem.
🛠️ Architektura i Technologie
Aplikacja została zbudowana w architekturze klient-serwer.
Backend (Node.js / Express.js):
Baza Danych: MySQL
API: RESTful API zabezpieczone tokenami JWT
Przetwarzanie Plików: multer, pdf-parse, tesseract.js, @google-cloud/vision
Integracje: imapflow (IMAP), xml-crypto & xml-js (KSeF)
Bezpieczeństwo: bcryptjs, jsonwebtoken, crypto
Zarządzanie Procesami: pm2 do uruchamiania serwera API i workera IMAP jako oddzielnych procesów.
Frontend (React.js):
Zarządzanie Stanem: React Hooks, Context API (useAuth)
Routing: react-router-dom
Komunikacja z API: axios
Stylizacja: Czysty CSS zorganizowany w pliku App.css.
⚙️ Instrukcja Uruchomienia Projektu
Aby uruchomić projekt lokalnie, postępuj zgodnie z poniższymi krokami.
Krok 1: Wymagania Wstępne
Upewnij się, że na Twoim komputerze są zainstalowane następujące narzędzia:
Node.js (wersja 16.x lub nowsza) -> Pobierz Node.js
Git -> Pobierz Git
Serwer MySQL (np. z pakietu XAMPP lub przez Docker)
PM2 (globalnie): npm install pm2 -g
Krok 2: Klonowanie Repozytorium
Otwórz terminal i sklonuj repozytorium na swój dysk:```bash
git clone https://github.com/RexEtImperator/skaner-faktur-projekt.git
cd skaner-faktur-projekt

### Krok 3: Konfiguracja Bazy Danych

1.  Uruchom swój serwer MySQL.
2.  Połącz się z serwerem i utwórz nową bazę danych:
    ```sql
    CREATE DATABASE invoice_parser CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    ```
3.  W nowo utworzonej bazie danych wykonaj poniższe zapytania SQL, aby stworzyć wszystkie wymagane tabele:
    ```sql
    -- Tworzenie tabeli users
    CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        ocr_engine ENUM('tesseract', 'google_vision') DEFAULT 'tesseract',
        imap_settings JSON NULL,
        ksef_nip VARCHAR(20) NULL,
        ksef_token_encrypted VARCHAR(1024) NULL,
        cert_storage_path VARCHAR(255) NULL,
        cert_password_encrypted VARCHAR(1024) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Tworzenie tabeli categories
    CREATE TABLE categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        user_id INT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Tworzenie tabeli invoices (spójne z backendem)
    CREATE TABLE invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        category_id INT NULL,
        invoice_number VARCHAR(255) NOT NULL,
        issue_date DATE,
        seller_nip VARCHAR(20),
        buyer_nip VARCHAR(20),
        total_net_amount DECIMAL(10, 2),
        total_vat_amount DECIMAL(10, 2),
        total_gross_amount DECIMAL(10, 2),
        month_year VARCHAR(7) NOT NULL,
        payment_status ENUM('niezapłacona', 'zapłacona', 'po terminie') NOT NULL DEFAULT 'niezapłacona',
        payment_due_date DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    -- Tworzenie tabeli invoice_items
    CREATE TABLE invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(10, 3) NOT NULL DEFAULT 1,
        unit_price_net DECIMAL(10, 2) NOT NULL,
        vat_rate VARCHAR(10) NOT NULL,
        total_net_amount DECIMAL(10, 2) NOT NULL,
        total_vat_amount DECIMAL(10, 2) NOT NULL,
        total_gross_amount DECIMAL(10, 2) NOT NULL,
        CONSTRAINT fk_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );
    ```

### Krok 4: Konfiguracja Backendu

1.  Przejdź do folderu backendu:
    ```bash
    cd invoice-backend
    ```
2.  Zainstaluj wszystkie zależności:
    ```bash
    npm install
    ```
3.  Stwórz plik `.env` w folderze `invoice-backend` i skonfiguruj go (możesz skopiować `env.example`, jeśli istnieje, lub stworzyć go od zera):
    ```env
    # Konfiguracja bazy danych
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=twoje_haslo_do_bazy
    DB_NAME=invoice_parser

    # Klucze bezpieczeństwa (użyj silnych, losowych wartości)
    JWT_SECRET=bardzo_tajny_klucz_do_tokenow_jwt_zmien_go
    ENCRYPTION_KEY=bardzo_dlugi_i_bezpieczny_klucz_do_szyfrowania_danych_tez_go_zmien
    ```
4.  **(Opcjonalnie)** Jeśli chcesz używać Google Cloud Vision, ustaw `GOOGLE_APPLICATION_CREDENTIALS` w `.env` (np. `./gcp-credentials.json`) lub umieść plik `gcp-credentials.json` w folderze `invoice-backend`.
5.  **(Opcjonalnie)** Jeśli chcesz testować podpisywanie KSeF, umieść swój klucz prywatny w folderze `invoice-backend` pod nazwą `private_key.pem`.

### Krok 5: Konfiguracja Frontendu

1.  Wróć do głównego folderu i przejdź do folderu frontendu:
    ```bash
    cd ../invoice-frontend
    ```2.  Zainstaluj wszystkie zależności:
    ```bash
    npm install
    ```
3.  Skonfiguruj `.env` w `invoice-frontend` (adres API):
    ```env
    REACT_APP_API_URL=http://localhost:3000/api
    ```

### Krok 6: Uruchomienie Aplikacji

1.  **Uruchom procesy backendu** za pomocą PM2 z folderu `invoice-backend`:
    ```bash
    cd ../invoice-backend
    pm2 start server.js --name "api-server"
    pm2 start imap-worker.js --name "imap-worker"
    ```
    Możesz monitorować logi za pomocą polecenia `pm2 logs`.

2.  **Uruchom aplikację kliencką (frontend)** z folderu `invoice-frontend`:
    ```bash
    cd ../invoice-frontend
    npm start
    ```

Aplikacja powinna być teraz dostępna w przeglądarce pod adresem **http://localhost:3000** (lub innym portem, na którym uruchomił ją React, np. 3001). Upewnij się, że porty w konfiguracji `axios` na frontendzie i w serwerze API są zgodne.

---

## 📜 Licencja

Ten projekt jest udostępniony na licencji MIT. Zobacz plik `LICENSE`, aby uzyskać więcej informacji.

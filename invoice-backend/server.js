const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

// Importy narzędzi i serwisów
const { encrypt, decrypt } = require('./utils/crypto');
const { mapKsefFaVatToDbModel } = require('./utils/ksefMapper');
const KsefService = require('./services/ksefService');

// Importy do przetwarzania faktur
const pdf = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const exceljs = require('exceljs');
const PDFDocument = require('pdfkit');
const mysqldump = require('mysqldump');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'twoj_super_tajny_klucz_jwt_do_zmiany';

// Konfiguracja połączenia z bazą danych MySQL
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'admin',
    database: process.env.DB_NAME || 'invoice_parser'
};

// Inicjalizacja klienta Google Vision (jeśli jest skonfigurowany)
let visionClient;
try {
    visionClient = new ImageAnnotatorClient({ keyFilename: 'gcp-credentials.json' });
} catch (e) {
    console.warn("Plik gcp-credentials.json nie został znaleziony. Silnik Google Vision będzie niedostępny.");
}

// Middleware
app.use(cors());
app.use(express.json());

// --- Konfiguracja Multer ---

// Przechowywanie wgrywanych faktur w pamięci
const invoiceStorage = multer.memoryStorage();
const invoiceUpload = multer({ storage: invoiceStorage });

// Przechowywanie certyfikatów na dysku w bezpiecznym folderze
const certStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const userPath = path.join(__dirname, 'user_certs', req.userId.toString());
        await fs.mkdir(userPath, { recursive: true });
        cb(null, userPath);
    },
    filename: (req, file, cb) => {
        const fileName = file.fieldname === 'privateKey' ? 'private_key.pem' : 'public_cert.pem';
        cb(null, fileName);
    }
});
const certUpload = multer({ storage: certStorage });

// --- Funkcja pomocnicza do parsowania tekstu ---
function parseText(text) {
    const data = {
        items: [],
        totalNetAmount: null,
        totalVatAmount: null,
        totalGrossAmount: null
    };

    // Proste wzorce do wyszukiwania kluczowych informacji
    const patterns = {
        invoiceNumber: /Faktura nr[:\s]*([\w\/\-]+)/i,
        issueDate: /Data wystawienia[:\s]*(\d{4}-\d{2}-\d{2})/i,
        sellerNIP: /NIP sprzedawcy[:\s]*(\d{10})/i,
        buyerNIP: /NIP nabywcy[:\s]*(\d{10})/i,
        totalGrossAmount: /Do zapłaty[:\s]*([\d\s,.]+)\s*PLN/i
    };

    for (const [key, regex] of Object.entries(patterns)) {
        const match = text.match(regex);
        if (match && match[1]) {
            data[key] = match[1].trim();
        }
    }

    // Przetwarzanie kwoty brutto
    if (data.totalGrossAmount) {
        data.totalGrossAmount = parseFloat(data.totalGrossAmount.replace(/\s/g, '').replace(',', '.'));
    }

    // Obliczanie month_year
    if (data.issueDate) {
        const date = new Date(data.issueDate);
        data.monthYear = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    }

    // Przykładowa, uproszczona logika do parsowania pozycji - wymaga dostosowania do formatu faktur
    const itemRegex = /^(.+?)\s+(\d+[,.]\d{2})\s+(\d+[,.]\d{2})\s+(\d+[,.]\d{2})\s+([\d,.]+%?|zw.)$/gm;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
        data.items.push({
            description: match[1].trim(),
            unit_price_net: parseFloat(match[2].replace(',', '.')), // Cena jedn. netto
            total_net_amount: parseFloat(match[2].replace(',', '.')), // Wartość netto (uproszczenie, powinno być liczone)
            vat_rate: match[5].trim(), // Stawka VAT
            total_vat_amount: parseFloat(match[3].replace(',', '.')), // Kwota VAT
            total_gross_amount: parseFloat(match[4].replace(',', '.')) // Wartość brutto
        });
    }

    // Sumowanie kwot z pozycji, jeśli zostały znalezione
    if (data.items.length > 0) {
        data.totalNetAmount = data.items.reduce((sum, item) => sum + item.total_net_amount, 0);
        data.totalVatAmount = data.items.reduce((sum, item) => sum + item.total_vat_amount, 0);
        // Suma brutto z pozycji może być użyta do weryfikacji z kwotą "Do zapłaty"
        data.totalGrossAmount = data.items.reduce((sum, item) => sum + item.total_gross_amount, 0);
    }

    return data;
}

// --- Middleware do weryfikacji tokenu JWT ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Brak tokenu, autoryzacja odmówiona.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        res.status(403).json({ message: 'Token jest nieprawidłowy.' });
    }
};


// =================================================================
// =============== API ENDPOINTS ===================================
// =================================================================

// --- Uwierzytelnianie ---
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email i hasło są wymagane.' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const connection = await mysql.createConnection(dbConfig);
        const sql = 'INSERT INTO users (email, password_hash) VALUES (?, ?)';
        await connection.execute(sql, [email, hashedPassword]);
        await connection.end();
        res.status(201).json({ message: 'Użytkownik zarejestrowany!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Użytkownik o tym adresie email już istnieje.' });
        }
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

// --- Logowanie ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
        await connection.end();

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        }
        
        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { id: user.id, email: user.email } });

    } catch (error) {
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

// --- Kategorie (zabezpieczone) ---
app.get('/api/categories', verifyToken, async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM categories WHERE user_id = ?', [req.userId]);
        await connection.end();
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

// --- Zarządzanie Ustawieniami i Certyfikatami ---
app.get('/api/settings', verifyToken, async (req, res) => {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT email, ocr_engine, imap_settings FROM users WHERE id = ?', [req.userId]);
    await connection.end();
    if (rows.length > 0) {
        // Nigdy nie wysyłaj hasła IMAP do frontendu!
        const settings = rows[0];
        if (settings.imap_settings) {
            settings.imap_settings.password = '********';
        }
        res.json(settings);
    } else {
        res.status(404).send('Nie znaleziono użytkownika.');
    }
});

app.put('/api/settings', verifyToken, async (req, res) => {
    const { ocr_engine, imap_settings, ksef_nip, ksef_token } = req.body;
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [userRows] = await connection.execute('SELECT imap_settings, ksef_token_encrypted FROM users WHERE id = ?', [req.userId]);
        const currentUser = userRows[0];

        let newImapSettings = currentUser.imap_settings ? JSON.parse(currentUser.imap_settings) : {};
        if (imap_settings) {
            newImapSettings = { ...newImapSettings, ...imap_settings };
            if (imap_settings.password && imap_settings.password !== '********') {
                newImapSettings.password = encrypt(imap_settings.password);
            }
        }

        let newKsefToken = currentUser.ksef_token_encrypted;
        if (ksef_token && ksef_token !== '********') {
            newKsefToken = encrypt(ksef_token);
        }
        
        await connection.execute(
            'UPDATE users SET ocr_engine = ?, imap_settings = ?, ksef_nip = ?, ksef_token_encrypted = ? WHERE id = ?',
            [ocr_engine, JSON.stringify(newImapSettings), ksef_nip, newKsefToken, req.userId]
        );
        await connection.end();
        res.json({ message: 'Ustawienia zaktualizowane.' });
    } catch (error) {
        console.error("Błąd zapisu ustawień:", error);
        res.status(500).send('Błąd serwera.');
    }
});

// --- Endpoint do zarządzania certyfikatami ---
app.post('/api/certs/upload', verifyToken, certUpload.fields([{ name: 'privateKey' }, { name: 'publicKey' }]), async (req, res) => {
    const { certPassword } = req.body;
    const userPath = path.join('user_certs', req.userId.toString()); // Ścieżka względna do zapisu w DB

    try {
        const connection = await mysql.createConnection(dbConfig);
        let encryptedPassword = null;
        if (certPassword) {
            encryptedPassword = encrypt(certPassword);
        }
        await connection.execute(
            'UPDATE users SET cert_storage_path = ?, cert_password_encrypted = ? WHERE id = ?',
            [userPath, encryptedPassword, req.userId]
        );
        await connection.end();
        res.json({ message: 'Certyfikaty zostały pomyślnie przesłane i zapisane.' });
    } catch (error) {
        console.error('Błąd zapisu ścieżki certyfikatu:', error);
        res.status(500).send('Błąd serwera podczas zapisywania informacji o certyfikatach.');
    }
});

// --- Przetwarzanie Faktur ---
app.post('/api/upload', verifyToken, invoiceUpload.single('invoice'), async (req, res) => {
    if (!req.file) return res.status(400).send('Nie wybrano pliku.');

    try {
        const connection = await mysql.createConnection(dbConfig);
        const [userRows] = await connection.execute('SELECT ocr_engine FROM users WHERE id = ?', [req.userId]);
        const ocrEngine = userRows[0]?.ocr_engine || 'tesseract';
        let text = '';

        if (req.file.mimetype.startsWith('image/')) {
            if (ocrEngine === 'google_vision' && visionClient) {
                const [result] = await visionClient.textDetection(req.file.buffer);
                text = result.fullTextAnnotation?.text || '';
            } else {
                const result = await Tesseract.recognize(req.file.buffer, 'pol');
                text = result.data.text;
            }
        } else if (req.file.mimetype === 'application/pdf') {
            const data = await pdf(req.file.buffer);
            text = data.text;
        }

        const invoiceData = parseText(text);
        if (!invoiceData.invoiceNumber || !invoiceData.totalGrossAmount) {
            return res.status(400).json({ message: 'Nie udało się odczytać kluczowych danych z faktury.' });
        }

        // Rozpocznij transakcję
        await connection.beginTransaction();

        const invoiceSql = 'INSERT INTO invoices (user_id, invoice_number, issue_date, seller_nip, buyer_nip, total_net_amount, total_vat_amount, total_gross_amount, month_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [invoiceResult] = await connection.execute(invoiceSql, [
            req.userId, invoiceData.invoiceNumber, invoiceData.issueDate, invoiceData.sellerNIP,
            invoiceData.buyerNIP, invoiceData.totalNetAmount, invoiceData.totalVatAmount, invoiceData.totalGrossAmount, invoiceData.monthYear
        ]);
        const invoiceId = invoiceResult.insertId;

        // Zapisz pozycje faktury
        if (invoiceData.items && invoiceData.items.length > 0) {
            const itemsSql = 'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_net, vat_rate, total_net_amount, total_vat_amount, total_gross_amount) VALUES ?';
            const itemsValues = invoiceData.items.map(item => [
                invoiceId, item.description, item.quantity || 1, item.unit_price_net, item.vat_rate, 
                item.total_net_amount, item.total_vat_amount, item.total_gross_amount
            ]);
            await connection.query(itemsSql, [itemsValues]);
        }

        // Zatwierdź transakcję
        await connection.commit();
        await connection.end();

        res.status(201).json({ message: 'Faktura przetworzona i zapisana!', data: invoiceData });
    } catch (error) {
        console.error('Błąd przetwarzania pliku:', error);
        res.status(500).send('Wystąpił błąd serwera.');
    }
});

/**
 * Endpoint: GET /api/invoices
 * Przeznaczenie: Pobiera wszystkie faktury należące do zalogowanego użytkownika.
 * Parametry zapytania (query):
 *  - includeItems (boolean): Jeśli `true`, do każdej faktury zostaną dołączone jej pozycje.
 * Zabezpieczenia: Wymaga ważnego tokenu JWT.
 */
app.get('/api/invoices', verifyToken, async (req, res) => {
    const { includeItems } = req.query;
    let connection; // Zdefiniuj zmienną połączenia na zewnątrz bloku try, aby była dostępna w bloku finally

    try {
        // Krok 1: Utwórz połączenie z bazą danych.
        connection = await mysql.createConnection(dbConfig);
        
        // Krok 2: Przygotuj zapytanie SQL do pobrania głównych danych faktur.
        const sql = `
            SELECT i.*, c.name AS category_name 
            FROM invoices i 
            LEFT JOIN categories c ON i.category_id = c.id 
            WHERE i.user_id = ? 
            ORDER BY i.issue_date DESC
        `;

        // Krok 3: Wykonaj zapytanie, bezpiecznie przekazując ID użytkownika jako parametr.
        const [invoices] = await connection.execute(sql, [req.userId]);

        // Krok 4: Jeśli zażądano pozycji faktur (includeItems=true) i znaleziono jakieś faktury...
        if (includeItems === 'true' && invoices.length > 0) {
            // ...pobierz wszystkie pozycje dla znalezionych faktur w jednym zapytaniu dla wydajności.
            const invoiceIds = invoices.map(inv => inv.id);
            const itemsSql = `SELECT * FROM invoice_items WHERE invoice_id IN (?)`;
            const [items] = await connection.query(itemsSql, [invoiceIds]);

            // ...a następnie zmapuj pozycje do odpowiednich faktur w bardziej wydajny sposób.
            const itemsByInvoiceId = items.reduce((acc, item) => {
                if (!acc[item.invoice_id]) {
                    acc[item.invoice_id] = [];
                }
                acc[item.invoice_id].push(item);
                return acc;
            }, {});

            invoices.forEach(invoice => {
                invoice.items = itemsByInvoiceId[invoice.id] || [];
            });
        }
        
        // Krok 5: Zwróć pobrane dane (wzbogacone o pozycje, jeśli było to wymagane) w formacie JSON.
        res.status(200).json(invoices);

    } catch (error) {
        // Krok 6: W przypadku błędu, zaloguj go i wyślij generyczny komunikat do klienta.
        console.error('Błąd podczas pobierania faktur z bazy danych:', error);
        res.status(500).json({ message: 'Wystąpił błąd serwera podczas pobierania faktur.' });

    } finally {
        // Krok 7: Niezależnie od wyniku, upewnij się, że połączenie z bazą danych zostało zamknięte.
        if (connection) {
            await connection.end();
        }
    }
});

app.get('/api/invoices/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM invoices WHERE id = ? AND user_id = ?', [id, req.userId]);
        await connection.end();

        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ message: 'Nie znaleziono faktury lub brak uprawnień.' });
        }
    } catch (error) {
        console.error('Błąd pobierania faktury:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
});

// Endpoint do aktualizacji faktury
app.put('/api/invoices/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { 
        invoice_number, 
        issue_date, 
        seller_nip, 
        buyer_nip, 
        total_net_amount, 
        total_vat_amount, 
        total_gross_amount 
    } = req.body;

    // Prosta walidacja
    if (!invoice_number || !issue_date || !total_gross_amount) {
        return res.status(400).json({ message: 'Brak wymaganych danych (numer faktury, data, kwota brutto).' });
    }

    // Obliczanie month_year na podstawie nowej daty
    const date = new Date(issue_date);
    const month_year = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

    try {
        const connection = await mysql.createConnection(dbConfig);
        const sql = `
            UPDATE invoices 
            SET invoice_number = ?, issue_date = ?, seller_nip = ?, buyer_nip = ?, 
                total_net_amount = ?, total_vat_amount = ?, total_gross_amount = ?, month_year = ?
            WHERE id = ? AND user_id = ?
        `;
        const [result] = await connection.execute(sql, [
            invoice_number,
            issue_date,
            seller_nip,
            buyer_nip,
            total_net_amount,
            total_vat_amount,
            total_gross_amount,
            month_year,
            id,
            req.userId
        ]);
        await connection.end();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Nie znaleziono faktury o podanym ID lub brak uprawnień.' });
        }

        res.json({ message: 'Dane faktury zaktualizowane!' });
    } catch (error) {
        console.error('Błąd aktualizacji faktury:', error);
        res.status(500).send('Wystąpił błąd serwera.');
    }
});

// Endpoint do usuwania faktury
app.delete('/api/invoices/:id', verifyToken, async (req, res) => {
    const { id } = req.params;

    try {
        const connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute('DELETE FROM invoices WHERE id = ? AND user_id = ?', [id, req.userId]);
        await connection.end();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Nie znaleziono faktury o podanym ID lub brak uprawnień.' });
        }

        res.status(200).json({ message: 'Faktura została usunięta.' });
    } catch (error) {
        console.error('Błąd usuwania faktury:', error);
        res.status(500).send('Wystąpił błąd serwera.');
    }
});

// --- Wyszukiwanie, Raporty i Narzędzia ---
app.get('/api/search', verifyToken, async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ message: 'Brak zapytania do wyszukania.' });
    }

    try {
        const connection = await mysql.createConnection(dbConfig);
        const searchQuery = `%${query}%`;
        const sql = `
            SELECT i.*, c.name as category_name 
            FROM invoices i 
            LEFT JOIN categories c ON i.category_id = c.id 
            WHERE i.user_id = ? AND (
                i.invoice_number LIKE ? OR 
                i.seller_nip LIKE ? OR 
                i.buyer_nip LIKE ?
            )
            ORDER BY issue_date DESC
        `;
        const [rows] = await connection.execute(sql, [req.userId, searchQuery, searchQuery, searchQuery]);
        await connection.end();
        res.json(rows);
    } catch (error) {
        console.error('Błąd wyszukiwania:', error);
        res.status(500).json({ message: 'Błąd serwera podczas wyszukiwania.' });
    }
});

/**
 * Endpoint: GET /api/export
 * Przeznaczenie: Eksportuje faktury z danego miesiąca i roku do pliku Excel (.xlsx).
 * Parametry zapytania (query):
 *  - monthYear (string, wymagany): Miesiąc i rok w formacie "MM/YYYY", np. "10/2025".
 * Zabezpieczenia: Wymaga ważnego tokenu JWT.
 */
app.get('/api/export', verifyToken, async (req, res) => {
    const { monthYear } = req.query;
    let connection;

    // Krok 1: Walidacja danych wejściowych.
    if (!monthYear || !/^\d{2}\/\d{4}$/.test(monthYear)) {
        return res.status(400).json({ message: 'Należy podać prawidłowy miesiąc i rok w formacie DD/MM/YYYY.' });
    }

    try {
        // Krok 2: Połączenie z bazą danych i pobranie odpowiednich danych.
        connection = await mysql.createConnection(dbConfig);
        const sql = `
            SELECT i.invoice_number, i.issue_date, i.seller_nip, i.buyer_nip, i.gross_amount, c.name AS category_name
            FROM invoices i
            LEFT JOIN categories c ON i.category_id = c.id
            WHERE i.user_id = ? AND i.month_year = ?
            ORDER BY i.issue_date ASC
        `;
        const [rows] = await connection.execute(sql, [req.userId, monthYear]);
        
        // Krok 3: Stworzenie nowego skoroszytu i arkuszy w Excelu.
        const workbook = new exceljs.Workbook();
        
        // --- Arkusz 1: Opis Kolumn ---
        const descriptionSheet = workbook.addWorksheet('Opis Kolumn');
        descriptionSheet.columns = [
            { header: 'Nazwa Kolumny', key: 'name', width: 25 },
            { header: 'Opis', key: 'desc', width: 60 }
        ];
        descriptionSheet.addRow({ name: 'invoice_number', desc: 'Numer odczytany z faktury.' });
        descriptionSheet.addRow({ name: 'issue_date', desc: 'Data wystawienia faktury.' });
        descriptionSheet.addRow({ name: 'seller_nip', desc: 'Numer Identyfikacji Podatkowej (NIP) sprzedawcy.' });
        descriptionSheet.addRow({ name: 'buyer_nip', desc: 'Numer Identyfikacji Podatkowej (NIP) nabywcy.' });
        descriptionSheet.addRow({ name: 'gross_amount', desc: 'Całkowita kwota brutto (z podatkiem VAT).' });
        descriptionSheet.addRow({ name: 'category_name', desc: 'Kategoria wydatku przypisana w systemie.' });
        
        // --- Arkusz 2: Dane Faktur ---
        const worksheet = workbook.addWorksheet(`Faktury ${monthYear.replace('/', '-')}`);
        worksheet.columns = [
            { header: 'Numer Faktury', key: 'invoice_number', width: 30 },
            { header: 'Data Wystawienia', key: 'issue_date', width: 18, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'NIP Sprzedawcy', key: 'seller_nip', width: 20 },
            { header: 'NIP Nabywcy', key: 'buyer_nip', width: 20 },
            { header: 'Kategoria', key: 'category_name', width: 25 },
            { header: 'Kwota Brutto', key: 'gross_amount', width: 18, style: { numFmt: '#,##0.00 "zł"' } }
        ];

        // Pogrubienie nagłówków
        worksheet.getRow(1).font = { bold: true };
        
        // Dodaj dane do arkusza
        rows.forEach(invoice => {
            worksheet.addRow({
                ...invoice,
                // Upewnij się, że kwota jest liczbą, aby formatowanie zadziałało
                gross_amount: parseFloat(invoice.gross_amount) 
            });
        });

        // Krok 4: Ustawienie nagłówków HTTP, aby przeglądarka zainicjowała pobieranie pliku.
        const fileName = `faktury-${monthYear.replace('/', '-')}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Krok 5: Zapisz (strumieniuj) skoroszyt bezpośrednio do odpowiedzi HTTP.
        await workbook.xlsx.write(res);
        
        // Zakończ odpowiedź. Jest to ważne, ponieważ strumieniowanie nie zamyka jej automatycznie.
        res.end();

    } catch (error) {
        console.error('Błąd podczas eksportu danych do Excela:', error);
        res.status(500).json({ message: 'Wystąpił błąd serwera podczas generowania pliku Excel.' });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// --- Raport PDF ---
app.get('/api/reports/pdf', verifyToken, async (req, res) => {
    const { monthYear } = req.query; // format 'MM/YYYY'
    if (!monthYear) {
        return res.status(400).send('Należy podać miesiąc i rok.');
    }

    try {
        const connection = await mysql.createConnection(dbConfig);
        const sql = `
            SELECT i.*, c.name as category_name 
            FROM invoices i 
            LEFT JOIN categories c ON i.category_id = c.id 
            WHERE i.user_id = ? AND i.month_year = ? 
            ORDER BY issue_date ASC
        `;
        const [rows] = await connection.execute(sql, [req.userId, monthYear]);
        const totalAmount = rows.reduce((sum, inv) => sum + parseFloat(inv.gross_amount), 0);
        await connection.end();

        // Ustawienia nagłówków do pobrania pliku
        const fileName = `raport-faktur-${monthYear.replace('/', '-')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res);

        // Tworzenie treści PDF
        doc.fontSize(18).text(`Raport faktur za ${monthYear}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Podsumowanie:`);
        doc.fontSize(12).text(`- Liczba faktur: ${rows.length}`);
        doc.fontSize(12).text(`- Łączna kwota: ${totalAmount.toFixed(2)} zł`);
        doc.moveDown(2);
        
        // Nagłówki tabeli
        const tableTop = 250;
        const itemX = 50;
        const dateX = 200;
        const categoryX = 300;
        const amountX = 450;

        doc.fontSize(10).text('Nr faktury', itemX, tableTop)
           .text('Data', dateX, tableTop)
           .text('Kategoria', categoryX, tableTop)
           .text('Kwota brutto', amountX, tableTop, { align: 'right' });

        // Linia pod nagłówkami
        doc.moveTo(itemX, tableTop + 15).lineTo(amountX + 100, tableTop + 15).stroke();
        
        let currentY = tableTop + 25;
        rows.forEach(inv => {
            doc.fontSize(9)
               .text(inv.invoice_number, itemX, currentY)
               .text(new Date(inv.issue_date).toLocaleDateString('pl-PL'), dateX, currentY)
               .text(inv.category_name || 'Brak', categoryX, currentY)
               .text(`${parseFloat(inv.gross_amount).toFixed(2)} zł`, amountX, currentY, { align: 'right' });
            currentY += 20;
        });

        doc.end();

    } catch (error) {
        console.error('Błąd generowania PDF:', error);
        res.status(500).send('Wystąpił błąd serwera.');
    }
});

app.get('/api/backup/db', verifyToken, async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="backup-${Date.now()}.sql"`);

        // mysqldump streamuje wynik bezpośrednio do odpowiedzi HTTP
        await mysqldump({
            connection: dbConfig,
            dump: {
                schema: { tables: ['users', 'categories', 'invoices'] }, // Definiujemy, co ma być w backupie
                data: true,
            },
            // UWAGA: Ta funkcja streamuje dane!
            dumpToFile: null,
        }).then(dump => {
            res.send(dump.dump.data);
        });

    } catch (error) {
        console.error('Błąd tworzenia kopii zapasowej:', error);
        res.status(500).send('Wystąpił błąd serwera.');
    }
});

// --- Integracja z KSeF ---
app.post('/api/ksef/test-session', verifyToken, async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT ksef_nip, ksef_token_encrypted, cert_storage_path FROM users WHERE id = ?', [req.userId]);
        await connection.end();

        const user = rows[0];
        if (!user || !user.ksef_nip || !user.ksef_token_encrypted || !user.cert_storage_path) {
            return res.status(400).json({ message: 'Niekompletne dane do połączenia z KSeF. Uzupełnij NIP, token i prześlij certyfikaty.' });
        }
        
        const decryptedToken = decrypt(user.ksef_token_encrypted);
        const ksefService = new KsefService(user.ksef_nip, decryptedToken, user.cert_storage_path);
        
        const result = await ksefService.testSession();
        res.json(result);

    } catch (error) {
        if (error instanceof KsefError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Błąd testu sesji KSeF:', error);
        res.status(500).json({ message: 'Wewnętrzny błąd serwera podczas testowania sesji.' });
    }
});

// --- Endpointy do integracji z KSeF ---

/**
 * Endpoint: POST /api/ksef/invoices
 * Przeznaczenie: Pobiera listę nagłówków faktur z KSeF dla danego okresu.
 * Oczekuje w body: { "startDate": "YYYY-MM-DD" }
 */
app.post('/api/ksef/invoices', verifyToken, async (req, res) => {
    const { startDate } = req.body;
    if (!startDate) {
        return res.status(400).json({ message: 'Data początkowa jest wymagana.' });
    }

    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT ksef_nip, ksef_token_encrypted, cert_storage_path FROM users WHERE id = ?', [req.userId]);
        await connection.end();

        const user = rows[0];
        if (!user || !user.ksef_nip || !user.ksef_token_encrypted || !user.cert_storage_path) {
            return res.status(400).json({ message: 'Niekompletne dane do połączenia z KSeF.' });
        }
        
        const decryptedToken = decrypt(user.ksef_token_encrypted);
        const ksefService = new KsefService(user.ksef_nip, decryptedToken, user.cert_storage_path);
        
        const invoiceHeaders = await ksefService.getInvoices(startDate);
        res.json(invoiceHeaders);

    } catch (error) {
        if (error instanceof KsefError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Błąd pobierania faktur z KSeF:', error);
        res.status(500).json({ message: 'Wewnętrzny błąd serwera podczas komunikacji z KSeF.' });
    }
});

/**
 * Endpoint: POST /api/ksef/import-invoice
 * Przeznaczenie: Importuje pojedynczą fakturę z KSeF do bazy danych.
 * Oczekuje w body: { "ksefReferenceNumber": "..." }
 */
app.post('/api/ksef/import-invoice', verifyToken, async (req, res) => {
    const { ksefReferenceNumber } = req.body;
    if (!ksefReferenceNumber) {
        return res.status(400).json({ message: 'Numer referencyjny KSeF jest wymagany.' });
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [userRows] = await connection.execute('SELECT ksef_nip, ksef_token_encrypted, cert_storage_path FROM users WHERE id = ?', [req.userId]);
        const user = userRows[0];

        if (!user || !user.ksef_nip || !user.ksef_token_encrypted || !user.cert_storage_path) {
            return res.status(400).json({ message: 'Niekompletne dane do połączenia z KSeF.' });
        }

        const decryptedToken = decrypt(user.ksef_token_encrypted);
        const ksefService = new KsefService(user.ksef_nip, decryptedToken, user.cert_storage_path);

        // Pobierz pełną fakturę i zmapuj ją na model bazy danych
        const fullInvoiceXml = await ksefService.getFullInvoice(ksefReferenceNumber);
        const { invoiceData, itemsData } = mapKsefFaVatToDbModel(fullInvoiceXml);

        // Zapisz fakturę i jej pozycje w transakcji
        await connection.beginTransaction();
        const invoiceSql = 'INSERT INTO invoices (user_id, invoice_number, issue_date, seller_nip, buyer_nip, total_net_amount, total_vat_amount, total_gross_amount, month_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [invoiceResult] = await connection.execute(invoiceSql, [
            req.userId, invoiceData.invoice_number, invoiceData.issue_date, invoiceData.seller_nip, 
            invoiceData.buyer_nip, invoiceData.total_net_amount, invoiceData.total_vat_amount, 
            invoiceData.total_gross_amount, invoiceData.month_year
        ]);
        const invoiceId = invoiceResult.insertId;

        if (itemsData && itemsData.length > 0) {
            const itemsSql = 'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_net, vat_rate, total_net_amount, total_vat_amount, total_gross_amount) VALUES ?';
            const itemsValues = itemsData.map(item => [
                invoiceId, item.description, item.quantity, item.unit_price_net, item.vat_rate, 
                item.total_net_amount, item.total_vat_amount, item.total_gross_amount
            ]);
            await connection.query(itemsSql, [itemsValues]);
        }

        await connection.commit();

        res.status(200).json({ message: 'Faktura została usunięta.' });
        res.status(201).json({ message: `Faktura ${invoiceData.invoice_number} została pomyślnie zaimportowana.` });

    } catch (error) {
        if (connection) await connection.rollback();
        if (error instanceof KsefError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Błąd importu faktury z KSeF:', error);
        res.status(500).json({ message: 'Wewnętrzny błąd serwera podczas importu faktury.' });
    } finally {
        if (connection) await connection.end();
    }
});

app.listen(PORT, () => {
    console.log(`Serwer backendu działa na porcie ${PORT}`);
});
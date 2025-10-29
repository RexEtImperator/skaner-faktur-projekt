require('dotenv').config();
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
const { KsefError } = require('./utils/ksefErrorMapper');

// Importy do przetwarzania faktur
const pdf = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const exceljs = require('exceljs');
const PDFDocument = require('pdfkit');
const mysqldump = require('mysqldump');
const { validatePolishNIP, normalizeAndValidateIBAN, detectSplitPaymentRequired } = require('./utils/validators');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('Brak wymaganego JWT_SECRET w zmiennych środowiskowych. Ustaw JWT_SECRET w pliku .env.');
    process.exit(1);
}

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
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'gcp-credentials.json';
    visionClient = new ImageAnnotatorClient({ keyFilename: keyFile });
} catch (e) {
    console.warn('Google Vision niedostępny. Ustaw GOOGLE_APPLICATION_CREDENTIALS w .env lub umieść gcp-credentials.json.');
}

// Middleware
app.use(cors());
app.use(express.json());

// Publiczny endpoint zdrowia serwera (bez autoryzacji)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

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
    // Pomocnicza normalizacja dat w formatach DD.MM.YYYY / DD-MM-YYYY / DD/MM/YYYY do YYYY-MM-DD
    const normalizeDateStr = (s) => {
        if (!s || typeof s !== 'string') return s;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return s;
    };

    const data = {
        items: [],
        totalNetAmount: null,
        totalVatAmount: null,
        totalGrossAmount: null,
        paymentMethod: null,
        paymentDate: null,
        trackingNumber: null,
        amountInWords: null,
        bankAccount: null,
        currency: null,
        sellerName: null,
        buyerName: null,
        dayMonthYear: null,
        mppRequired: false,
        vatBreakdown: []
    };

    // Wzorce do wyszukiwania kluczowych informacji (bardziej elastyczne warianty)
    const patterns = {
        invoiceNumber: /(?:Faktura(?:\s+VAT)?\s+nr|Numer\s+Faktury|Nr\s+faktury)\s*[:\s]*([\w\/\-.\_]+)/i,
        issueDate: /(?:Data\s+wystawienia|Data)\s*[:\s]*((?:\d{4}-\d{2}-\d{2})|(?:\d{2}[./-]\d{2}[./-]\d{4}))/i,
        sellerNIP: /NIP\s+sprzedawcy\s*[:\s]*(\d{10})/i,
        buyerNIP: /NIP\s+nabywcy\s*[:\s]*(\d{10})/i,
        totalGrossAmount: /(?:Razem\s+do\s+zapłaty|Do\s+zapłaty|Kwota\s+brutto|Suma\s+brutto)\s*[:\s]*([\d\s,.]+)\s*(PLN|EUR|USD|[A-Z]{3})?/i,
        paymentMethod: /Forma\s+płatności\s*[:\s]*([A-Za-z0-9\- ]+)/i,
        paymentDate: /(?:Termin\s+płatności|Termin)\s*[:\s]*((?:\d{4}-\d{2}-\d{2})|(?:\d{2}[./-]\d{2}[./-]\d{4}))/i,
        trackingNumber: /Nr\s+listy\s+przewozowej\s*[:\s]*([A-Za-z0-9\-]+)/i,
        amountInWords: /Słownie\s*[:\s]*(.+)/i,
        bankAccount: /Nr\s+rachunku\s*[:\s]*([A-Z]{2}[0-9A-Z ]{26,})/i,
        sellerName: /Sprzedawca\s*[:\s]*([\p{L}0-9\-., ]+)/iu,
        buyerName: /Nabywca\s*[:\s]*([\p{L}0-9\-., ]+)/iu
    };

    for (const [key, regex] of Object.entries(patterns)) {
        const match = text.match(regex);
        if (match && match[1]) {
            let value = match[1].trim();
            // Normalizacja dat na format YYYY-MM-DD
            if (key === 'issueDate' || key === 'paymentDate') {
                value = normalizeDateStr(value);
            }
            data[key] = value;
        }
        // Dla kwoty brutto wyciągnij walutę, jeśli pasuje
        if (key === 'totalGrossAmount' && match && match[2]) {
            data.currency = match[2];
        }
    }

    // Przetwarzanie kwoty brutto
    if (data.totalGrossAmount) {
        const grossStr = Array.isArray(data.totalGrossAmount) ? data.totalGrossAmount[0] : data.totalGrossAmount;
        const parsedGross = parseFloat(grossStr.replace(/\s/g, '').replace(',', '.'));
        data.totalGrossAmount = Number.isFinite(parsedGross) ? parsedGross : null;
    }
    // Fallback waluty
    if (!data.currency) {
        const currencyMatch = text.match(/\b(PLN|EUR|USD|[A-Z]{3})\b/);
        if (currencyMatch) data.currency = currencyMatch[1];
    }

    // Obliczanie day_month_year
    if (data.issueDate) {
        const date = new Date(data.issueDate);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = String(date.getFullYear());
        data.dayMonthYear = `${dd}/${mm}/${yyyy}`;
    }

    // Pozycje: opis, cena netto jedn., kwota VAT, kwota brutto, stawka VAT
    const itemRegex = /^(.+?)\s+(\d+[,.]\d{2})\s+(\d+[,.]\d{2})\s+(\d+[,.]\d{2})\s+([\d,.]+%?|zw\.)$/gm;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
        data.items.push({
            description: match[1].trim(),
            quantity: 1,
            unit: 'szt',
            catalog_number: null,
            unit_price_net: parseFloat(match[2].replace(',', '.')),
            total_net_amount: parseFloat(match[2].replace(',', '.')),
            vat_rate: match[5].trim(),
            total_vat_amount: parseFloat(match[3].replace(',', '.')),
            total_gross_amount: parseFloat(match[4].replace(',', '.'))
        });
    }

    // Sumowanie kwot z pozycji, jeśli zostały znalezione
    if (data.items.length > 0) {
        data.totalNetAmount = data.items.reduce((sum, item) => sum + item.total_net_amount, 0);
        data.totalVatAmount = data.items.reduce((sum, item) => sum + item.total_vat_amount, 0);
        data.totalGrossAmount = data.items.reduce((sum, item) => sum + item.total_gross_amount, 0);
        // Rozbicie VAT per stawka
        const acc = new Map();
        for (const it of data.items) {
            const key = (it.vat_rate || '').toString();
            if (!acc.has(key)) acc.set(key, { net: 0, vat: 0, gross: 0 });
            const a = acc.get(key);
            a.net += Number(it.total_net_amount || 0);
            a.vat += Number(it.total_vat_amount || 0);
            a.gross += Number(it.total_gross_amount || 0);
        }
        data.vatBreakdown = Array.from(acc.entries()).map(([rate, amounts]) => ({
            vat_rate: rate,
            net_amount: amounts.net,
            vat_amount: amounts.vat,
            gross_amount: amounts.gross
        }));
    }

    // Walidacja NIP
    if (data.sellerNIP && !validatePolishNIP(data.sellerNIP)) data.sellerNIP = null;
    if (data.buyerNIP && !validatePolishNIP(data.buyerNIP)) data.buyerNIP = null;

    // Walidacja IBAN
    if (data.bankAccount) {
        const iban = normalizeAndValidateIBAN(data.bankAccount);
        data.bankAccount = iban || null;
    }

    // Detekcja MPP
    data.mppRequired = detectSplitPaymentRequired(data.totalGrossAmount, text);

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

// Dodawanie nowej kategorii
app.post('/api/categories', verifyToken, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Nazwa kategorii jest wymagana.' });
    }
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute('INSERT INTO categories (user_id, name) VALUES (?, ?)', [req.userId, name.trim()]);
        await connection.end();
        res.status(201).json({ id: result.insertId, name: name.trim() });
    } catch (error) {
        console.error('Błąd dodawania kategorii:', error);
        res.status(500).json({ message: 'Błąd serwera podczas dodawania kategorii.' });
    }
});

// Usuwanie kategorii
app.delete('/api/categories/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute('DELETE FROM categories WHERE id = ? AND user_id = ?', [id, req.userId]);
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Kategoria nie została znaleziona.' });
        }
        res.json({ message: 'Kategoria usunięta.' });
    } catch (error) {
        console.error('Błąd usuwania kategorii:', error);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania kategorii.' });
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

        // Nadpisania z formularza (opcjonalnie)
        const overrides = {
            invoiceNumber: req.body.invoice_number,
            issueDate: req.body.issue_date,
            deliveryDate: req.body.delivery_date,
            sellerNIP: req.body.seller_nip,
            buyerNIP: req.body.buyer_nip,
            sellerName: req.body.seller_name,
            buyerName: req.body.buyer_name,
            totalNetAmount: req.body.total_net_amount,
            totalVatAmount: req.body.total_vat_amount,
            totalGrossAmount: req.body.total_gross_amount,
            currency: req.body.currency,
            paymentMethod: req.body.payment_method,
            bankAccount: req.body.bank_account,
            paymentDate: req.body.payment_date
        };
        Object.entries(overrides).forEach(([key, val]) => {
            if (typeof val !== 'undefined' && val !== null && val !== '') {
                invoiceData[key] = val;
            }
        });

        // Tryb podglądu: zwróć wykryte dane i surowy tekst bez zapisu
        if (req.body.preview === 'true') {
            await connection.end();
            return res.status(200).json({ preview: true, data: invoiceData, rawText: (text || '').split(/\r?\n/) });
        }
        const isFallback = (!invoiceData.invoiceNumber || !invoiceData.totalGrossAmount);
        if (isFallback) {
            // Zapisz fakturę w trybie fallback: minimalne dane, oznacz jako do przeglądu
            invoiceData.invoiceNumber = invoiceData.invoiceNumber || `NIEZNANY-${Date.now()}`;
            // issueDate może pozostać null, aby nie wprowadzać fałszywej daty
            // totalGrossAmount pozostaje null, jeśli nie udało się wyliczyć, pozycje mogą uzupełnić kwoty
        }

        // Rozpocznij transakcję
        await connection.beginTransaction();

        const invoiceSql = 'INSERT INTO invoices (user_id, invoice_number, issue_date, delivery_date, seller_nip, buyer_nip, seller_name, buyer_name, total_net_amount, total_vat_amount, total_gross_amount, currency, day_month_year, payment_method, bank_account, payment_date, payment_status, payment_due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [invoiceResult] = await connection.execute(invoiceSql, [
            req.userId,
            invoiceData.invoiceNumber,
            invoiceData.issueDate,
            null,
            invoiceData.sellerNIP || null,
            invoiceData.buyerNIP || null,
            invoiceData.sellerName || null,
            invoiceData.buyerName || null,
            invoiceData.totalNetAmount || null,
            invoiceData.totalVatAmount || null,
            invoiceData.totalGrossAmount || null,
            invoiceData.currency || 'PLN',
            invoiceData.dayMonthYear || null,
            invoiceData.paymentMethod || null,
            invoiceData.bankAccount || null,
            invoiceData.paymentDate || null,
            // Pola z formularza uploadu (multipart): req.body
            (isFallback ? 'do_review' : (req.body.payment_status || null)),
            req.body.payment_due_date || null,
            req.body.notes || null
        ]);
        const invoiceId = invoiceResult.insertId;

        // Zapisz pozycje faktury
        if (invoiceData.items && invoiceData.items.length > 0) {
            const itemsSql = 'INSERT INTO invoice_items (invoice_id, description, quantity, unit, catalog_number, unit_price_net, vat_rate, total_net_amount, total_vat_amount, total_gross_amount) VALUES ?';
            const itemsValues = invoiceData.items.map(item => [
                invoiceId,
                item.description,
                item.quantity || 1,
                item.unit || null,
                item.catalog_number || null,
                item.unit_price_net,
                item.vat_rate,
                item.total_net_amount,
                item.total_vat_amount,
                item.total_gross_amount
            ]);
            await connection.query(itemsSql, [itemsValues]);

            // Zapis rozbicia VAT per stawka
            if (invoiceData.vatBreakdown && invoiceData.vatBreakdown.length > 0) {
                const vatSql = 'INSERT INTO invoice_vat_breakdown (invoice_id, vat_rate, net_amount, vat_amount, gross_amount) VALUES ?';
                const vatValues = invoiceData.vatBreakdown.map(v => [
                    invoiceId,
                    v.vat_rate,
                    v.net_amount,
                    v.vat_amount,
                    v.gross_amount
                ]);
                await connection.query(vatSql, [vatValues]);
            }
        }

        // Zatwierdź transakcję
        await connection.commit();
        await connection.end();

        if (isFallback) {
            res.status(201).json({ message: 'Faktura zapisana do weryfikacji (niepełne dane).', fallback: true, data: invoiceData });
        } else {
            res.status(201).json({ message: 'Faktura przetworzona i zapisana!', data: invoiceData });
        }
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

        // Obliczanie statusu "po terminie" pozostaje po stronie frontend.

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

            // Pobierz rozbicie VAT dla tych faktur
            const [vatRows] = await connection.query('SELECT * FROM invoice_vat_breakdown WHERE invoice_id IN (?)', [invoiceIds]);
            const vatByInvoiceId = vatRows.reduce((acc, row) => {
                if (!acc[row.invoice_id]) acc[row.invoice_id] = [];
                acc[row.invoice_id].push(row);
                return acc;
            }, {});

            invoices.forEach(invoice => {
                invoice.items = itemsByInvoiceId[invoice.id] || [];
                invoice.vat_breakdown = vatByInvoiceId[invoice.id] || [];
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
        delivery_date,
        seller_nip,
        buyer_nip,
        seller_name,
        buyer_name,
        total_net_amount,
        total_vat_amount,
        total_gross_amount,
        currency,
        payment_method,
        bank_account,
        payment_date
    } = req.body;

    // Prosta walidacja
    if (!invoice_number || !issue_date || !total_gross_amount) {
        return res.status(400).json({ message: 'Brak wymaganych danych (numer faktury, data, kwota brutto).' });
    }

    // Obliczanie day_month_year na podstawie nowej daty
    const date = new Date(issue_date);
    const day_month_year = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

    try {
        const connection = await mysql.createConnection(dbConfig);
        const sql = `
            UPDATE invoices 
            SET invoice_number = ?, issue_date = ?, delivery_date = ?, seller_nip = ?, buyer_nip = ?,
                seller_name = ?, buyer_name = ?, total_net_amount = ?, total_vat_amount = ?, total_gross_amount = ?,
                currency = ?, day_month_year = ?, payment_method = ?, bank_account = ?, payment_date = ?,
                payment_status = ?, payment_due_date = ?
            WHERE id = ? AND user_id = ?
        `;
        const [result] = await connection.execute(sql, [
            invoice_number,
            issue_date,
            delivery_date || null,
            seller_nip || null,
            buyer_nip || null,
            seller_name || null,
            buyer_name || null,
            total_net_amount || null,
            total_vat_amount || null,
            total_gross_amount || null,
            currency || 'PLN',
            day_month_year,
            payment_method || null,
            bank_account || null,
            payment_date || null,
            req.body.payment_status || null,
            req.body.payment_due_date || null,
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
                i.buyer_nip LIKE ? OR 
                i.seller_name LIKE ? OR 
                i.buyer_name LIKE ? OR 
                i.currency LIKE ? OR 
                i.payment_method LIKE ? OR 
                i.bank_account LIKE ?
            )
            ORDER BY issue_date DESC
        `;
        const [rows] = await connection.execute(sql, [
            req.userId,
            searchQuery,
            searchQuery,
            searchQuery,
            searchQuery,
            searchQuery,
            searchQuery,
            searchQuery,
            searchQuery
        ]);
        await connection.end();
        res.json(rows);
    } catch (error) {
        console.error('Błąd wyszukiwania:', error);
        res.status(500).json({ message: 'Błąd serwera podczas wyszukiwania.' });
    }
});

/**
 * Endpoint: GET /api/export
 * Przeznaczenie: Eksportuje faktury z danego dnia/miesiąca/roku do pliku Excel (.xlsx).
 * Parametry zapytania (query):
 *  - dayMonthYear (string, wymagany): Data w formacie "DD/MM/YYYY", np. "25/10/2025".
 * Zabezpieczenia: Wymaga ważnego tokenu JWT.
 */
app.get('/api/export', verifyToken, async (req, res) => {
    const { dayMonthYear } = req.query;
    let connection;

    // Krok 1: Walidacja danych wejściowych.
    if (!dayMonthYear || !/^\d{2}\/\d{2}\/\d{4}$/.test(dayMonthYear)) {
        return res.status(400).json({ message: 'Należy podać prawidłową datę w formacie DD/MM/YYYY.' });
    }

    try {
        // Krok 2: Połączenie z bazą danych i pobranie odpowiednich danych.
        connection = await mysql.createConnection(dbConfig);
        const sql = `
            SELECT i.invoice_number, i.issue_date, i.delivery_date, i.seller_nip, i.buyer_nip, i.seller_name, i.buyer_name, i.currency, i.payment_method, i.bank_account, i.total_net_amount, i.total_vat_amount, i.total_gross_amount, c.name AS category_name
            FROM invoices i
            LEFT JOIN categories c ON i.category_id = c.id
            WHERE i.user_id = ? AND i.day_month_year = ?
            ORDER BY i.issue_date ASC
        `;
        const [rows] = await connection.execute(sql, [req.userId, dayMonthYear]);
        
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
        descriptionSheet.addRow({ name: 'delivery_date', desc: 'Data dostawy/wykonania usługi.' });
        descriptionSheet.addRow({ name: 'seller_nip', desc: 'Numer Identyfikacji Podatkowej (NIP) sprzedawcy.' });
        descriptionSheet.addRow({ name: 'buyer_nip', desc: 'Numer Identyfikacji Podatkowej (NIP) nabywcy.' });
        descriptionSheet.addRow({ name: 'seller_name', desc: 'Nazwa sprzedawcy.' });
        descriptionSheet.addRow({ name: 'buyer_name', desc: 'Nazwa nabywcy.' });
        descriptionSheet.addRow({ name: 'currency', desc: 'Waluta faktury (np. PLN, EUR).' });
        descriptionSheet.addRow({ name: 'payment_method', desc: 'Forma płatności z faktury.' });
        descriptionSheet.addRow({ name: 'bank_account', desc: 'Numer rachunku bankowego (IBAN).' });
        descriptionSheet.addRow({ name: 'total_net_amount', desc: 'Suma netto faktury.' });
        descriptionSheet.addRow({ name: 'total_vat_amount', desc: 'Suma VAT faktury.' });
        descriptionSheet.addRow({ name: 'total_gross_amount', desc: 'Suma brutto faktury.' });
        descriptionSheet.addRow({ name: 'category_name', desc: 'Kategoria wydatku przypisana w systemie.' });
        
        // --- Arkusz 2: Dane Faktur ---
        const worksheet = workbook.addWorksheet(`Faktury ${dayMonthYear.replace(/\//g, '-')}`);
        worksheet.columns = [
            { header: 'Numer Faktury', key: 'invoice_number', width: 30 },
            { header: 'Data Wystawienia', key: 'issue_date', width: 18, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'Data Dostawy', key: 'delivery_date', width: 18, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'NIP Sprzedawcy', key: 'seller_nip', width: 20 },
            { header: 'NIP Nabywcy', key: 'buyer_nip', width: 20 },
            { header: 'Sprzedawca', key: 'seller_name', width: 25 },
            { header: 'Nabywca', key: 'buyer_name', width: 25 },
            { header: 'Kategoria', key: 'category_name', width: 25 },
            { header: 'Waluta', key: 'currency', width: 10 },
            { header: 'Forma płatności', key: 'payment_method', width: 20 },
            { header: 'Rachunek', key: 'bank_account', width: 30 },
            { header: 'Suma Netto', key: 'total_net_amount', width: 18, style: { numFmt: '#,##0.00' } },
            { header: 'Suma VAT', key: 'total_vat_amount', width: 18, style: { numFmt: '#,##0.00' } },
            { header: 'Suma Brutto', key: 'total_gross_amount', width: 18, style: { numFmt: '#,##0.00' } }
        ];

        // Pogrubienie nagłówków
        worksheet.getRow(1).font = { bold: true };
        
        // Dodaj dane do arkusza
        rows.forEach(invoice => {
            worksheet.addRow({
                ...invoice,
                total_net_amount: invoice.total_net_amount ? parseFloat(invoice.total_net_amount) : null,
                total_vat_amount: invoice.total_vat_amount ? parseFloat(invoice.total_vat_amount) : null,
                total_gross_amount: invoice.total_gross_amount ? parseFloat(invoice.total_gross_amount) : null
            });
        });

        // Krok 4: Ustawienie nagłówków HTTP, aby przeglądarka zainicjowała pobieranie pliku.
        const fileName = `faktury-${dayMonthYear.replace(/\//g, '-')}.xlsx`;
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
    // Obsługa nowego parametru dayMonthYear (DD/MM/YYYY) z zachowaniem wstecznej kompatybilności
    const dayMonthYear = req.query.dayMonthYear || req.query.monthYear;
    if (!dayMonthYear) {
        return res.status(400).send('Należy podać datę w formacie DD/MM/YYYY.');
    }

    try {
        const connection = await mysql.createConnection(dbConfig);
        const invoicesSql = `
            SELECT i.*, c.name as category_name 
            FROM invoices i 
            LEFT JOIN categories c ON i.category_id = c.id 
            WHERE i.user_id = ? AND i.day_month_year = ? 
            ORDER BY issue_date ASC
        `;
        const [rows] = await connection.execute(invoicesSql, [req.userId, dayMonthYear]);

        // Suma brutto z faktur
        const totalGross = rows.reduce((sum, inv) => sum + (parseFloat(inv.total_gross_amount) || 0), 0);

        // Zbiorcze podsumowanie VAT po stawkach (z tabeli breakdown)
        const breakdownSql = `
            SELECT b.vat_rate, SUM(b.net_amount) AS sum_net, SUM(b.vat_amount) AS sum_vat
            FROM invoice_vat_breakdown b
            JOIN invoices i ON i.id = b.invoice_id
            WHERE i.user_id = ? AND i.day_month_year = ?
            GROUP BY b.vat_rate
            ORDER BY b.vat_rate ASC
        `;
        const [vatBreakdownRows] = await connection.execute(breakdownSql, [req.userId, dayMonthYear]);

        const totalNet = vatBreakdownRows.reduce((s, r) => s + (parseFloat(r.sum_net) || 0), 0);
        const totalVat = vatBreakdownRows.reduce((s, r) => s + (parseFloat(r.sum_vat) || 0), 0);

        await connection.end();

        // Ustawienia nagłówków do pobrania pliku
        const fileName = `raport-faktur-${dayMonthYear.replace(/\//g, '-')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res);

        // Tworzenie treści PDF
        doc.fontSize(18).text(`Raport faktur za ${dayMonthYear}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Podsumowanie:`);
        doc.fontSize(12).text(`- Liczba faktur: ${rows.length}`);
        doc.fontSize(12).text(`- Łączna kwota brutto: ${totalGross.toFixed(2)} zł`);
        doc.fontSize(12).text(`- Łączna kwota netto: ${totalNet.toFixed(2)} zł`);
        doc.fontSize(12).text(`- Łączny VAT: ${totalVat.toFixed(2)} zł`);

        if (vatBreakdownRows.length) {
            doc.fontSize(12).text(`Rozbicie VAT wg stawek:`);
            vatBreakdownRows.forEach(row => {
                doc.fontSize(11).text(`  • VAT ${row.vat_rate}%: netto ${parseFloat(row.sum_net).toFixed(2)} zł, VAT ${parseFloat(row.sum_vat).toFixed(2)} zł`);
            });
        }

        doc.moveDown(2);
        
        // Nagłówki tabeli (rozszerzone kolumny)
        const tableTop = 250;
        const itemX = 50;
        const dateX = 120;
        const sellerX = 200;
        const buyerX = 320;
        const categoryX = 440;
        const currencyX = 500;
        const amountX = 540;

        doc.fontSize(10)
           .text('Nr faktury', itemX, tableTop)
           .text('Data', dateX, tableTop)
           .text('Sprzedawca', sellerX, tableTop)
           .text('Nabywca', buyerX, tableTop)
           .text('Kategoria', categoryX, tableTop)
           .text('Waluta', currencyX, tableTop)
           .text('Brutto', amountX, tableTop, { align: 'right' });

        // Linia pod nagłówkami
        doc.moveTo(itemX, tableTop + 15).lineTo(amountX + 60, tableTop + 15).stroke();
        
        let currentY = tableTop + 25;
        const drawHeaderRow = () => {
            doc.fontSize(10)
               .text('Nr faktury', itemX, currentY)
               .text('Data', dateX, currentY)
               .text('Sprzedawca', sellerX, currentY)
               .text('Nabywca', buyerX, currentY)
               .text('Kategoria', categoryX, currentY)
               .text('Waluta', currencyX, currentY)
               .text('Brutto', amountX, currentY, { align: 'right' });
            doc.moveTo(itemX, currentY + 15).lineTo(amountX + 60, currentY + 15).stroke();
            currentY += 25;
        };

        const maxY = doc.page.height - doc.page.margins.bottom - 20;
        rows.forEach(inv => {
            doc.fontSize(9)
               .text(inv.invoice_number || '-', itemX, currentY)
               .text(inv.issue_date ? new Date(inv.issue_date).toLocaleDateString('pl-PL') : '-', dateX, currentY)
               .text(inv.seller_name || '-', sellerX, currentY)
               .text(inv.buyer_name || '-', buyerX, currentY)
               .text(inv.category_name || 'Brak', categoryX, currentY)
               .text(inv.currency || 'PLN', currencyX, currentY)
               .text(`${(parseFloat(inv.total_gross_amount) || 0).toFixed(2)} zł`, amountX, currentY, { align: 'right' });
            currentY += 20;

            if (currentY > maxY) {
                doc.addPage();
                currentY = 50;
                drawHeaderRow();
            }
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
                schema: { tables: ['users', 'categories', 'invoices', 'invoice_items'] }, // Definiujemy, co ma być w backupie
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
        const invoiceSql = 'INSERT INTO invoices (user_id, invoice_number, issue_date, delivery_date, seller_nip, buyer_nip, seller_name, buyer_name, total_net_amount, total_vat_amount, total_gross_amount, currency, day_month_year, payment_status, payment_due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [invoiceResult] = await connection.execute(invoiceSql, [
            req.userId,
            invoiceData.invoice_number,
            invoiceData.issue_date,
            invoiceData.delivery_date || null,
            invoiceData.seller_nip,
            invoiceData.buyer_nip,
            invoiceData.seller_name || null,
            invoiceData.buyer_name || null,
            invoiceData.total_net_amount,
            invoiceData.total_vat_amount,
            invoiceData.total_gross_amount,
            invoiceData.currency || 'PLN',
            invoiceData.day_month_year,
            'niezapłacona',
            null
        ]);
        const invoiceId = invoiceResult.insertId;

        if (itemsData && itemsData.length > 0) {
            const itemsSql = 'INSERT INTO invoice_items (invoice_id, description, quantity, unit, catalog_number, unit_price_net, vat_rate, total_net_amount, total_vat_amount, total_gross_amount) VALUES ?';
            const itemsValues = itemsData.map(item => [
                invoiceId,
                item.description,
                item.quantity,
                item.unit || null,
                item.catalog_number || null,
                item.unit_price_net,
                item.vat_rate,
                item.total_net_amount,
                item.total_vat_amount,
                item.total_gross_amount
            ]);
            await connection.query(itemsSql, [itemsValues]);

            // Dodaj rozbicie VAT per stawka na podstawie pozycji
            const breakdownMap = new Map();
            for (const it of itemsData) {
                const rateKey = (it.vat_rate || '').toString();
                if (!breakdownMap.has(rateKey)) {
                    breakdownMap.set(rateKey, { net: 0, vat: 0, gross: 0 });
                }
                const agg = breakdownMap.get(rateKey);
                agg.net += Number(it.total_net_amount || 0);
                agg.vat += Number(it.total_vat_amount || 0);
                agg.gross += Number(it.total_gross_amount || 0);
            }
            if (breakdownMap.size > 0) {
                const vatSql = 'INSERT INTO invoice_vat_breakdown (invoice_id, vat_rate, net_amount, vat_amount, gross_amount) VALUES ?';
                const vatValues = Array.from(breakdownMap.entries()).map(([rate, amounts]) => [
                    invoiceId,
                    rate,
                    amounts.net,
                    amounts.vat,
                    amounts.gross
                ]);
                await connection.query(vatSql, [vatValues]);
            }
        }

        await connection.commit();
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
// Utworzenie faktury przez API (manualne dodanie)
app.post('/api/invoices', verifyToken, async (req, res) => {
    const {
        invoice_number,
        issue_date,
        delivery_date,
        seller_nip,
        buyer_nip,
        seller_name,
        buyer_name,
        total_net_amount,
        total_vat_amount,
        total_gross_amount,
        currency,
        payment_method,
        bank_account,
        payment_date,
        payment_status,
        payment_due_date
    } = req.body;

    if (!invoice_number || !issue_date || !total_gross_amount) {
        return res.status(400).json({ message: 'Brak wymaganych danych (numer faktury, data, kwota brutto).' });
    }

    const date = new Date(issue_date);
    const day_month_year = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

    try {
        const connection = await mysql.createConnection(dbConfig);
        const sql = `
            INSERT INTO invoices (
                user_id, invoice_number, issue_date, delivery_date, seller_nip, buyer_nip, seller_name, buyer_name,
                total_net_amount, total_vat_amount, total_gross_amount, currency, day_month_year, payment_method,
                bank_account, payment_date, payment_status, payment_due_date, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await connection.execute(sql, [
            req.userId,
            invoice_number,
            issue_date,
            delivery_date || null,
            seller_nip || null,
            buyer_nip || null,
            seller_name || null,
            buyer_name || null,
            total_net_amount || null,
            total_vat_amount || null,
            total_gross_amount,
            currency || 'PLN',
            day_month_year,
            payment_method || null,
            bank_account || null,
            payment_date || null,
            payment_status || null,
            payment_due_date || null,
            req.body.notes || null
        ]);
        await connection.end();
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.error('Błąd tworzenia faktury:', err);
        res.status(500).json({ message: 'Błąd serwera podczas tworzenia faktury.' });
    }
});
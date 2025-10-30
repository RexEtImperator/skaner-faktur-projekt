require('dotenv').config();
const mysql = require('mysql2/promise');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { decrypt } = require('./utils/crypto');

// UWAGA: Konfiguracja DB i inne wrażliwe dane powinny pochodzić ze zmiennych środowiskowych
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'admin',
    database: process.env.DB_NAME || 'invoice_parser'
};

// Symulacja funkcji, które byłyby w server.js
const pdf = require('pdf-parse');
const Tesseract = require('tesseract.js');
function parseText(text) { /* ... skopiuj funkcję parseText z server.js ... */ }

async function processInvoiceAttachment(attachment, userId, connection) {
    console.log(`[UserID: ${userId}] Przetwarzanie załącznika: ${attachment.filename}`);
    // TODO: Tutaj powinna być pełna logika z endpointu /upload:
    // 1. Rozpoznanie typu pliku
    // 2. OCR dla obrazów / parsowanie dla PDF
    // 3. Wywołanie parseText()
    // 4. Zapisanie danych do tabeli 'invoices' z odpowiednim userId
    console.log(`[UserID: ${userId}] TODO: Zaimplementować zapis faktury do bazy danych.`);
}

async function checkUserMailbox(user) {
    if (!user.imap_settings) return;
    const settings = JSON.parse(user.imap_settings);
    if (!settings.host || !settings.user || !settings.password) return;

    const password = decrypt(settings.password);
    if (!password) {
        console.error(`[UserID: ${user.id}] Nie udało się odszyfrować hasła IMAP.`);
        return;
    }

    const client = new ImapFlow({
        host: settings.host,
        port: 993,
        secure: true,
        auth: { user: settings.user, pass: password },
        logger: false // Włącz dla debugowania
    });

    try {
        await client.connect();
        console.log(`[UserID: ${user.id}] Połączono z IMAP.`);
        
        let lock = await client.getMailboxLock('INBOX');
        try {
            // Szukaj nieprzeczytanych maili z załącznikami
            const messages = client.fetch({ seen: false, has: 'attachment' }, { envelope: true, bodyStructure: true });
            for await (let msg of messages) {
                for (let part of msg.bodyStructure.childNodes) {
                    if (part.disposition === 'attachment' && part.dispositionParameters.filename) {
                        const { content } = await client.download(msg.uid, part.part);
                        await processAttachment(content, part.dispositionParameters.filename, user, connection);
                    }
                }
                // Oznacz wiadomość jako przeczytaną, aby nie przetwarzać jej ponownie
                await client.messageFlagsAdd(msg.uid, ['\\Seen']);
            }
        } finally {
            await lock.release();
        }
    } catch (err) {
        console.error(`[UserID: ${user.id}] Błąd IMAP:`, err);
    } finally {
        await client.logout();
    }
}

async function main() {
    console.log('Uruchamianie workera IMAP...');
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [users] = await connection.execute('SELECT id, imap_settings FROM users');
        for (const user of users.filter(u => u.imap_settings)) {
            await checkUserMailbox(user, connection);
        }
    } catch (error) {
        console.error('Główny błąd workera:', error);
    } finally {
        await connection.end();
        console.log('Zakończono cykl workera IMAP.');
    }
}

// Uruchom co 5 minut
setInterval(main, 5 * 60 * 1000);
main(); // Uruchom od razu przy starcie
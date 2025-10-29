const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

// W produkcji, ten klucz MUSI być ustawiony jako zmienna środowiskowa!
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'sx8hV6iAvSj8jo3U5AOjAjJMaQDzFaXPdAVGvPo23SdsYRbODn0Wf5wDFGHj0+k99GY25YpJSfhg5ElxMX7ANQ==';
if (!process.env.ENCRYPTION_KEY) {
    console.warn('UWAGA: Brak ENCRYPTION_KEY w .env. Używany jest słaby klucz domyślny — ustaw ENCRYPTION_KEY w środowisku.');
}

const getKey = (salt) => {
    return crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, PBKDF2_ITERATIONS, 32, 'sha512');
};

exports.encrypt = (text) => {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = getKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([salt, iv, tag, encrypted]).toString('hex');
};

exports.decrypt = (encryptedHex) => {
    try {
        const encryptedData = Buffer.from(encryptedHex, 'hex');
        const salt = encryptedData.slice(0, SALT_LENGTH);
        const iv = encryptedData.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const tag = encryptedData.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const encrypted = encryptedData.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        
        const key = getKey(salt);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        
        return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
    } catch (error) {
        console.error("Błąd deszyfrowania:", error.message);
        return null;
    }
};
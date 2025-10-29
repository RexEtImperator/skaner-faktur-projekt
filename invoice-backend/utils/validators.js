// Walidacja polskiego NIP (algorytm modulo-11)
function validatePolishNIP(nip) {
  if (!nip) return false;
  const digits = nip.replace(/\D/g, '');
  if (digits.length !== 10) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * parseInt(digits[i], 10), 0);
  const control = sum % 11;
  return control === parseInt(digits[9], 10);
}

// Walidacja IBAN (ogólna, w tym PL). Zwraca znormalizowany IBAN lub null.
function normalizeAndValidateIBAN(iban) {
  if (!iban) return null;
  const normalized = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^([A-Z]{2}\d{2})([A-Z0-9]+)$/.test(normalized)) return null;
  // Konwersja do postaci do mod97
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString());
  // Oblicz mod97 w kawałkach, by uniknąć dużych liczb
  let remainder = 0;
  for (const char of numeric) {
    remainder = (remainder * 10 + parseInt(char, 10)) % 97;
  }
  return remainder === 1 ? normalized : null;
}

// Wykrywanie mechanizmu podzielonej płatności (MPP)
function detectSplitPaymentRequired(text, totalGrossAmount) {
  const hasMPPClause = /mechanizm podzielonej płatności/i.test(text || '');
  const overThreshold = (parseFloat(totalGrossAmount) || 0) >= 15000;
  return hasMPPClause || overThreshold;
}

module.exports = {
  validatePolishNIP,
  normalizeAndValidateIBAN,
  detectSplitPaymentRequired,
};
# Changelog

Wszystkie istotne zmiany w projekcie są dokumentowane w tym pliku.

## 2025-10-29

### Dodane
- Kolumny `payment_status` i `payment_due_date` w tabeli `invoices` (SQL).
- Obsługa pól płatności w `POST /api/upload` oraz `POST /api/invoices`.
- Edycja `payment_status` (select) i `payment_due_date` (pole daty) w `InvoiceTable`.
- Walidacja frontend: przy `payment_status = zapłacona` termin płatności nie może być w przeszłości.
- Frontendowa kalkulacja statusu „po terminie” z użyciem `payment_due_date`.
- Kolumna „Termin płatności” w widoku tabeli (tryb tylko‑do‑odczytu).
- Migracje w `setup-mysql.sql` (ALTER TABLE z `IF NOT EXISTS`).

### Zmienione
- `PUT /api/invoices/:id` rozszerzony o aktualizację `payment_status` i `payment_due_date`.
- `POST /api/ksef/import-invoice` zapisuje `payment_status` i `payment_due_date`.

### Usunięte
- Normalizacja „po terminie” po stronie backend w `GET /api/invoices` (logika przeniesiona na frontend).
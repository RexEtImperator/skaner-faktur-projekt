import React, { useState, useEffect } from 'react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import api from '../../api/axiosConfig';
import KsefCertificateManager from './KsefCertificateManager';

/**
 * Komponent do kompleksowego zarządzania integracją z KSeF.
 * Obejmuje konfigurację, testowanie połączenia, pobieranie listy faktur i ich import.
 */
const KsefManager = () => {
    // Stan do przechowywania ustawień (NIP, token)
    const [settings, setSettings] = useState({ ksef_nip: '', ksef_token: '' });
    // Stan do przechowywania listy faktur pobranych z KSeF
    const [ksefInvoices, setKsefInvoices] = useState([]);
    // Stan do zarządzania datą początkową dla pobierania faktur
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    // Stan do wyświetlania komunikatów o statusie operacji
    const [status, setStatus] = useState({ message: '', type: '' });
    const [isLoading, setIsLoading] = useState(false);

    // Efekt do pobrania aktualnych ustawień przy pierwszym renderowaniu komponentu
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await api.get('/settings');
                // Ustawiamy puste stringi, jeśli dane z backendu są null
                setSettings({
                    ksef_nip: response.data.ksef_nip || '',
                    ksef_token: response.data.ksef_token_encrypted ? '********' : '' // Pokazujemy placeholder, jeśli token jest zapisany
                });
            } catch (error) {
                setStatus({ message: 'Nie udało się załadować ustawień KSeF.', type: 'error' });
            }
        };
        fetchSettings();
    }, []);

    /**
     * Obsługuje zmiany w polach formularza ustawień.
     */
    const handleSettingsChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    /**
     * Zapisuje ustawienia NIP i tokenu na serwerze.
     */
    const handleSaveSettings = async () => {
        setStatus({ message: 'Zapisywanie ustawień...', type: 'info' });
        try {
            // Wysyłamy tylko te pola, które dotyczą KSeF
            const response = await api.put('/settings', {
                ksef_nip: settings.ksef_nip,
                ksef_token: settings.ksef_token
            });
            setStatus({ message: response.data.message, type: 'success' });
            // Zaktualizuj placeholder po zapisaniu
            if (settings.ksef_token && settings.ksef_token !== '********') {
                setSettings(prev => ({ ...prev, ksef_token: '********' }));
            }
        } catch (error) {
            setStatus({ message: error.response?.data?.message || 'Błąd zapisu ustawień.', type: 'error' });
        }
    };

    /**
     * Testuje połączenie z KSeF, próbując zainicjować sesję.
     */
    const handleTestConnection = async () => {
        setStatus({ message: 'Testowanie połączenia z KSeF...', type: 'info' });
        try {
            const response = await api.post('/ksef/test-session');
            setStatus({ message: response.data.message, type: 'success' });
        } catch (error) {
            setStatus({ message: error.response?.data?.message || 'Test nieudany. Sprawdź konsolę przeglądarki.', type: 'error' });
        }
    };

    /**
     * Pobiera listę nagłówków faktur z KSeF od podanej daty.
     */
    const handleFetchInvoices = async () => {
        setIsLoading(true);
        setStatus({ message: 'Pobieranie listy faktur z KSeF...', type: 'info' });
        setKsefInvoices([]); // Wyczyść poprzednie wyniki
        try {
            const response = await api.post('/api/ksef/invoices', { startDate });
            const invoices = response.data.InvoiceHeaderList[0].invoiceHeader.map(inv => ({
                ksefReferenceNumber: inv.ksefReferenceNumber[0]._text,
                invoiceNumber: inv.invoiceNumber[0]._text,
                sellerName: inv.subjectBy[0].fullName[0]._text,
                grossAmount: inv.netAmount[0]._text, // Uproszczenie, KSeF nie podaje brutto w nagłówku
            }));
            setKsefInvoices(invoices);
            setStatus({ message: `Pobrano ${invoices.length} faktur.`, type: 'success' });
        } catch (error) {
            setStatus({ message: error.response?.data?.message || 'Nie udało się pobrać faktur.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleImportInvoice = async (ksefReferenceNumber) => {
        setIsLoading(true);
        setStatus({ message: `Importowanie faktury ${ksefReferenceNumber}...`, type: 'info' });
        try {
            const response = await api.post('/api/ksef/import-invoice', { ksefReferenceNumber });
            setStatus({ message: response.data.message, type: 'success' });
            // Można dodać odświeżenie głównej listy faktur po imporcie
            // onDataChange(); 
        } catch (error) {
            setStatus({ message: error.response?.data?.message || 'Import nie powiódł się.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="mt-6">
            <h2>Zarządzanie Integracją z KSeF</h2>
            <p>Skonfiguruj połączenie z Krajowym Systemem e-Faktur, aby automatycznie pobierać i importować faktury zakupu.</p>

            <KsefCertificateManager />
            <hr />

            <div className="tool-item">
                <h4>Krok 2: Ustawienia Połączenia</h4>
                <label htmlFor="ksef_nip">Twój NIP</label>
                <input type="text" id="ksef_nip" name="ksef_nip" value={settings.ksef_nip} onChange={handleSettingsChange} className="rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                
                <label htmlFor="ksef_token">Token Autoryzacyjny KSeF</label>
                <input type="password" id="ksef_token" name="ksef_token" value={settings.ksef_token} onChange={handleSettingsChange} className="rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <Button onClick={handleSaveSettings} variant="primary" className="mt-2">Zapisz Ustawienia</Button>
            </div>
            <hr />

            <div className="tool-item">
                <h4>Krok 3: Test Połączenia</h4>
                <p>Sprawdź, czy Twoje certyfikaty i token pozwalają na pomyślne zainicjowanie sesji z KSeF.</p>
                <Button onClick={handleTestConnection} variant="secondary">Testuj Połączenie</Button>
            </div>
            <hr />
            
            <div className="tool-item">
                <h4>Krok 4: Pobieranie i Import Faktur</h4>
                <label htmlFor="startDate">Pobierz faktury od dnia:</label>
                <input type="date" id="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <Button onClick={handleFetchInvoices} variant="primary" className="mt-2">Pobierz listę faktur z KSeF</Button>
            </div>

            {isLoading && <p>Przetwarzanie...</p>}
            {status.message && (
                <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                    status.type === 'error'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : status.type === 'success'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-accent-200 bg-accent-50 text-accent-700'
                }`}>
                    {status.message}
                </div>
            )}

            {ksefInvoices.length > 0 && (
                <div className="ksef-invoice-list">
                    <table>
                        <thead>
                            <tr>
                                <th>Numer Faktury</th>
                                <th>Sprzedawca</th>
                                <th>Kwota (Netto)</th>
                                <th>Akcje</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ksefInvoices.map(inv => (
                                <tr key={inv.ksefReferenceNumber}>
                                    <td>{inv.invoiceNumber}</td>
                                    <td>{inv.sellerName}</td>
                                    <td>{parseFloat(inv.grossAmount).toFixed(2)} zł</td>
                                    <td>
                                        <Button onClick={() => handleImportInvoice(inv.ksefReferenceNumber)} disabled={isLoading} variant="outline">
                                            Importuj
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};

export default KsefManager;
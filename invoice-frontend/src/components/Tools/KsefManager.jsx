import React, { useState, useEffect } from 'react';
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
    // Stan do śledzenia zaznaczonych faktur do importu
    const [selectedInvoices, setSelectedInvoices] = useState(new Set());
    // Stan do zarządzania datą początkową dla pobierania faktur
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    // Stan do wyświetlania komunikatów o statusie operacji
    const [status, setStatus] = useState({ message: '', type: '' });

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
        setStatus({ message: 'Pobieranie listy faktur z KSeF...', type: 'info' });
        setKsefInvoices([]); // Wyczyść poprzednie wyniki
        try {
            const response = await api.post('/ksef/list', { startDate });
            // Zakładamy, że backend zwraca tablicę faktur
            setKsefInvoices(response.data || []);
            setStatus({ message: `Pobrano ${response.data.length || 0} faktur.`, type: 'success' });
        } catch (error) {
            setStatus({ message: error.response?.data?.message || 'Nie udało się pobrać faktur.', type: 'error' });
        }
    };

    /**
     * Obsługuje zaznaczanie/odznaczanie faktur na liście.
     */
    const handleSelectInvoice = (invoiceRef) => {
        const newSelection = new Set(selectedInvoices);
        if (newSelection.has(invoiceRef)) {
            newSelection.delete(invoiceRef);
        } else {
            newSelection.add(invoiceRef);
        }
        setSelectedInvoices(newSelection);
    };

    /**
     * Importuje zaznaczone faktury do systemu.
     */
    const handleImportSelected = async () => {
        if (selectedInvoices.size === 0) {
            setStatus({ message: 'Najpierw zaznacz faktury do importu.', type: 'error' });
            return;
        }
        setStatus({ message: `Importowanie ${selectedInvoices.size} faktur...`, type: 'info' });
        try {
            const response = await api.post('/ksef/import', {
                ksefReferenceNumbers: Array.from(selectedInvoices)
            });
            setStatus({ message: response.data.message, type: 'success' });
            setSelectedInvoices(new Set()); // Wyczyść zaznaczenie po imporcie
            // Można by tu dodać odświeżenie głównej listy faktur
        } catch (error) {
            setStatus({ message: error.response?.data?.message || 'Import nie powiódł się.', type: 'error' });
        }
    };

    return (
        <div className="tools-section">
            <h2>Zarządzanie Integracją z KSeF</h2>
            <p>Skonfiguruj połączenie z Krajowym Systemem e-Faktur, aby automatycznie pobierać i importować faktury zakupu.</p>

            <KsefCertificateManager />
            <hr />

            <div className="tool-item">
                <h4>Krok 2: Ustawienia Połączenia</h4>
                <label htmlFor="ksef_nip">Twój NIP</label>
                <input type="text" id="ksef_nip" name="ksef_nip" value={settings.ksef_nip} onChange={handleSettingsChange} />
                
                <label htmlFor="ksef_token">Token Autoryzacyjny KSeF</label>
                <input type="password" id="ksef_token" name="ksef_token" value={settings.ksef_token} onChange={handleSettingsChange} />
                <button onClick={handleSaveSettings}>Zapisz Ustawienia</button>
            </div>
            <hr />

            <div className="tool-item">
                <h4>Krok 3: Test Połączenia</h4>
                <p>Sprawdź, czy Twoje certyfikaty i token pozwalają na pomyślne zainicjowanie sesji z KSeF.</p>
                <button onClick={handleTestConnection}>Testuj Połączenie</button>
            </div>
            <hr />
            
            <div className="tool-item">
                <h4>Krok 4: Pobieranie i Import Faktur</h4>
                <label htmlFor="startDate">Pobierz faktury od dnia:</label>
                <input type="date" id="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <button onClick={handleFetchInvoices}>Pobierz listę faktur z KSeF</button>
            </div>

            {status.message && (
                <div className={`status-message ${status.type}`}>
                    {status.message}
                </div>
            )}

            {ksefInvoices.length > 0 && (
                <div className="ksef-invoice-list">
                    <table>
                        <thead>
                            <tr>
                                <th></th>
                                <th>Numer Faktury</th>
                                <th>Sprzedawca</th>
                                <th>Kwota</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ksefInvoices.map(inv => (
                                <tr key={inv.ksefReferenceNumber}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedInvoices.has(inv.ksefReferenceNumber)}
                                            onChange={() => handleSelectInvoice(inv.ksefReferenceNumber)}
                                        />
                                    </td>
                                    <td>{inv.invoiceNumber}</td>
                                    <td>{inv.sellerName}</td>
                                    <td>{parseFloat(inv.grossAmount).toFixed(2)} zł</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button onClick={handleImportSelected} disabled={selectedInvoices.size === 0} style={{marginTop: '10px'}}>
                        Zaimportuj zaznaczone ({selectedInvoices.size})
                    </button>
                </div>
            )}
        </div>
    );
};

export default KsefManager;
import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';

// Import wszystkich komponentów składowych Dashboardu
import Navbar from '../components/Layout/Navbar';
import UploadForm from '../components/Invoices/UploadForm';
import InvoiceTable from '../components/Invoices/InvoiceTable';
import SearchBar from '../components/SearchBar';
import Reports from '../components/Tools/Reports';
import Settings from '../components/Tools/Settings';
import Card from '../components/ui/Card';
import KsefManager from '../components/Tools/KsefManager';

/**
 * Główna strona aplikacji po zalogowaniu - Dashboard.
 * Pełni rolę kontenera dla wszystkich głównych funkcjonalności.
 */
const DashboardPage = () => {
    // Stan przechowujący wszystkie faktury pobrane z serwera (oryginalne źródło danych)
    const [allInvoices, setAllInvoices] = useState([]);
    // Stan przechowujący faktury, które mają być aktualnie wyświetlane w tabeli (mogą być przefiltrowane)
    const [displayedInvoices, setDisplayedInvoices] = useState([]);
    // Stan przechowujący listę kategorii
    const [categories, setCategories] = useState([]);
    // Stan informujący o trwającym procesie ładowania danych
    const [isLoading, setIsLoading] = useState(true);
    // Stan do przechowywania ogólnych błędów na poziomie strony
    const [error, setError] = useState('');

    /**
     * Główna funkcja do pobierania danych (faktur i kategorii) z serwera.
     * Użycie useCallback zapobiega tworzeniu nowej instancji funkcji przy każdym renderowaniu,
     * co jest dobrą praktyką, gdy funkcja jest przekazywana jako prop lub używana w useEffect.
     */
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            // Równoległe pobieranie obu zasobów dla większej wydajności
            const [invoicesResponse, categoriesResponse] = await Promise.all([
                api.get('/invoices?includeItems=true'), // Dodajemy parametr, aby backend dołączył pozycje
                api.get('/categories')
            ]);
            
            setAllInvoices(invoicesResponse.data);
            setDisplayedInvoices(invoicesResponse.data); // Na początku wyświetlamy wszystkie
            setCategories(categoriesResponse.data);
        } catch (err) {
            console.error("Błąd podczas pobierania danych:", err);
            setError('Nie udało się załadować danych z serwera. Spróbuj odświeżyć stronę.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Efekt, który uruchamia pobieranie danych tylko raz, po pierwszym zamontowaniu komponentu
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /**
     * Obsługuje logikę wyszukiwania. Filtruje listę `allInvoices` na podstawie zapytania
     * i aktualizuje `displayedInvoices`.
     */
    const handleSearch = (query) => {
        if (!query) {
            setDisplayedInvoices(allInvoices); // Jeśli zapytanie jest puste, pokaż wszystko
            return;
        }
        const lowercasedQuery = query.toLowerCase();
        const filtered = allInvoices.filter(invoice =>
            invoice.invoice_number?.toLowerCase().includes(lowercasedQuery) ||
            invoice.seller_nip?.toLowerCase().includes(lowercasedQuery) ||
            invoice.buyer_nip?.toLowerCase().includes(lowercasedQuery) ||
            invoice.seller_name?.toLowerCase().includes(lowercasedQuery) || // Możliwość rozszerzenia wyszukiwania
            invoice.buyer_name?.toLowerCase().includes(lowercasedQuery)
        );
        setDisplayedInvoices(filtered);
    };

    /**
     * Czyści wyniki wyszukiwania i przywraca pełną listę faktur.
     */
    const clearSearch = () => {
        setDisplayedInvoices(allInvoices);
    };

    return (
        <>
            <Navbar />
            <main className="mx-auto max-w-7xl bg-white p-6 rounded-lg shadow">
                {error && (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
                        {error}
                    </div>
                )}

                <h1 className="text-2xl font-semibold text-slate-800">Panel Główny</h1>
                <UploadForm categories={categories} onUploadSuccess={fetchData} />

                <h2 className="mt-8 text-xl font-semibold text-slate-800 border-b border-slate-200 pb-2">Zapisane Faktury</h2>
                <SearchBar onSearch={handleSearch} onClear={clearSearch} />
                
                {isLoading ? (
                    <p style={{ textAlign: 'center', padding: '20px' }}>Ładowanie danych faktur...</p>
                ) : (
                    <InvoiceTable
                        invoices={displayedInvoices}
                        categories={categories}
                        onDataChange={fetchData} // Przekazujemy funkcję do odświeżania danych
                    />
                )}
            </main>
        </>
    );
};

export default DashboardPage;
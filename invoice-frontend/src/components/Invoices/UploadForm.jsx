import React, { useState } from 'react';
import Button from '../ui/Button';
import api from '../../api/axiosConfig';

/**
 * Komponent formularza do przesyłania nowych faktur.
 * Obsługuje zarówno wybór pliku, jak i "przeciągnij i upuść".
 *
 * @param {object} props
 * @param {Array} props.categories - Lista dostępnych kategorii do wyboru.
 * @param {Function} props.onUploadSuccess - Funkcja zwrotna wywoływana po pomyślnym przesłaniu faktury.
 */
const UploadForm = ({ categories, onUploadSuccess }) => {
    const [file, setFile] = useState(null);
    const [previewSrc, setPreviewSrc] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const [status, setStatus] = useState({ message: '', type: '' });
    const [formData, setFormData] = useState({
        category_id: '',
        payment_status: 'niezapłacona',
        payment_due_date: '',
        invoice_number: '',
        issue_date: '',
        delivery_date: '',
        seller_nip: '',
        buyer_nip: '',
        seller_name: '',
        seller_address: '',
        seller_bank_account: '',
        buyer_name: '',
        buyer_address: '',
        total_net_amount: '',
        total_vat_amount: '',
        total_gross_amount: '',
        payment_method: '',
        payment_date: '',
        currency: 'PLN',
        tracking_number: '',
        amount_in_words: '',
        notes: ''
    });

    // Podgląd wykrytych wartości z backendu
    const [previewData, setPreviewData] = useState(null);
    const [rawText, setRawText] = useState([]);
    const [showPreview, setShowPreview] = useState(false);

    /**
     * Obsługuje zmianę wartości w polach formularza (kategoria, status, data).
     */
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    /**
     * Obsługuje wybór pliku (zarówno z okna dialogowego, jak i upuszczonego).
     * Generuje podgląd, jeśli plik jest obrazem.
     */
    const handleFileChange = (selectedFile) => {
        if (!selectedFile) return;

        // Sprawdzenie typu pliku
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(selectedFile.type)) {
            setStatus({ message: 'Nieprawidłowy format pliku. Dozwolone są .pdf, .jpg, .png, .gif.', type: 'error' });
            return;
        }

        setFile(selectedFile);
        setStatus({ message: '', type: '' }); // Wyczyść poprzednie błędy

        // Generowanie podglądu dla obrazów
        if (selectedFile.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewSrc(reader.result);
            };
            reader.readAsDataURL(selectedFile);
        } else {
            setPreviewSrc(''); // Brak podglądu dla PDF
        }
    };

    /**
     * Resetuje stan formularza do wartości początkowych.
     */
    const resetForm = () => {
        setFile(null);
        setPreviewSrc('');
        setFormData({
            category_id: '',
            payment_status: 'niezapłacona',
            payment_due_date: '',
            invoice_number: '',
            issue_date: '',
            delivery_date: '',
            seller_nip: '',
            buyer_nip: '',
            seller_name: '',
            seller_address: '',
            seller_bank_account: '',
            buyer_name: '',
            buyer_address: '',
            total_net_amount: '',
            total_vat_amount: '',
            total_gross_amount: '',
            payment_method: '',
            payment_date: '',
            currency: 'PLN',
            tracking_number: '',
            amount_in_words: '',
            notes: ''
        });
        setPreviewData(null);
        setRawText([]);
        setShowPreview(false);
        // Pozostaw komunikat o sukcesie widoczny dla użytkownika
    };

    // Wywołanie trybu podglądu: pobierz wykryte wartości bez zapisu
    const handlePreview = async () => {
        if (!file) {
            setStatus({ message: 'Najpierw wybierz plik faktury!', type: 'error' });
            return;
        }

        setStatus({ message: 'Przetwarzanie pliku i pobieranie podglądu...', type: 'info' });

        const uploadData = new FormData();
        uploadData.append('invoice', file);
        // Dołącz aktualne pola, aby mogły nadpisywać wykryte wartości w podglądzie
        Object.keys(formData).forEach(key => {
            if (formData[key]) {
                uploadData.append(key, formData[key]);
            }
        });
        uploadData.append('preview', 'true');

        try {
            const response = await api.post('/upload', uploadData);
            setPreviewData(response.data?.data || null);
            setRawText(response.data?.rawText || []);
            setShowPreview(true);
            setStatus({ message: 'Podgląd wygenerowany. Zweryfikuj i dostosuj pola.', type: 'success' });
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Wystąpił nieoczekiwany błąd.';
            setStatus({ message: `Błąd podglądu: ${errorMessage}`, type: 'error' });
        }
    };

    /**
     * Obsługuje wysłanie formularza do backendu.
     */
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) {
            setStatus({ message: 'Najpierw wybierz plik faktury!', type: 'error' });
            return;
        }

        setStatus({ message: 'Przetwarzanie i wysyłanie pliku...', type: 'info' });

        const uploadData = new FormData();
        uploadData.append('invoice', file);
        // Dołącz dodatkowe dane do FormData
        Object.keys(formData).forEach(key => {
            if (formData[key]) {
                uploadData.append(key, formData[key]);
            }
        });

        try {
            // Nie ustawiaj ręcznie nagłówka Content-Type dla FormData.
            // Axios sam doda poprawny boundary; ręczne ustawienie może powodować brak pliku po stronie serwera.
            const response = await api.post('/upload', uploadData);
            setStatus({ message: response.data.message, type: 'success' });
            resetForm();
            onUploadSuccess(); // Wywołaj funkcję zwrotną, aby odświeżyć listę faktur
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Wystąpił nieoczekiwany błąd.';
            setStatus({ message: `Błąd przesyłania: ${errorMessage}`, type: 'error' });
        }
    };

    // Funkcje do obsługi zdarzeń "przeciągnij i upuść"
    const handleDragEvents = (e, over) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(over);
    };

    const handleDrop = (e) => {
        handleDragEvents(e, false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileChange(e.dataTransfer.files[0]);
        }
    };


    return (
        <div className="upload-section mt-6">
            <form onSubmit={handleSubmit}>
                <div 
                    className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
                    onDragOver={(e) => handleDragEvents(e, true)}
                    onDragEnter={(e) => handleDragEvents(e, true)}
                    onDragLeave={(e) => handleDragEvents(e, false)}
                    onDrop={handleDrop}
                >
                    <input 
                        type="file" 
                        id="file-input"
                        onChange={(e) => handleFileChange(e.target.files[0])} 
                        accept=".pdf,.png,.jpg,.jpeg,.gif" 
                    />
                    <label htmlFor="file-input" className="file-label inline-block px-3 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 cursor-pointer">
                        {file ? `Wybrano plik: ${file.name}` : 'Kliknij, aby wybrać plik lub upuść go tutaj'}
                    </label>
                    {previewSrc && <img src={previewSrc} alt="Podgląd" className="preview-image"/>}
                </div>

                <div className="upload-options grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="form-group">
                        <label htmlFor="category_id">Kategoria (opcjonalnie)</label>
                        <select
                            name="category_id"
                            value={formData.category_id}
                            onChange={handleInputChange}
                            className="block w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">-- Brak kategorii --</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="payment_status">Status Płatności</label>
                        <select
                            name="payment_status"
                            value={formData.payment_status}
                            onChange={handleInputChange}
                            className="block w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="niezapłacona">Niezapłacona</option>
                            <option value="zapłacona">Zapłacona</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="payment_due_date">Termin Płatności (opcjonalnie)</label>
                        <input
                            type="date"
                            name="payment_due_date"
                            value={formData.payment_due_date}
                            onChange={handleInputChange}
                            className="block w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Wszystkie pola do dopasowania i kopiowania z wykrytych wartości */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* NIP sprzedawcy */}
                    <div className="form-group">
                        <label htmlFor="seller_nip">NIP sprzedawcy</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="seller_nip"
                                id="seller_nip"
                                placeholder="np. 1234567890"
                                value={formData.seller_nip}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.sellerNIP && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, seller_nip: previewData.sellerNIP }))}
                                    title={`Wykryto: ${previewData.sellerNIP}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.sellerNIP && (
                            <p className="text-xs text-slate-600 mt-1">Wykryty NIP: {previewData.sellerNIP}</p>
                        )}
                    </div>

                    {/* NIP nabywcy */}
                    <div className="form-group">
                        <label htmlFor="buyer_nip">NIP nabywcy</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="buyer_nip"
                                id="buyer_nip"
                                placeholder="np. 1234567890"
                                value={formData.buyer_nip}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.buyerNIP && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, buyer_nip: previewData.buyerNIP }))}
                                    title={`Wykryto: ${previewData.buyerNIP}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.buyerNIP && (
                            <p className="text-xs text-slate-600 mt-1">Wykryty NIP: {previewData.buyerNIP}</p>
                        )}
                    </div>

                    {/* Numer faktury */}
                    <div className="form-group">
                        <label htmlFor="invoice_number">Numer faktury</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="invoice_number"
                                id="invoice_number"
                                value={formData.invoice_number}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.invoiceNumber && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, invoice_number: previewData.invoiceNumber }))}
                                    title={`Wykryto: ${previewData.invoiceNumber}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.invoiceNumber && (
                            <p className="text-xs text-slate-600 mt-1">Wykryty numer: {previewData.invoiceNumber}</p>
                        )}
                    </div>

                    {/* Data wystawienia */}
                    <div className="form-group">
                        <label htmlFor="issue_date">Data wystawienia</label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                name="issue_date"
                                id="issue_date"
                                value={formData.issue_date}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.issueDate && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, issue_date: previewData.issueDate }))}
                                    title={`Wykryto: ${previewData.issueDate}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.issueDate && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta data: {previewData.issueDate}</p>
                        )}
                    </div>

                    {/* Data dostawy */}
                    <div className="form-group">
                        <label htmlFor="delivery_date">Data dostawy</label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                name="delivery_date"
                                id="delivery_date"
                                value={formData.delivery_date}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.deliveryDate && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, delivery_date: previewData.deliveryDate }))}
                                    title={`Wykryto: ${previewData.deliveryDate}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.deliveryDate && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta data dostawy: {previewData.deliveryDate}</p>
                        )}
                    </div>

                    {/* Nazwa sprzedawcy */}
                    <div className="form-group">
                        <label htmlFor="seller_name">Nazwa sprzedawcy</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="seller_name"
                                id="seller_name"
                                value={formData.seller_name}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.sellerName && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, seller_name: previewData.sellerName }))}
                                    title={`Wykryto: ${previewData.sellerName}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.sellerName && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta nazwa: {previewData.sellerName}</p>
                        )}
                    </div>

                    {/* Nazwa nabywcy */}
                    <div className="form-group">
                        <label htmlFor="buyer_name">Nazwa nabywcy</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="buyer_name"
                                id="buyer_name"
                                value={formData.buyer_name}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.buyerName && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, buyer_name: previewData.buyerName }))}
                                    title={`Wykryto: ${previewData.buyerName}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.buyerName && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta nazwa: {previewData.buyerName}</p>
                        )}
                    </div>

                    {/* Rachunek bankowy */}
                    <div className="form-group">
                        <label htmlFor="seller_bank_account">Rachunek bankowy</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="seller_bank_account"
                                id="seller_bank_account"
                                placeholder="np. PL61109010140000071219812874"
                                value={formData.seller_bank_account}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.bankAccount && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, seller_bank_account: previewData.bankAccount }))}
                                    title={`Wykryto: ${previewData.bankAccount}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.bankAccount && (
                            <p className="text-xs text-slate-600 mt-1">Wykryty rachunek: {previewData.bankAccount}</p>
                        )}
                    </div>

                    {/* Suma netto */}
                    <div className="form-group">
                        <label htmlFor="total_net_amount">Suma netto</label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                step="0.01"
                                name="total_net_amount"
                                id="total_net_amount"
                                value={formData.total_net_amount}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.totalNetAmount && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, total_net_amount: previewData.totalNetAmount }))}
                                    title={`Wykryto: ${previewData.totalNetAmount}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.totalNetAmount && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta kwota netto: {previewData.totalNetAmount}</p>
                        )}
                    </div>

                    {/* Suma VAT */}
                    <div className="form-group">
                        <label htmlFor="total_vat_amount">Suma VAT</label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                step="0.01"
                                name="total_vat_amount"
                                id="total_vat_amount"
                                value={formData.total_vat_amount}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.totalVatAmount && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, total_vat_amount: previewData.totalVatAmount }))}
                                    title={`Wykryto: ${previewData.totalVatAmount}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.totalVatAmount && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta kwota VAT: {previewData.totalVatAmount}</p>
                        )}
                    </div>

                    {/* Suma brutto */}
                    <div className="form-group">
                        <label htmlFor="total_gross_amount">Suma brutto</label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                step="0.01"
                                name="total_gross_amount"
                                id="total_gross_amount"
                                value={formData.total_gross_amount}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.totalGrossAmount && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, total_gross_amount: previewData.totalGrossAmount }))}
                                    title={`Wykryto: ${previewData.totalGrossAmount}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.totalGrossAmount && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta kwota brutto: {previewData.totalGrossAmount}</p>
                        )}
                    </div>

                    {/* Forma płatności */}
                    <div className="form-group">
                        <label htmlFor="payment_method">Forma płatności</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="payment_method"
                                id="payment_method"
                                placeholder="np. przelew"
                                value={formData.payment_method}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.paymentMethod && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, payment_method: previewData.paymentMethod }))}
                                    title={`Wykryto: ${previewData.paymentMethod}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.paymentMethod && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta forma płatności: {previewData.paymentMethod}</p>
                        )}
                    </div>

                    {/* Data płatności */}
                    <div className="form-group">
                        <label htmlFor="payment_date">Data płatności</label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                name="payment_date"
                                id="payment_date"
                                value={formData.payment_date}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.paymentDate && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, payment_date: previewData.paymentDate }))}
                                    title={`Wykryto: ${previewData.paymentDate}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.paymentDate && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta data płatności: {previewData.paymentDate}</p>
                        )}
                    </div>

                    {/* Waluta */}
                    <div className="form-group">
                        <label htmlFor="currency">Waluta</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="currency"
                                id="currency"
                                placeholder="PLN"
                                value={formData.currency}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.currency && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, currency: previewData.currency }))}
                                    title={`Wykryto: ${previewData.currency}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.currency && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta waluta: {previewData.currency}</p>
                        )}
                    </div>

                    {/* Numer śledzenia */}
                    <div className="form-group">
                        <label htmlFor="tracking_number">Numer śledzenia</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="tracking_number"
                                id="tracking_number"
                                value={formData.tracking_number}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.trackingNumber && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, tracking_number: previewData.trackingNumber }))}
                                    title={`Wykryto: ${previewData.trackingNumber}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.trackingNumber && (
                            <p className="text-xs text-slate-600 mt-1">Wykryty numer: {previewData.trackingNumber}</p>
                        )}
                    </div>

                    {/* Kwota słownie */}
                    <div className="form-group">
                        <label htmlFor="amount_in_words">Kwota słownie</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="amount_in_words"
                                id="amount_in_words"
                                value={formData.amount_in_words}
                                onChange={handleInputChange}
                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {previewData?.amountInWords && (
                                <button
                                    type="button"
                                    className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                                    onClick={() => setFormData(prev => ({ ...prev, amount_in_words: previewData.amountInWords }))}
                                    title={`Wykryto: ${previewData.amountInWords}`}
                                >
                                    Wstaw wykryty
                                </button>
                            )}
                        </div>
                        {previewData?.amountInWords && (
                            <p className="text-xs text-slate-600 mt-1">Wykryta kwota słownie: {previewData.amountInWords}</p>
                        )}
                    </div>
                </div>

                {/* Pole uwagi i surowy tekst z możliwością dodawania linii */}
                {showPreview && (
                    <div className="mt-6">
                        <h3 className="text-sm font-semibold mb-2">Uwagi</h3>
                        <textarea
                            name="notes"
                            id="notes"
                            rows={4}
                            value={formData.notes}
                            onChange={handleInputChange}
                            className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Dodaj własne notatki lub wybierz linie poniżej, aby dodać do uwag."
                        />

                        <div className="mt-4">
                            <h4 className="text-sm font-semibold mb-2">Wykryty, surowy tekst (nieprzypisane wartości)</h4>
                            <div className="max-h-48 overflow-auto border rounded">
                                {rawText.length === 0 && (
                                    <p className="text-xs text-slate-600 p-2">Brak surowych linii do wyświetlenia.</p>
                                )}
                                {rawText.map((line, idx) => (
                                    <div key={idx} className="flex items-center justify-between px-2 py-1 border-b last:border-b-0">
                                        <span className="text-xs text-slate-700 truncate mr-2" title={line}>{line}</span>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 bg-slate-100 rounded hover:bg-slate-200"
                                            onClick={() => setFormData(prev => ({ ...prev, notes: (prev.notes ? (prev.notes + '\n') : '') + line }))}
                                        >
                                            Dodaj do uwag
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                <div className="mt-4 flex gap-3 items-center">
                    <Button type="button" onClick={handlePreview} disabled={!file || status.type === 'info'} variant="secondary" size="md">
                        Podgląd wykrytych wartości
                    </Button>
                    <Button type="submit" disabled={!file || status.type === 'info'} variant="primary" size="lg" className="gap-2">
                        {status.type === 'info' ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                                </svg>
                            Przetwarzanie...
                            </>
                        ) : (
                            <>
                                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M5 20h14v-2H5v2zm7-18l-5.5 5.5h3.5V15h4V7.5H17L12 2z" />
                                </svg>
                            Zapisz Fakturę
                            </>
                        )}
                    </Button>
                </div>
            </form>
            
            {status.message && (
                <div className={`status-message ${status.type}`}>
                    {status.message}
                </div>
            )}
        </div>
    );
};

export default UploadForm;
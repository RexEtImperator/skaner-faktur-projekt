import React, { useState } from 'react';
import Button from '../ui/Button';
import api from '../../api/axiosConfig';
import OcrViewer from '../OCR/OcrViewer';

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
    const [ocrWords, setOcrWords] = useState([]);

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
        setOcrWords([]);
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
            setOcrWords(response.data?.ocr?.words || []);
            setShowPreview(true);
            setStatus({ message: 'Podgląd wygenerowany. Zweryfikuj i dostosuj pola.', type: 'success' });
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Wystąpił nieoczekiwany błąd.';
            setStatus({ message: `Błąd podglądu: ${errorMessage}`, type: 'error' });
        }
    };

    // Normalizacja bbox z Document AI -> wartości znormalizowane (0..1)
    const normalizeBBox = (poly = {}, pageDim = { width: 1, height: 1 }) => {
        const verts = (poly.normalizedVertices && poly.normalizedVertices.length > 0)
            ? poly.normalizedVertices
            : poly.vertices;
        if (!verts || verts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
        const xs = verts.map(v => typeof v.x === 'number' ? v.x : 0);
        const ys = verts.map(v => typeof v.y === 'number' ? v.y : 0);
        let minX = Math.min(...xs), maxX = Math.max(...xs);
        let minY = Math.min(...ys), maxY = Math.max(...ys);
        // Jeśli współrzędne w pikselach, przelicz na [0..1]
        const isPixels = maxX > 1 || maxY > 1;
        if (isPixels) {
            minX = minX / (pageDim.width || 1);
            maxX = maxX / (pageDim.width || 1);
            minY = minY / (pageDim.height || 1);
            maxY = maxY / (pageDim.height || 1);
        }
        return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
    };

    // Budowa listy "słów" dla OcrViewer na bazie bloków Document AI
    const buildWordsFromDocAi = (doc) => {
        const words = [];
        const text = doc?.document?.text || '';
        const pages = doc?.document?.pages || [];
        pages.forEach(page => {
            const dim = page?.dimension || { width: 1, height: 1 };
            (page.blocks || []).forEach(block => {
                const segs = block?.layout?.textAnchor?.textSegments || [];
                const blockText = segs.map(s => {
                    const start = Number(s.startIndex || 0);
                    const end = Number(s.endIndex || 0);
                    return text.slice(start, end);
                }).join(' ').trim();
                const bbox = normalizeBBox(block?.layout?.boundingPoly || {}, dim);
                if (blockText) {
                    // Traktuj cały tekst bloku jako jeden "token" OCR
                    words.push({ text: blockText, bbox });
                }
            });
        });
        return words;
    };

    // Ekstrakcja najważniejszych pól z surowego tekstu
    const extractFieldsFromDocAi = (doc) => {
        const text = doc?.document?.text || '';
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const join = (arr, sep = ' ') => arr.filter(Boolean).join(sep);

        const textAll = lines.join('\n');
        const getMatch = (re) => {
            const m = textAll.match(re);
            return m ? m[1] : '';
        };
        const amount = (str) => {
            if (!str) return '';
            const m = String(str).match(/[\d.,]+/);
            return m ? m[0].replace(/\./g, '').replace(',', '.') : '';
        };
        const dateNear = (anchorRegex) => {
            const idx = lines.findIndex(l => anchorRegex.test(l));
            const dateRe = /(\d{4}[./-]\d{2}[./-]\d{2}|\d{2}[./-]\d{2}[./-]\d{4})/;
            if (idx >= 0) {
                for (let i = idx; i < Math.min(lines.length, idx + 6); i++) {
                    const m = lines[i].match(dateRe);
                    if (m) return m[1].replace(/\./g, '-').replace(/\//g, '-');
                }
            }
            const any = textAll.match(dateRe);
            return any ? any[1].replace(/\./g, '-').replace(/\//g, '-') : '';
        };

        // Sprzedawca: po anchorze "Sprzedawca" do następnego znacznika sekcji
        const sellerIdx = lines.findIndex(l => /sprzedawca/i.test(l));
        let sellerLines = [];
        if (sellerIdx >= 0) {
            for (let i = sellerIdx + 1; i < Math.min(lines.length, sellerIdx + 6); i++) {
                if (/faktura\s+vat/i.test(lines[i])) break;
                sellerLines.push(lines[i]);
            }
        }
        const sellerName = sellerLines[0] || getMatch(/sprzedawca\s*\n?([^\n]+)/i);
        const sellerAddress = join(sellerLines.slice(1, 3));

        // Nabywca
        const buyerIdx = lines.findIndex(l => /nabywca/i.test(l));
        let buyerName = '';
        let buyerAddress = '';
        if (buyerIdx >= 0) {
            buyerName = lines[buyerIdx + 1] || '';
            buyerAddress = join([lines[buyerIdx + 2], lines[buyerIdx + 3]]);
        }

        // Różne pola
        const invoiceNumber = getMatch(/\bnr\s*([A-Za-z0-9\/\-]+)/i);
        const sellerNIP = getMatch(/\bNIP[:\s]*([0-9\-]+)/i);
        const bdoNumber = getMatch(/Numer\s+BDO[:\s]*([0-9]+)/i);
        const bankAccount = getMatch(/Nr\s+rachunku[:\s]*([0-9\- ]{8,})/i).replace(/\s+/g, ' ').trim();
        const paymentMethod = getMatch(/Forma\s+płatności\s*([A-ZŁŚŻĆÓŃ]+[A-Za-z\s\-]+)/i) || (lines.find(l => /PAYU/i.test(l)) ? 'PAYU' : '');
        const paymentDate = dateNear(/\bTermin\b/i);

        // Daty
        const issueDate = dateNear(/Data\s+wystawienia/i);
        const deliveryDate = dateNear(/Data\s+dostawy|wykonania\s+usługi/i);

        // Suma
        const totalGrossAmount = amount(getMatch(/Razem\s+do\s+zapłaty[\s\S]*?(\d+[\d,.]*\s*PLN)/i)) || amount(getMatch(/Brutto\s*(\d+[\d,.]*)/i));
        const totalNetAmount = amount(getMatch(/Netto\s*(\d+[\d,.]*)/i));
        const totalVatAmount = amount(getMatch(/VAT\s*(\d+[\d,.]*)/i));
        const currency = (textAll.match(/PLN|EUR|USD/) || ['PLN'])[0];

        const trackingNumber = getMatch(/Nr\s+listu\s+przewozowego[:\s]*([A-Za-z0-9]+)/i);
        const amountInWords = getMatch(/Słownie:\s*([^\n]+)/i);

        return {
            invoiceNumber,
            issueDate,
            deliveryDate,
            sellerName,
            sellerNIP,
            sellerAddress,
            buyerName,
            buyerNIP: '',
            buyerAddress,
            totalNetAmount,
            totalVatAmount,
            totalGrossAmount,
            sellerBankAccount: bankAccount,
            bankAccount,
            currency,
            paymentMethod,
            paymentDate,
            amountInWords,
            trackingNumber,
            bdoNumber
        };
    };

    // Wczytaj i przetwórz lokalny plik response.json z zewnętrznego OCR
    const handleLoadResponseJson = async () => {
        setStatus({ message: 'Wczytywanie danych z response.json...', type: 'info' });
        try {
            // Dynamiczny import JSON z root projektu
            const mod = await import('../../../response.json');
            const doc = mod?.default || mod;
            const rawLines = (doc?.document?.text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const words = buildWordsFromDocAi(doc);
            const pd = extractFieldsFromDocAi(doc);
            setPreviewData(pd);
            setRawText(rawLines);
            setOcrWords(words);
            setShowPreview(true);
            setStatus({ message: 'Załadowano response.json. Zweryfikuj i dostosuj pola.', type: 'success' });
        } catch (err) {
            setStatus({ message: 'Nie udało się wczytać response.json. Upewnij się, że plik istnieje w katalogu projektu.', type: 'error' });
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

    // Buduje listę pól do OcrViewer na podstawie danych z podglądu
    const buildFieldsFromPreview = (pd) => {
        if (!pd) return [];

        const labelMap = {
            invoiceNumber: 'Numer faktury',
            issueDate: 'Data wystawienia faktury',
            deliveryDate: 'Data sprzedaży',
            sellerName: 'Sprzedawca',
            sellerNIP: 'NIP sprzedawcy',
            sellerAddress: 'Adres sprzedawcy',
            buyerName: 'Nabywca',
            buyerNIP: 'NIP nabywcy',
            buyerAddress: 'Adres nabywcy',
            totalNetAmount: 'Suma netto',
            totalVatAmount: 'Suma VAT',
            totalGrossAmount: 'Suma brutto',
            bankAccount: 'Konto bankowe',
            sellerBankAccount: 'Konto bankowe',
            currency: 'Waluta',
            paymentMethod: 'Forma płatności',
            paymentDate: 'Termin płatności',
            amountInWords: 'Słownie',
            trackingNumber: 'Nr listu przewozowego',
            dayMonthYear: 'Dzień/Miesiąc/Rok',
            mppRequired: 'MPP wymagane',
            bdoNumber: 'Numer BDO'
        };

        const fields = [];
        const usedKeys = new Set();

        const pushIf = (key, id, label, value) => {
            if (typeof value !== 'undefined' && value !== null && value !== '') {
                fields.push({ id, label, value });
                usedKeys.add(key);
            }
        };

        pushIf('invoiceNumber', 'invoiceNumber', labelMap.invoiceNumber, pd.invoiceNumber);
        pushIf('issueDate', 'issueDate', labelMap.issueDate, pd.issueDate);
        pushIf('deliveryDate', 'deliveryDate', labelMap.deliveryDate, pd.deliveryDate);
        pushIf('sellerName', 'sellerName', labelMap.sellerName, pd.sellerName);
        pushIf('sellerNIP', 'sellerNIP', labelMap.sellerNIP, pd.sellerNIP);
        pushIf('sellerAddress', 'sellerAddress', labelMap.sellerAddress, pd.sellerAddress);
        pushIf('buyerName', 'buyerName', labelMap.buyerName, pd.buyerName);
        pushIf('buyerNIP', 'buyerNIP', labelMap.buyerNIP, pd.buyerNIP);
        pushIf('buyerAddress', 'buyerAddress', labelMap.buyerAddress, pd.buyerAddress);
        pushIf('totalNetAmount', 'totalNetAmount', labelMap.totalNetAmount, pd.totalNetAmount);
        pushIf('totalVatAmount', 'totalVatAmount', labelMap.totalVatAmount, pd.totalVatAmount);
        pushIf('totalGrossAmount', 'totalGrossAmount', labelMap.totalGrossAmount, pd.totalGrossAmount);
        // Konto bankowe może być w dwóch kluczach
        const bankVal = pd.sellerBankAccount || pd.bankAccount;
        if (typeof bankVal !== 'undefined' && bankVal !== null && bankVal !== '') {
            fields.push({ id: 'bankAccount', label: labelMap.bankAccount, value: bankVal });
            if (pd.sellerBankAccount) usedKeys.add('sellerBankAccount');
            if (pd.bankAccount) usedKeys.add('bankAccount');
        }
        pushIf('currency', 'currency', labelMap.currency, pd.currency);
        pushIf('paymentMethod', 'paymentMethod', labelMap.paymentMethod, pd.paymentMethod);
        pushIf('paymentDate', 'paymentDate', labelMap.paymentDate, pd.paymentDate);
        pushIf('amountInWords', 'amountInWords', labelMap.amountInWords, pd.amountInWords);
        pushIf('trackingNumber', 'trackingNumber', labelMap.trackingNumber, pd.trackingNumber);
        pushIf('dayMonthYear', 'dayMonthYear', labelMap.dayMonthYear, pd.dayMonthYear);
        pushIf('bdoNumber', 'bdoNumber', labelMap.bdoNumber, pd.bdoNumber);
        if (typeof pd.mppRequired !== 'undefined' && pd.mppRequired !== null) {
            fields.push({ id: 'mppRequired', label: labelMap.mppRequired, value: pd.mppRequired ? 'tak' : 'nie' });
            usedKeys.add('mppRequired');
        }

        // Spłaszcz pozycje (items) do listy pól, obsłuż camelCase i snake_case w atrybutach
        if (Array.isArray(pd.items)) {
            pd.items.forEach((it, idx) => {
                const n = idx + 1;
                const desc = it.description || it.name || it.desc;
                const qty = it.quantity || it.qty;
                const unit = it.unit || it.jm;
                const unitNet = it.unit_price_net || it.net_unit_price;
                const net = it.total_net_amount || it.net_amount || it.net;
                const vatRate = it.vat_rate || it.vatRate;
                const vat = it.total_vat_amount || it.vat_amount || it.vat;
                const gross = it.total_gross_amount || it.gross_amount || it.gross;
                const discount = it.discount_percent || it.discountPercent || it.discount;

                fields.push({ id: `item-${idx}-desc`, label: `Pozycja ${n} — Nazwa`, value: desc });
                if (qty) fields.push({ id: `item-${idx}-qty`, label: `Pozycja ${n} — Ilość`, value: qty });
                if (unit) fields.push({ id: `item-${idx}-unit`, label: `Pozycja ${n} — JM`, value: unit });
                if (unitNet) fields.push({ id: `item-${idx}-unit-net`, label: `Pozycja ${n} — Cena netto`, value: unitNet });
                if (net) fields.push({ id: `item-${idx}-net`, label: `Pozycja ${n} — Wartość netto`, value: net });
                if (vatRate) fields.push({ id: `item-${idx}-vat-rate`, label: `Pozycja ${n} — Stawka VAT`, value: vatRate });
                if (vat) fields.push({ id: `item-${idx}-vat`, label: `Pozycja ${n} — Wartość VAT`, value: vat });
                if (gross) fields.push({ id: `item-${idx}-gross`, label: `Pozycja ${n} — Wartość brutto`, value: gross });
                if (discount) fields.push({ id: `item-${idx}-discount`, label: `Pozycja ${n} — Rabat (%)`, value: discount });
            });
            usedKeys.add('items');
        }

        // Dodaj pozostałe wykryte klucze z pd, które nie zostały przypisane do żadnego pola
        Object.entries(pd).forEach(([key, val]) => {
            if (key === 'items') return;
            const value = val;
            if (!usedKeys.has(key) && typeof value !== 'undefined' && value !== null && value !== '') {
                fields.push({ id: key, label: labelMap[key] || key, value, unmatched: true });
            }
        });

        return fields.filter(f => typeof f.value !== 'undefined' && f.value !== null && f.value !== '');
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
                    {previewSrc && !showPreview && (<img src={previewSrc} alt="Podgląd" className="preview-image"/>) }
                    {showPreview && (
                        <div className="mt-4">
                            <OcrViewer imageUrl={previewSrc} fields={buildFieldsFromPreview(previewData)} words={ocrWords} rawLines={rawText} defaultTab="raw" overlayMode="words_only" />
                        </div>
                    )}
                </div>

                {showPreview && (
                <div className="upload-options grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="form-group">
                        <label htmlFor="category_id">Kategoria (opcjonalnie)</label>
                        <select
                            id="category_id"
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
                            id="payment_status"
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
                            id="payment_due_date"
                            name="payment_due_date"
                            value={formData.payment_due_date}
                            onChange={handleInputChange}
                            className="block w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
                )}

                {/* Wszystkie pola do dopasowania i kopiowania z wykrytych wartości */}
                {showPreview && (
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, seller_nip: previewData?.sellerNIP }))}
                                title={previewData?.sellerNIP ? `Wykryto: ${previewData.sellerNIP}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.sellerNIP}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryty NIP: {previewData?.sellerNIP || 'Nie wykryto'}</p>
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, buyer_nip: previewData?.buyerNIP }))}
                                title={previewData?.buyerNIP ? `Wykryto: ${previewData.buyerNIP}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.buyerNIP}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryty NIP: {previewData?.buyerNIP || 'Nie wykryto'}</p>
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, invoice_number: previewData?.invoiceNumber }))}
                                title={previewData?.invoiceNumber ? `Wykryto: ${previewData.invoiceNumber}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.invoiceNumber}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryty numer: {previewData?.invoiceNumber || 'Nie wykryto'}</p>
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, issue_date: previewData?.issueDate }))}
                                title={previewData?.issueDate ? `Wykryto: ${previewData.issueDate}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.issueDate}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryta data: {previewData?.issueDate || 'Nie wykryto'}</p>
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, delivery_date: previewData?.deliveryDate }))}
                                title={previewData?.deliveryDate ? `Wykryto: ${previewData.deliveryDate}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.deliveryDate}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryta data dostawy: {previewData?.deliveryDate || 'Nie wykryto'}</p>
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, seller_bank_account: previewData?.bankAccount }))}
                                title={previewData?.bankAccount ? `Wykryto: ${previewData.bankAccount}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.bankAccount}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryty rachunek: {previewData?.bankAccount || 'Nie wykryto'}</p>
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, total_net_amount: previewData?.totalNetAmount }))}
                                title={previewData?.totalNetAmount ? `Wykryto: ${previewData.totalNetAmount}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.totalNetAmount}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryta kwota netto: {previewData?.totalNetAmount || 'Nie wykryto'}</p>
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, total_vat_amount: previewData?.totalVatAmount }))}
                                title={previewData?.totalVatAmount ? `Wykryto: ${previewData.totalVatAmount}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.totalVatAmount}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryta kwota VAT: {previewData?.totalVatAmount || 'Nie wykryto'}</p>
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, total_gross_amount: previewData?.totalGrossAmount }))}
                                title={previewData?.totalGrossAmount ? `Wykryto: ${previewData.totalGrossAmount}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.totalGrossAmount}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryta kwota brutto: {previewData?.totalGrossAmount || 'Nie wykryto'}</p>
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
                            <button
                                type="button"
                                className="px-2 py-1 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setFormData(prev => ({ ...prev, payment_date: previewData?.paymentDate }))}
                                title={previewData?.paymentDate ? `Wykryto: ${previewData.paymentDate}` : 'Brak wykrytej wartości'}
                                disabled={!previewData?.paymentDate}
                            >
                                Wstaw wykryty
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Wykryta data płatności: {previewData?.paymentDate || 'Nie wykryto'}</p>
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
                )}

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
                    </div>
                )}
                <div className="mt-4 flex gap-3 items-center">
                    <Button type="button" onClick={handlePreview} disabled={!file || status.type === 'info'} variant="secondary" size="md">
                        Podgląd wykrytych wartości
                    </Button>
                    <Button type="button" onClick={handleLoadResponseJson} disabled={status.type === 'info'} variant="secondary" size="md">
                        Wczytaj z response.json
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
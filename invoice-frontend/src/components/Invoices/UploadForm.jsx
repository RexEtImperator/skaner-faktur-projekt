import React, { useState } from 'react';
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
        payment_due_date: ''
    });

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
            payment_due_date: ''
        });
        // Pozostaw komunikat o sukcesie widoczny dla użytkownika
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
            const response = await api.post('/upload', uploadData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
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
        <div className="upload-section">
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
                    <label htmlFor="file-input" className="file-label">
                        {file ? `Wybrano plik: ${file.name}` : 'Kliknij, aby wybrać plik lub upuść go tutaj'}
                    </label>
                    {previewSrc && <img src={previewSrc} alt="Podgląd" className="preview-image"/>}
                </div>

                <div className="upload-options">
                    <div className="form-group">
                        <label htmlFor="category_id">Kategoria (opcjonalnie)</label>
                        <select name="category_id" value={formData.category_id} onChange={handleInputChange}>
                            <option value="">-- Brak kategorii --</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="payment_status">Status Płatności</label>
                        <select name="payment_status" value={formData.payment_status} onChange={handleInputChange}>
                            <option value="niezapłacona">Niezapłacona</option>
                            <option value="zapłacona">Zapłacona</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="payment_due_date">Termin Płatności (opcjonalnie)</label>
                        <input type="date" name="payment_due_date" value={formData.payment_due_date} onChange={handleInputChange} />
                    </div>
                </div>

                <button type="submit" disabled={!file || status.type === 'info'}>
                    {status.type === 'info' ? 'Przetwarzanie...' : 'Przetwórz i Zapisz Fakturę'}
                </button>
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
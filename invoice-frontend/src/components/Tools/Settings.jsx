import React, { useState } from 'react';
import api from '../../api/axiosConfig';

// Helper do pobierania plików (można go wynieść do osobnego pliku utils.js)
const downloadFile = (blob, filename) => {
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
};

const Settings = () => {
    const [status, setStatus] = useState('');

    const handleBackup = async () => {
        if (!window.confirm('Czy na pewno chcesz pobrać kopię zapasową bazy danych?')) {
            return;
        }
        setStatus('Tworzenie kopii zapasowej...');
        try {
            const response = await api.get('/backup/db', { responseType: 'blob' });
            const filename = `backup-${new Date().toISOString().split('T')[0]}.sql`;
            downloadFile(response.data, filename);
            setStatus('Kopia zapasowa została pobrana.');
        } catch (error) {
            console.error("Błąd podczas tworzenia kopii zapasowej:", error);
            setStatus('Błąd serwera podczas tworzenia kopii.');
        }
    };

    return (
        <div className="tools-section">
            <h3>Ustawienia i Narzędzia</h3>
            <div className="tool-item">
                <p>Utwórz i pobierz pełną kopię zapasową swoich danych.</p>
                <button onClick={handleBackup}>Pobierz kopię zapasową (SQL)</button>
            </div>
             {status && <p className="tool-status">{status}</p>}
        </div>
    );
};

export default Settings;
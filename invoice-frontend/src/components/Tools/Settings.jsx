import React, { useState } from 'react';
import api from '../../api/axiosConfig';
import Button from '../ui/Button';

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
        <div>
            <h3 className="text-lg font-semibold text-slate-800">Ustawienia i Narzędzia</h3>
            <div className="mt-4">
                <p className="text-sm text-slate-600">Utwórz i pobierz pełną kopię zapasową swoich danych.</p>
                <Button onClick={handleBackup} variant="secondary" className="mt-2">Pobierz kopię zapasową (SQL)</Button>
            </div>
            {status && (
                <p className="mt-3 text-accent-700 bg-accent-50 border border-accent-200 rounded-md px-3 py-2 text-sm">{status}</p>
            )}
        </div>
    );
};

export default Settings;
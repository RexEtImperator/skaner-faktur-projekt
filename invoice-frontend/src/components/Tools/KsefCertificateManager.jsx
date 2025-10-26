import React, { useState } from 'react';
import api from '../../api/axiosConfig';

const KsefCertificateManager = () => {
    const [privateKeyFile, setPrivateKeyFile] = useState(null);
    const [publicKeyFile, setPublicKeyFile] = useState(null);
    const [certPassword, setCertPassword] = useState('');
    const [status, setStatus] = useState({ message: '', type: '' });

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!privateKeyFile) {
            setStatus({ message: 'Klucz prywatny jest wymagany.', type: 'error' });
            return;
        }

        const formData = new FormData();
        formData.append('privateKey', privateKeyFile);
        if (publicKeyFile) formData.append('publicKey', publicKeyFile);
        if (certPassword) formData.append('certPassword', certPassword);

        setStatus({ message: 'Przesyłanie certyfikatów...', type: 'info' });
        try {
            const response = await api.post('/certs/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setStatus({ message: response.data.message, type: 'success' });
        } catch (error) {
            setStatus({ message: error.response?.data || 'Błąd przesyłania plików.', type: 'error' });
        }
    };

    return (
        <div className="tool-item">
            <h4>Zarządzanie Certyfikatami KSeF</h4>
            <p>Prześlij swój klucz prywatny (i opcjonalnie certyfikat publiczny) w formacie .pem. Pliki zostaną bezpiecznie zapisane na serwerze.</p>
            <form onSubmit={handleUpload}>
                <label>Klucz prywatny (.pem)</label>
                <input type="file" accept=".pem" onChange={e => setPrivateKeyFile(e.target.files[0])} required />
                
                <label>Certyfikat publiczny (.pem, opcjonalnie)</label>
                <input type="file" accept=".pem" onChange={e => setPublicKeyFile(e.target.files[0])} />

                <label>Hasło do klucza prywatnego (jeśli jest)</label>
                <input type="password" value={certPassword} onChange={e => setCertPassword(e.target.value)} />

                <button type="submit">Prześlij i Zapisz</button>
            </form>
            {status.message && <p className={`tool-status ${status.type}`}>{status.message}</p>}
        </div>
    );
};

export default KsefCertificateManager;
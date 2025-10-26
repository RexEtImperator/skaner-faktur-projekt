import React, { useState } from 'react';
import api from '../../api/axiosConfig';

// Helper do pobierania plików
const downloadFile = (blob, filename) => {
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
};

const Reports = () => {
    const [pdfMonthYear, setPdfMonthYear] = useState(
        `${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getFullYear()}`
    );
    const [status, setStatus] = useState('');

    const handleGeneratePdf = async () => {
        setStatus('Generowanie raportu PDF...');
        try {
            const response = await api.get('/reports/pdf', {
                params: { monthYear: pdfMonthYear },
                responseType: 'blob',
            });
            const filename = `raport-${pdfMonthYear.replace('/', '-')}.pdf`;
            downloadFile(response.data, filename);
            setStatus('Raport PDF został wygenerowany.');
        } catch (error) {
            console.error("Błąd podczas generowania PDF:", error);
            setStatus('Błąd podczas generowania pliku PDF.');
        }
    };

    return (
        <div className="tools-section">
            <h3>Raporty</h3>
            <div className="tool-item">
                <label>Raport PDF za miesiąc:</label>
                <input
                    type="text"
                    value={pdfMonthYear}
                    onChange={(e) => setPdfMonthYear(e.target.value)}
                    placeholder="MM/YYYY"
                />
                <button onClick={handleGeneratePdf}>Generuj PDF</button>
            </div>
            {status && <p className="tool-status">{status}</p>}
        </div>
    );
};

export default Reports;
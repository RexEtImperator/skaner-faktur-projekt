import React, { useState } from 'react';
import api from '../../api/axiosConfig';
import Button from '../ui/Button';

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
    const today = new Date();
    const defaultDayMonthYear = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const [pdfDayMonthYear, setPdfDayMonthYear] = useState(defaultDayMonthYear);
    const [status, setStatus] = useState('');

    const handleGeneratePdf = async () => {
        setStatus('Generowanie raportu PDF...');
        try {
            const response = await api.get('/reports/pdf', {
                params: { dayMonthYear: pdfDayMonthYear },
                responseType: 'blob',
            });
            const filename = `raport-${pdfDayMonthYear.replace(/\//g, '-')}.pdf`;
            downloadFile(response.data, filename);
            setStatus('Raport PDF został wygenerowany.');
        } catch (error) {
            console.error("Błąd podczas generowania PDF:", error);
            setStatus('Błąd podczas generowania pliku PDF.');
        }
    };

    return (
        <div className="">
            <h3>Raporty</h3>
            <div className="tool-item">
                <label>Raport PDF za dzień:</label>
                <input
                    type="text"
                    value={pdfDayMonthYear}
                    onChange={(e) => setPdfDayMonthYear(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="rounded-md border border-slate-300 p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button onClick={handleGeneratePdf} variant="primary" className="mt-2">Generuj PDF</Button>
            </div>
            {status && (
                <p className="mt-3 text-accent-700 bg-accent-50 border border-accent-200 rounded-md px-3 py-2 text-sm">{status}</p>
            )}
        </div>
    );
};

export default Reports;
// src/App.js (nowa, pełna wersja)
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:3000';

function App() {
  const [file, setFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [status, setStatus] = useState('Przeciągnij plik tutaj lub kliknij, aby go wybrać.');
  const [isDragOver, setIsDragOver] = useState(false);

  // Stany do edycji
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // Stany do filtrowania i sortowania
  const [filterQuery, setFilterQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'issue_date', direction: 'descending' });
  
  const [exportMonthYear, setExportMonthYear] = useState(
    `${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getFullYear()}`
  );

  const fetchInvoices = async () => {
    try {
      const response = await axios.get(`${API_URL}/invoices`);
      setInvoices(response.data);
    } catch (error) {
      console.error("Błąd podczas pobierania faktur:", error);
      setStatus('Błąd serwera podczas pobierania danych.');
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleFileChange = (selectedFile) => {
    if (selectedFile) {
      setFile(selectedFile);
      if (selectedFile.type.startsWith('image/')) {
        setPreviewSrc(URL.createObjectURL(selectedFile));
      } else {
        setPreviewSrc(''); // Brak podglądu dla PDF, można dodać ikonę
      }
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setStatus('Najpierw wybierz plik!');
      return;
    }
    const formData = new FormData();
    formData.append('invoice', file);
    try {
      setStatus('Przetwarzanie pliku...');
      const response = await axios.post(`${API_URL}/upload`, formData);
      setStatus(response.data.message);
      fetchInvoices();
      setFile(null);
      setPreviewSrc('');
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      setStatus(`Błąd: ${errorMessage}`);
    }
  };
  
  // Funkcje do Drag & Drop
  const handleDragEvents = (e, over) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(over);
  };
  const handleDrop = (e) => {
    handleDragEvents(e, false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileChange(droppedFile);
  };

  // Funkcje do edycji
  const handleStartEdit = (invoice) => {
    setEditingId(invoice.id);
    // Formatowanie daty dla input[type=date]
    const formattedDate = new Date(invoice.issue_date).toISOString().split('T')[0];
    setEditFormData({ ...invoice, issue_date: formattedDate });
  };
  const handleCancelEdit = () => {
    setEditingId(null);
  };
  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditFormData({ ...editFormData, [name]: value });
  };
  const handleUpdateInvoice = async (id) => {
    try {
      const response = await axios.put(`${API_URL}/invoices/${id}`, editFormData);
      setStatus(response.data.message);
      setEditingId(null);
      fetchInvoices();
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      setStatus(`Błąd: ${errorMessage}`);
    }
  };

  const handleDeleteInvoice = async (id) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę fakturę?')) {
      try {
        const response = await axios.delete(`${API_URL}/invoices/${id}`);
        setStatus(response.data.message);
        fetchInvoices();
      } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        setStatus(`Błąd: ${errorMessage}`);
      }
    }
  };

  // Logika filtrowania i sortowania
  const filteredAndSortedInvoices = useMemo(() => {
    let filtered = [...invoices].filter(inv =>
      inv.invoice_number?.toLowerCase().includes(filterQuery.toLowerCase()) ||
      inv.seller_nip?.toLowerCase().includes(filterQuery.toLowerCase()) ||
      inv.buyer_nip?.toLowerCase().includes(filterQuery.toLowerCase())
    );

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return filtered;
  }, [invoices, filterQuery, sortConfig]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortArrow = (key) => {
    if (sortConfig.key === key) {
        return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    }
    return '';
  }

  const handleExport = async () => { /* ... bez zmian */ };

  return (
    <div className="container">
      <h1>Skaner Faktur</h1>
      
      <div 
        className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => handleDragEvents(e, true)}
        onDragEnter={(e) => handleDragEvents(e, true)}
        onDragLeave={(e) => handleDragEvents(e, false)}
        onDrop={handleDrop}
      >
        <form onSubmit={handleSubmit} className="upload-form">
          <input 
            type="file" 
            id="file-input"
            onChange={(e) => handleFileChange(e.target.files[0])} 
            accept=".pdf,.png,.jpg,.jpeg" 
          />
          <label htmlFor="file-input" className="file-label">
            {file ? file.name : 'Wybierz plik'}
          </label>
          <button type="submit" disabled={!file}>Przetwórz i zapisz</button>
        </form>
        {previewSrc && <img src={previewSrc} alt="Podgląd" className="preview-image"/>}
      </div>

      <div className="status">{status}</div>

      <div className="export-section">
        <h2>Eksport do Excela</h2>
        <input
          type="text"
          value={exportMonthYear}
          onChange={(e) => setExportMonthYear(e.target.value)}
          placeholder="MM/YYYY"
        />
        <button onClick={handleExport}>Eksportuj</button>
      </div>

      <h2>Zapisane faktury</h2>
      <input 
        type="text"
        placeholder="Filtruj po numerze faktury lub NIP..."
        className="filter-input"
        value={filterQuery}
        onChange={(e) => setFilterQuery(e.target.value)}
      />
      
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th onClick={() => requestSort('invoice_number')}>Nr faktury {getSortArrow('invoice_number')}</th>
              <th onClick={() => requestSort('issue_date')}>Data wyst. {getSortArrow('issue_date')}</th>
              <th onClick={() => requestSort('seller_nip')}>NIP Sprzedawcy {getSortArrow('seller_nip')}</th>
              <th onClick={() => requestSort('buyer_nip')}>NIP Nabywcy {getSortArrow('buyer_nip')}</th>
              <th onClick={() => requestSort('gross_amount')}>Kwota brutto {getSortArrow('gross_amount')}</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedInvoices.map((inv) => (
              <tr key={inv.id}>
                {editingId === inv.id ? (
                  <>
                    <td><input type="text" name="invoice_number" value={editFormData.invoice_number} onChange={handleEditFormChange} /></td>
                    <td><input type="date" name="issue_date" value={editFormData.issue_date} onChange={handleEditFormChange} /></td>
                    <td><input type="text" name="seller_nip" value={editFormData.seller_nip} onChange={handleEditFormChange} /></td>
                    <td><input type="text" name="buyer_nip" value={editFormData.buyer_nip} onChange={handleEditFormChange} /></td>
                    <td><input type="number" step="0.01" name="gross_amount" value={editFormData.gross_amount} onChange={handleEditFormChange} /></td>
                    <td>
                      <button className="btn-save" onClick={() => handleUpdateInvoice(inv.id)}>Zapisz</button>
                      <button className="btn-cancel" onClick={handleCancelEdit}>Anuluj</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{inv.invoice_number}</td>
                    <td>{new Date(inv.issue_date).toLocaleDateString('pl-PL')}</td>
                    <td>{inv.seller_nip}</td>
                    <td>{inv.buyer_nip}</td>
                    <td>{parseFloat(inv.gross_amount).toFixed(2)} zł</td>
                    <td>
                      <button className="btn-edit" onClick={() => handleStartEdit(inv)}>Edytuj</button>
                      <button className="btn-delete" onClick={() => handleDeleteInvoice(inv.id)}>Usuń</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
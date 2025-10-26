import React, { useState, useMemo } from 'react';
import api from '../../api/axiosConfig';

// Komponent do wyświetlania szczegółów pozycji faktury
const InvoiceItemsTable = ({ items }) => (
    <div className="invoice-items-container">
        <h4>Pozycje na fakturze:</h4>
        <table className="invoice-items-table">
            <thead>
                <tr>
                    <th>Opis</th>
                    <th>Cena jedn. netto</th>
                    <th>Stawka VAT</th>
                    <th>Wartość netto</th>
                    <th>Kwota VAT</th>
                    <th>Wartość brutto</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item, index) => (
                    <tr key={item.id || index}>
                        <td>{item.description}</td>
                        <td>{parseFloat(item.unit_price_net).toFixed(2)} zł</td>
                        <td>{item.vat_rate}</td>
                        <td>{parseFloat(item.total_net_amount).toFixed(2)} zł</td>
                        <td>{parseFloat(item.total_vat_amount).toFixed(2)} zł</td>
                        <td>{parseFloat(item.total_gross_amount).toFixed(2)} zł</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const InvoiceTable = ({ invoices, categories, onDataChange }) => {
    const [editingId, setEditingId] = useState(null);
    const [expandedId, setExpandedId] = useState(null); // Stan do śledzenia rozwiniętego wiersza
    const [editFormData, setEditFormData] = useState({});
    const [sortConfig, setSortConfig] = useState({ key: 'issue_date', direction: 'descending' });
    const [error, setError] = useState('');

    const sortedInvoices = useMemo(() => {
        let sortableInvoices = [...invoices];
        if (sortConfig.key) {
            sortableInvoices.sort((a, b) => {
                const valA = a[sortConfig.key] || '';
                const valB = b[sortConfig.key] || '';
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableInvoices;
    }, [invoices, sortConfig]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortArrow = (key) => {
        if (sortConfig.key !== key) return '  Arrows';
        return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    };

    const handleStartEdit = (invoice) => {
        setEditingId(invoice.id);
        const formattedIssueDate = invoice.issue_date ? new Date(invoice.issue_date).toISOString().split('T')[0] : '';
        setEditFormData({ ...invoice, issue_date: formattedIssueDate });
        setError('');
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setError('');
    };

    const handleEditFormChange = (e) => {
        const { name, value } = e.target;
        setEditFormData({ ...editFormData, [name]: value });
    };

    const handleUpdateInvoice = async (id) => {
        try {
            await api.put(`/api/invoices/${id}`, editFormData);
            setEditingId(null);
            onDataChange();
        } catch (err) {
            const errorMessage = err.response?.data?.message || "Nie udało się zaktualizować faktury.";
            setError(errorMessage);
        }
    };

    /**
     * Wysyła żądanie usunięcia faktury do backendu.
     */
    const handleDeleteInvoice = async (id) => {
        if (window.confirm('Czy na pewno chcesz trwale usunąć tę fakturę?')) {
            try {
                await api.delete(`/api/invoices/${id}`);
                onDataChange();
            } catch (err) {
                alert(err.response?.data?.message || "Nie udało się usunąć faktury.");
            }
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleDateString('pl-PL', { timeZone: 'UTC' });
    };

    const toggleExpand = (id) => {
        setExpandedId(expandedId === id ? null : id);
    };

    return (
        <div className="table-container">
            {error && <div className="error-message">{error}</div>}
            <table>
                <thead>
                    <tr>
                        <th></th>
                        <th onClick={() => requestSort('invoice_number')}>Nr faktury{getSortArrow('invoice_number')}</th>
                        <th onClick={() => requestSort('issue_date')}>Data wystawienia{getSortArrow('issue_date')}</th>
                        <th onClick={() => requestSort('seller_nip')}>NIP Sprzedawcy{getSortArrow('seller_nip')}</th>
                        <th onClick={() => requestSort('total_net_amount')}>Suma Netto{getSortArrow('total_net_amount')}</th>
                        <th onClick={() => requestSort('total_vat_amount')}>Suma VAT{getSortArrow('total_vat_amount')}</th>
                        <th onClick={() => requestSort('total_gross_amount')}>Suma Brutto{getSortArrow('total_gross_amount')}</th>
                        <th>Akcje</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedInvoices.map((invoice) => (
                        <React.Fragment key={invoice.id}>
                            <tr>
                                {editingId === invoice.id ? (
                                    <>
                                        <td></td>
                                        <td><input type="text" name="invoice_number" value={editFormData.invoice_number || ''} onChange={handleEditFormChange} /></td>
                                        <td><input type="date" name="issue_date" value={editFormData.issue_date || ''} onChange={handleEditFormChange} /></td>
                                        <td><input type="text" name="seller_nip" value={editFormData.seller_nip || ''} onChange={handleEditFormChange} /></td>
                                        <td><input type="number" step="0.01" name="total_net_amount" value={editFormData.total_net_amount || ''} onChange={handleEditFormChange} /></td>
                                        <td><input type="number" step="0.01" name="total_vat_amount" value={editFormData.total_vat_amount || ''} onChange={handleEditFormChange} /></td>
                                        <td><input type="number" step="0.01" name="total_gross_amount" value={editFormData.total_gross_amount || ''} onChange={handleEditFormChange} /></td>
                                        <td>
                                            <button className="btn-save" onClick={() => handleUpdateInvoice(invoice.id)}>Zapisz</button>
                                            <button className="btn-cancel" onClick={handleCancelEdit}>Anuluj</button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td>
                                            {invoice.items && invoice.items.length > 0 && (
                                                <button className="btn-expand" onClick={() => toggleExpand(invoice.id)}>
                                                    {expandedId === invoice.id ? '▼' : '▶'}
                                                </button>
                                            )}
                                        </td>
                                        <td>{invoice.invoice_number}</td>
                                        <td>{formatDate(invoice.issue_date)}</td>
                                        <td>{invoice.seller_nip || '—'}</td>
                                        <td>{invoice.total_net_amount ? `${parseFloat(invoice.total_net_amount).toFixed(2)} zł` : '—'}</td>
                                        <td>{invoice.total_vat_amount ? `${parseFloat(invoice.total_vat_amount).toFixed(2)} zł` : '—'}</td>
                                        <td>{invoice.total_gross_amount ? `${parseFloat(invoice.total_gross_amount).toFixed(2)} zł` : '—'}</td>
                                        <td>
                                            <button className="btn-edit" onClick={() => handleStartEdit(invoice)}>Edytuj</button>
                                            <button className="btn-delete" onClick={() => handleDeleteInvoice(invoice.id)}>Usuń</button>
                                        </td>
                                    </>
                                )}
                            </tr>
                            {expandedId === invoice.id && (
                                <tr>
                                    <td colSpan="8">
                                        <InvoiceItemsTable items={invoice.items} />
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
            {invoices.length === 0 && <p style={{ textAlign: 'center', padding: '20px' }}>Brak faktur do wyświetlenia.</p>}
        </div>
    );
};

export default InvoiceTable;
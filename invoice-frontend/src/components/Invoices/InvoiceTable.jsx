import React, { useState, useMemo } from 'react';
import api from '../../api/axiosConfig';
import Button from '../ui/Button';

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
            // Walidacja: jeśli status = 'zapłacona', termin płatności nie może być w przeszłości
            const status = editFormData.payment_status;
            const due = editFormData.payment_due_date ? new Date(editFormData.payment_due_date) : null;
            if (status === 'zapłacona' && due) {
                const today = new Date();
                // Normalizacja do północy dla porównania dat
                today.setHours(0, 0, 0, 0);
                due.setHours(0, 0, 0, 0);
                if (due < today) {
                    setError("Termin płatności nie może być w przeszłości dla statusu 'zapłacona'.");
                    return;
                }
            }

            // Automatycznie zmień status z 'do_review' na 'niezapłacona' po uzupełnieniu wymaganych pól
            const isComplete = Boolean(editFormData.invoice_number && editFormData.issue_date && editFormData.total_gross_amount);
            const payload = { ...editFormData };
            if (isComplete && (payload.payment_status === 'do_review' || !payload.payment_status)) {
                payload.payment_status = 'niezapłacona';
            }

            await api.put(`/api/invoices/${id}`, payload);
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

    // Frontendowa kalkulacja statusu „po terminie”
    const computeStatus = (status, dueDate) => {
        if (status === 'zapłacona') return 'zapłacona';
        const baseStatus = status || 'niezapłacona';
        if (baseStatus === 'niezapłacona' && dueDate) {
            const due = new Date(dueDate);
            const today = new Date();
            due.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            if (due < today) return 'po terminie';
        }
        return baseStatus;
    };

    const toggleExpand = (id) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const renderStatusBadge = (status) => {
        if (!status) return <span className="text-slate-400">—</span>;
        const common = "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium";
        switch (status) {
            case 'zapłacona':
                return <span className={`${common} border-green-200 bg-green-100 text-green-700`}>Zapłacona</span>;
            case 'niezapłacona':
                return <span className={`${common} border-amber-200 bg-amber-100 text-amber-700`}>Niezapłacona</span>;
            case 'po terminie':
                return <span className={`${common} border-red-200 bg-red-100 text-red-700`}>Po terminie</span>;
            case 'do_review':
                return (
                    <span
                        className={`${common} border-purple-200 bg-purple-100 text-purple-700`}
                        title="Uzupełnij potrzebne wartości"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4 mr-1"
                            aria-hidden="true"
                        >
                            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 12.5h-1.5v-5h1.5v5zm0-6.5h-1.5V6h1.5v2z" />
                        </svg>
                        Do weryfikacji
                    </span>
                );
            default:
                return <span className={`${common} border-accent-200 bg-accent-100 text-accent-700`}>{status}</span>;
        }
    };

    return (
        <div className="table-container">
            {error && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
                    {error}
                </div>
            )}
            <table className="w-full border-collapse table-auto">
                <thead>
                    <tr>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200"></th>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200 cursor-pointer hover:bg-slate-100 select-none" onClick={() => requestSort('invoice_number')}>Nr faktury{getSortArrow('invoice_number')}</th>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200 cursor-pointer hover:bg-slate-100 select-none" onClick={() => requestSort('issue_date')}>Data wystawienia{getSortArrow('issue_date')}</th>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200 cursor-pointer hover:bg-slate-100 select-none" onClick={() => requestSort('seller_nip')}>NIP Sprzedawcy{getSortArrow('seller_nip')}</th>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200 cursor-pointer hover:bg-slate-100 select-none" onClick={() => requestSort('total_net_amount')}>Suma Netto{getSortArrow('total_net_amount')}</th>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200 cursor-pointer hover:bg-slate-100 select-none" onClick={() => requestSort('total_vat_amount')}>Suma VAT{getSortArrow('total_vat_amount')}</th>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200 cursor-pointer hover:bg-slate-100 select-none" onClick={() => requestSort('total_gross_amount')}>Suma Brutto{getSortArrow('total_gross_amount')}</th>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200">Termin płatności</th>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200">Status</th>
                        <th className="bg-slate-50 text-slate-700 font-medium px-3 py-2 border border-slate-200">Akcje</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedInvoices.map((invoice) => (
                        <React.Fragment key={invoice.id}>
                            <tr>
                                {editingId === invoice.id ? (
                                    <>
                                        <td></td>
                                        <td className="px-3 py-2 border border-slate-200"><input className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="text" name="invoice_number" value={editFormData.invoice_number || ''} onChange={handleEditFormChange} /></td>
                                        <td className="px-3 py-2 border border-slate-200"><input className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="date" name="issue_date" value={editFormData.issue_date || ''} onChange={handleEditFormChange} /></td>
                                        <td className="px-3 py-2 border border-slate-200"><input className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="text" name="seller_nip" value={editFormData.seller_nip || ''} onChange={handleEditFormChange} /></td>
                                        <td className="px-3 py-2 border border-slate-200"><input className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="number" step="0.01" name="total_net_amount" value={editFormData.total_net_amount || ''} onChange={handleEditFormChange} /></td>
                                        <td className="px-3 py-2 border border-slate-200"><input className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="number" step="0.01" name="total_vat_amount" value={editFormData.total_vat_amount || ''} onChange={handleEditFormChange} /></td>
                                        <td className="px-3 py-2 border border-slate-200"><input className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="number" step="0.01" name="total_gross_amount" value={editFormData.total_gross_amount || ''} onChange={handleEditFormChange} /></td>
                                        <td className="px-3 py-2 border border-slate-200">
                                            <input
                                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                type="date"
                                                name="payment_due_date"
                                                value={editFormData.payment_due_date ? new Date(editFormData.payment_due_date).toISOString().split('T')[0] : ''}
                                                onChange={handleEditFormChange}
                                                min={editFormData.payment_status === 'zapłacona' ? new Date().toISOString().split('T')[0] : undefined}
                                            />
                                        </td>
                                        <td className="px-3 py-2 border border-slate-200">
                                            <select
                                                name="payment_status"
                                                value={editFormData.payment_status || ''}
                                                onChange={handleEditFormChange}
                                                className="w-full rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="">—</option>
                                                <option value="niezapłacona">Niezapłacona</option>
                                                <option value="zapłacona">Zapłacona</option>
                                                <option value="po terminie">Po terminie</option>
                                            </select>
                                        </td>
                                        <td className="px-3 py-2 border border-slate-200">
                                            <Button variant="primary" size="sm" onClick={() => handleUpdateInvoice(invoice.id)}>Zapisz</Button>
                                            <Button variant="outline" size="sm" onClick={handleCancelEdit} className="ml-2">Anuluj</Button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="px-3 py-2 border border-slate-200">
                                            {invoice.items && invoice.items.length > 0 && (
                                                <Button variant="outline" size="sm" onClick={() => toggleExpand(invoice.id)}>
                                                    {expandedId === invoice.id ? '▼' : '▶'}
                                                </Button>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 border border-slate-200">{invoice.invoice_number}</td>
                                        <td className="px-3 py-2 border border-slate-200">{formatDate(invoice.issue_date)}</td>
                                        <td className="px-3 py-2 border border-slate-200">{invoice.seller_nip || '—'}</td>
                                        <td className="px-3 py-2 border border-slate-200">{invoice.total_net_amount ? `${parseFloat(invoice.total_net_amount).toFixed(2)} zł` : '—'}</td>
                                        <td className="px-3 py-2 border border-slate-200">{invoice.total_vat_amount ? `${parseFloat(invoice.total_vat_amount).toFixed(2)} zł` : '—'}</td>
                                        <td className="px-3 py-2 border border-slate-200">{invoice.total_gross_amount ? `${parseFloat(invoice.total_gross_amount).toFixed(2)} zł` : '—'}</td>
                                        <td className="px-3 py-2 border border-slate-200">{formatDate(invoice.payment_due_date)}</td>
                                        <td className="px-3 py-2 border border-slate-200">{renderStatusBadge(computeStatus(invoice.payment_status, invoice.payment_due_date))}</td>
                                        <td className="px-3 py-2 border border-slate-200">
                                            <Button variant="secondary" size="sm" onClick={() => handleStartEdit(invoice)}>Edytuj</Button>
                                            <Button variant="danger" size="sm" onClick={() => handleDeleteInvoice(invoice.id)} className="ml-2">Usuń</Button>
                                        </td>
                                    </>
                                )}
                            </tr>
                            {expandedId === invoice.id && (
                                <tr>
                                    <td className="px-3 py-2 border border-slate-200" colSpan="10">
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
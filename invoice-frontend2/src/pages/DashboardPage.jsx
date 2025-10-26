import React, { useState, useEffect } from 'react';
import api from '../api/axiosConfig';
import UploadForm from '../components/Invoices/UploadForm';
import InvoiceTable from '../components/Invoices/InvoiceTable';

const DashboardPage = () => {
    const [invoices, setInvoices] = useState([]);
    const [categories, setCategories] = useState([]);
    // ...

    const fetchInvoicesAndCategories = async () => {
        const invRes = await api.get('/invoices');
        const catRes = await api.get('/categories');
        setInvoices(invRes.data);
        setCategories(catRes.data);
    };

    useEffect(() => {
        fetchInvoicesAndCategories();
    }, []);

    return (
        <div className="container">
            {/* ... Navbar ... */}
            <h1>Dashboard</h1>
            <UploadForm categories={categories} onUploadSuccess={fetchInvoicesAndCategories} />
            <InvoiceTable invoices={invoices} categories={categories} onDataChange={fetchInvoicesAndCategories} />
        </div>
    );
};
export default DashboardPage;
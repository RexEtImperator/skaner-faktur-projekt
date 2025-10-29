import React, { useEffect, useState } from 'react';
import api from '../../api/axiosConfig';
import Button from '../ui/Button';

const Categories = () => {
    const [categories, setCategories] = useState([]);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [status, setStatus] = useState('');

    const loadCategories = async () => {
        try {
            const res = await api.get('/categories');
            setCategories(res.data);
        } catch (err) {
            setStatus('Nie udało się pobrać kategorii.');
        }
    };

    useEffect(() => {
        loadCategories();
    }, []);

    const handleAdd = async () => {
        const name = newCategoryName.trim();
        if (!name) return;
        setStatus('Dodawanie kategorii...');
        try {
            await api.post('/categories', { name });
            setNewCategoryName('');
            await loadCategories();
            setStatus('Kategoria dodana.');
        } catch (err) {
            setStatus(err.response?.data?.message || 'Błąd podczas dodawania.');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Usunąć tę kategorię?')) return;
        setStatus('Usuwanie kategorii...');
        try {
            await api.delete(`/categories/${id}`);
            await loadCategories();
            setStatus('Kategoria usunięta.');
        } catch (err) {
            setStatus(err.response?.data?.message || 'Błąd podczas usuwania.');
        }
    };

    return (
        <div>
            <h3 className="text-lg font-semibold text-slate-800">Kategorie</h3>
            <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Dodaj nową kategorię:</label>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Nazwa kategorii"
                        className="rounded-md border border-slate-300 p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button onClick={handleAdd} variant="primary">Dodaj</Button>
                </div>
            </div>

            <div className="mt-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Aktualne kategorie:</label>
                {categories.length === 0 ? (
                    <p className="text-slate-600 text-sm">Brak kategorii.</p>
                ) : (
                    <ul className="list-none p-0">
                        {categories.map((cat) => (
                            <li key={cat.id} className="flex justify-between items-center py-1.5 border-b border-slate-200">
                                <span>{cat.name}</span>
                                <Button title="Usuń" onClick={() => handleDelete(cat.id)} variant="outline" size="sm">Usuń</Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {status && (
                <p className="mt-3 text-accent-700 bg-accent-50 border border-accent-200 rounded-md px-3 py-2 text-sm">{status}</p>
            )}
        </div>
    );
};

export default Categories;
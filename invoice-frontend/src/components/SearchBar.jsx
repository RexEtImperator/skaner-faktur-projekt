import React, { useState } from 'react';
import Button from './ui/Button';

const SearchBar = ({ onSearch, onClear }) => {
    const [query, setQuery] = useState('');

    const handleSearch = (e) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    const handleClear = () => {
        setQuery('');
        onClear();
    }

    return (
        <form onSubmit={handleSearch} className="flex gap-2 items-center mb-4" role="search">
            <label htmlFor="invoiceSearch" className="sr-only">Wyszukaj fakturę lub NIP</label>
            <input
                type="text"
                id="invoiceSearch"
                name="invoiceSearch"
                placeholder="Szukaj po numerze faktury lub NIP..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button type="submit" variant="secondary">Szukaj</Button>
            <Button type="button" variant="outline" onClick={handleClear}>Wyczyść</Button>
        </form>
    );
};

export default SearchBar;
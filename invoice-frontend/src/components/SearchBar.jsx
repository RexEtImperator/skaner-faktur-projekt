import React, { useState } from 'react';

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
        <form onSubmit={handleSearch} className="search-bar">
            <input
                type="text"
                placeholder="Szukaj po numerze faktury lub NIP..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit">Szukaj</button>
            <button type="button" onClick={handleClear}>Wyczyść</button>
        </form>
    );
};

export default SearchBar;
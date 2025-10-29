import React, { useState, useEffect } from 'react';
import Button from '../ui/Button';

/**
 * Komponent paska filtrów dla tabeli faktur.
 * Umożliwia filtrowanie po zapytaniu tekstowym, zakresie dat i kategorii.
 *
 * @param {object} props
 * @param {Array} props.categories - Lista dostępnych kategorii do wyboru.
 * @param {Function} props.onFilterChange - Funkcja zwrotna wywoływana przy każdej zmianie filtrów.
 */
const FilterBar = ({ categories, onFilterChange }) => {
    // Stan przechowujący aktualne wartości wszystkich filtrów
    const [filters, setFilters] = useState({
        query: '',
        startDate: '',
        endDate: '',
        categoryId: 'all' // 'all' oznacza brak filtrowania po kategorii
    });

    /**
     * Efekt, który wywołuje funkcję onFilterChange za każdym razem,
     * gdy stan `filters` ulegnie zmianie.
     * Dzięki temu filtrowanie odbywa się na bieżąco.
     */
    useEffect(() => {
        // Przekazujemy aktualny stan filtrów do komponentu nadrzędnego.
        onFilterChange(filters);
    }, [filters, onFilterChange]);

    /**
     * Obsługuje zmiany w polach input i select, aktualizując stan `filters`.
     */
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFilters(prevFilters => ({
            ...prevFilters,
            [name]: value
        }));
    };

    /**
     * Resetuje wszystkie filtry do wartości początkowych.
     */
    const handleReset = () => {
        setFilters({
            query: '',
            startDate: '',
            endDate: '',
            categoryId: 'all'
        });
    };

    return (
        <div className="flex flex-wrap gap-4 p-4 bg-slate-50 rounded-lg">
            {/* Filtr tekstowy */}
            <div className="flex flex-col gap-1">
                <label htmlFor="query">Wyszukaj</label>
                <input
                    type="text"
                    id="query"
                    name="query"
                    placeholder="Nr faktury, NIP, nazwa..."
                    value={filters.query}
                    onChange={handleChange}
                    className="rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Filtr po dacie "od" */}
            <div className="flex flex-col gap-1">
                <label htmlFor="startDate">Data od</label>
                <input
                    type="date"
                    id="startDate"
                    name="startDate"
                    value={filters.startDate}
                    onChange={handleChange}
                    className="rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Filtr po dacie "do" */}
            <div className="flex flex-col gap-1">
                <label htmlFor="endDate">Data do</label>
                <input
                    type="date"
                    id="endDate"
                    name="endDate"
                    value={filters.endDate}
                    onChange={handleChange}
                    className="rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Filtr po kategorii */}
            <div className="flex flex-col gap-1">
                <label htmlFor="categoryId">Kategoria</label>
                <select
                    id="categoryId"
                    name="categoryId"
                    value={filters.categoryId}
                    onChange={handleChange}
                    className="rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">Wszystkie kategorie</option>
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                </select>
            </div>

            {/* Przycisk do resetowania filtrów */}
            <div className="flex items-end">
                <Button onClick={handleReset} variant="outline">Wyczyść filtry</Button>
            </div>
        </div>
    );
};

export default FilterBar;
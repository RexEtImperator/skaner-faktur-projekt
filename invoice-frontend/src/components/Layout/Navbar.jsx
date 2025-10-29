import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { HomeIcon, ChevronDownIcon, ChartBarIcon, WrenchScrewdriverIcon, BuildingOffice2Icon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import Button from '../ui/Button';

/**
 * Komponent paska nawigacyjnego (Navbar).
 * Wyświetla logo aplikacji oraz informacje o użytkowniku i przycisk wylogowania,
 * jeśli użytkownik jest zalogowany.
 */
const Navbar = () => {
    // Pobieramy stan autoryzacji oraz dane użytkownika i funkcję wylogowania z kontekstu.
    const { isAuthenticated, user, logout } = useAuth();

    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    const firstItemRef = useRef(null);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (!open) return;
            if (e.key === 'Escape') {
                setOpen(false);
                buttonRef.current?.focus();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                firstItemRef.current?.focus();
            }
        };
        const onClickOutside = (e) => {
            if (!open) return;
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                !buttonRef.current?.contains(e.target)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onClickOutside);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onClickOutside);
        };
    }, [open]);

    return (
        <header className="bg-slate-800 text-white border-b border-slate-700">
            <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Link to="/" className="text-white font-semibold tracking-wide flex items-center gap-2">
                        <HomeIcon className="h-5 w-5" />
                        Skaner Faktur
                    </Link>
                </div>

                {isAuthenticated && user ? (
                    <div className="flex items-center gap-6">
                        <Link to="/" className="text-slate-100 hover:text-white flex items-center gap-2">
                            <HomeIcon className="h-5 w-5" />
                            Strona główna
                        </Link>

                        <div className="relative">
                            <button
                                type="button"
                                ref={buttonRef}
                                className="flex items-center gap-2 text-slate-100 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 rounded"
                                aria-haspopup="menu"
                                aria-expanded={open}
                                aria-controls="navbar-settings-menu"
                                onClick={() => setOpen((v) => !v)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setOpen(true);
                                        // fokus przeniesiemy w efektach na pierwszy element
                                    }
                                }}
                            >
                                <WrenchScrewdriverIcon className="h-5 w-5" />
                                Ustawienia
                                <ChevronDownIcon className="h-4 w-4" />
                            </button>
                            {open && (
                                <div
                                    id="navbar-settings-menu"
                                    ref={menuRef}
                                    role="menu"
                                    aria-label="Menu ustawień"
                                    className="absolute right-0 mt-2 w-64 rounded-md bg-white text-slate-900 shadow-lg ring-1 ring-black/5"
                                >
                                    <div className="py-2">
                                        <Link
                                            to="/settings/reports"
                                            ref={firstItemRef}
                                            role="menuitem"
                                            tabIndex={-1}
                                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                                            onClick={() => setOpen(false)}
                                        >
                                            <ChartBarIcon className="h-5 w-5" />
                                            Raporty
                                        </Link>
                                        <Link
                                            to="/settings/tools"
                                            role="menuitem"
                                            tabIndex={-1}
                                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                                            onClick={() => setOpen(false)}
                                        >
                                            <WrenchScrewdriverIcon className="h-5 w-5" />
                                            Ustawienia i Narzędzia
                                        </Link>
                                        <Link
                                            to="/settings/ksef"
                                            role="menuitem"
                                            tabIndex={-1}
                                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                                            onClick={() => setOpen(false)}
                                        >
                                            <BuildingOffice2Icon className="h-5 w-5" />
                                            Zarządzanie Integracją z KSeF
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </div>

                        <span className="text-slate-300">
                            Zalogowano jako: <strong>{user.email}</strong>
                        </span>
                        <Button onClick={logout} variant="outline" size="md" className="text-slate-100 border-slate-300 hover:bg-slate-700">
                            <ArrowRightOnRectangleIcon className="h-5 w-5" />
                            Wyloguj
                        </Button>
                    </div>
                ) : (
                    <div className="text-slate-300">Witaj w aplikacji</div>
                )}
            </div>
        </header>
    );
};

// Dodajmy proste style bezpośrednio w komponencie dla przycisku,
// aby uniknąć tworzenia dedykowanych klas w App.css, jeśli nie jest to konieczne.
// Można je oczywiście przenieść do App.css.

// Przykładowe style, które mogłyby się znaleźć w App.css dla .btn-logout:
/*
.btn-logout {
    background-color: transparent;
    border: 1px solid #fff;
    color: #fff;
    font-weight: normal;
    padding: 8px 16px;
}
.btn-logout:hover {
    background-color: rgba(255, 255, 255, 0.1);
    transform: translateY(0); // Nadpisanie ogólnego efektu hover dla przycisków
}
*/

export default Navbar;
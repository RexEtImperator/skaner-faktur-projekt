import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Komponent paska nawigacyjnego (Navbar).
 * Wyświetla logo aplikacji oraz informacje o użytkowniku i przycisk wylogowania,
 * jeśli użytkownik jest zalogowany.
 */
const Navbar = () => {
    // Pobieramy stan autoryzacji oraz dane użytkownika i funkcję wylogowania z kontekstu.
    const { isAuthenticated, user, logout } = useAuth();

    return (
        <header className="navbar">
            <div className="navbar-brand">
                {/* Link do strony głównej, który jest jednocześnie logiem aplikacji */}
                <Link to="/" className="logo" style={{ textDecoration: 'none', color: 'white' }}>
                    Skaner Faktur
                </Link>
            </div>

            <div className="navbar-menu">
                {/* Ta sekcja jest renderowana warunkowo - tylko dla zalogowanych użytkowników */}
                {isAuthenticated && user ? (
                    <div className="nav-links">
                        <span className="user-email">
                            Zalogowano jako: <strong>{user.email}</strong>
                        </span>
                        <button 
                            onClick={logout} 
                            className="btn-logout" 
                            style={{ 
                                backgroundColor: 'transparent', 
                                border: '1px solid white', 
                                color: 'white' 
                            }}
                        >
                            Wyloguj
                        </button>
                    </div>
                ) : (
                    // Opcjonalnie: można tu umieścić linki do logowania/rejestracji,
                    // jeśli navbar miałby być widoczny również na stronach publicznych.
                    // W naszym przypadku jest on renderowany tylko w DashboardPage, więc ta część jest rzadko widoczna.
                    <div className="nav-links">
                        <span>Witaj w aplikacji</span>
                    </div>
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
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Komponent "strażnika" trasy (Route Guard).
 * Odpowiada za ochronę komponentów, które wymagają uwierzytelnienia.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Komponent, który ma być renderowany, jeśli użytkownik jest zalogowany.
 * @returns {React.ReactNode} - Zwraca chroniony komponent (children) lub przekierowanie na stronę logowania.
 */
const ProtectedRoute = ({ children }) => {
    // Pobieramy stan autoryzacji z naszego globalnego kontekstu
    const { isAuthenticated, isLoading } = useAuth();

    // KROK 1: Obsługa stanu ładowania przy inicjalizacji aplikacji.
    // Gdy aplikacja startuje, AuthContext sprawdza, czy w localStorage jest zapisany token.
    // Dopóki ten proces się nie zakończy (isLoading === true), nie chcemy niczego renderować,
    // aby uniknąć sytuacji, w której użytkownik na ułamek sekundy zobaczy dashboard,
    // zanim zostanie przekierowany na stronę logowania.
    if (isLoading) {
        // W bardziej rozbudowanej aplikacji można tu umieścić komponent spinnera
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                Ładowanie aplikacji...
            </div>
        );
    }

    // KROK 2: Sprawdzenie, czy użytkownik jest uwierzytelniony.
    // Jeśli stan ładowania się zakończył i wiemy, że użytkownik NIE jest zalogowany...
    if (!isAuthenticated) {
        // ...przekierowujemy go na stronę logowania.
        // Użycie atrybutu `replace` jest dobrą praktyką, ponieważ zastępuje on
        // bieżącą lokalizację w historii przeglądarki, co oznacza, że użytkownik
        // nie będzie mógł użyć przycisku "wstecz", aby wrócić do chronionej strony,
        // z której został właśnie przekierowany.
        return <Navigate to="/login" replace />;
    }

    // KROK 3: Użytkownik jest zalogowany.
    // Jeśli kod dotarł do tego miejsca, oznacza to, że isLoading jest false,
    // a isAuthenticated jest true. Użytkownik ma dostęp.
    // Renderujemy komponent, który został przekazany jako "children".
    return children;
};

export default ProtectedRoute;
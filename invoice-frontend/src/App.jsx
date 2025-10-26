import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import DashboardPage from './pages/DashboardPage';
import LoginPage from './components/Auth/LoginPage';
import RegisterPage from './components/Auth/RegisterPage';

import './App.css';

/**
 * Komponent ProtectedRoute
 * Odpowiada za ochronę tras, które wymagają uwierzytelnienia.
 * Jeśli użytkownik nie jest zalogowany, przekierowuje go na stronę logowania.
 */
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();

    // Nie renderujemy nic, dopóki kontekst autoryzacji nie zakończy sprawdzania
    // tokena przy pierwszym ładowaniu aplikacji.
    if (isLoading) {
        return <div>Ładowanie aplikacji...</div>; // Lub bardziej zaawansowany spinner/loader
    }

    if (!isAuthenticated) {
        // Zapisz ścieżkę, do której użytkownik chciał dotrzeć, aby przekierować go tam po zalogowaniu
        return <Navigate to="/login" replace />;
    }

    return children;
};

/**
 * Komponent PublicRoute
 * Odpowiada za trasy publiczne, takie jak logowanie i rejestracja.
 * Jeśli zalogowany użytkownik spróbuje wejść na stronę logowania,
 * zostanie automatycznie przekierowany na stronę główną.
 */
const PublicRoute = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();
    
    if (isLoading) {
        return <div>Ładowanie aplikacji...</div>;
    }

    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    return children;
};

/**
 * Główny komponent aplikacji
 * Definiuje strukturę i routing całej aplikacji.
 */
function App() {
    return (
        // AuthProvider udostępnia kontekst autoryzacji wszystkim komponentom potomnym.
        <AuthProvider>
            <Routes>
                    {/* Trasy publiczne (dostępne dla niezalogowanych) */}
                    <Route
                        path="/login"
                        element={
                            <PublicRoute>
                                <LoginPage />
                            </PublicRoute>
                        }
                    />
                    <Route
                        path="/register"
                        element={
                            <PublicRoute>
                                <RegisterPage />
                            </PublicRoute>
                        }
                    />

                    {/* Trasa chroniona (dostępna tylko dla zalogowanych) */}
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <DashboardPage />
                            </ProtectedRoute>
                        }
                    />
                    
                    {/* Przekierowanie dla każdej innej, nieznanej ścieżki */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
        </AuthProvider>
    );
}

export default App;
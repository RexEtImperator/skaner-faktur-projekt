import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';

// 1. Tworzymy kontekst
const AuthContext = createContext(null);

// 2. Tworzymy "Dostawcę" (Provider) - komponent, który będzie otaczał naszą aplikację
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true); // Stan do sprawdzania, czy sesja jest weryfikowana
    const navigate = useNavigate();

    // Efekt uruchamiany tylko raz, przy pierwszym załadowaniu aplikacji
    useEffect(() => {
        const initializeAuth = async () => {
            const token = localStorage.getItem('authToken');
            
            if (token) {
                try {
                    // Weryfikacja tokena po stronie backendu byłaby jeszcze bezpieczniejsza,
                    // ale na potrzeby aplikacji klienckiej odczytanie danych z local storage jest dobrym punktem startowym.
                    // Zakładamy, że token jest poprawny, jeśli istnieje. Axios interceptor obsłuży błąd, jeśli token wygasł.
                    const storedUser = JSON.parse(localStorage.getItem('user'));
                    if (storedUser) {
                        setUser(storedUser);
                    } else {
                        // Jeśli jest token, ale nie ma danych użytkownika, wylogowujemy
                        localStorage.removeItem('authToken');
                    }
                } catch (error) {
                    console.error("Błąd podczas inicjalizacji autoryzacji:", error);
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('user');
                }
            }
            setIsLoading(false); // Kończymy ładowanie, niezależnie od wyniku
        };

        initializeAuth();
    }, []);

    // Funkcja logowania
    const login = async (email, password) => {
        try {
            const response = await api.post('/login', { email, password });
            const { token, user: userData } = response.data;

            // Zapisz token i dane użytkownika w localStorage
            localStorage.setItem('authToken', token);
            localStorage.setItem('user', JSON.stringify(userData));

            // Ustaw dane użytkownika w stanie
            setUser(userData);
            
            // Przekieruj na stronę główną
            navigate('/');
        } catch (error) {
            // Rzuć błąd dalej, aby komponent LoginPage mógł go obsłużyć i wyświetlić komunikat
            throw error;
        }
    };

    // Funkcja wylogowywania
    const logout = () => {
        // Wyczyść stan i localStorage
        setUser(null);
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');

        // Przekieruj na stronę logowania
        navigate('/login');
    };

    // 3. Definiujemy wartość, którą kontekst będzie udostępniał potomnym komponentom
    const value = {
        user,
        isLoading,
        isAuthenticated: !!user, // Prosty getter, zwraca true jeśli user istnieje, false w przeciwnym razie
        login,
        logout
    };

    // Zwracamy Providera, który "opakowuje" resztę aplikacji (children)
    // Nie renderujemy nic, dopóki stan ładowania nie zostanie zakończony,
    // aby uniknąć migotania interfejsu (np. krótkiego pokazania dashboardu przed przekierowaniem do logowania).
    return (
        <AuthContext.Provider value={value}>
            {!isLoading && children}
        </AuthContext.Provider>
    );
};

// 4. Tworzymy niestandardowy hook, aby ułatwić korzystanie z kontekstu w innych komponentach
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
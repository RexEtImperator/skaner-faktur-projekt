import axios from 'axios';

// 1. Stworzenie skonfigurowanej instancji Axios.
//    Wszystkie zapytania wysyłane przez 'api' będą domyślnie kierowane
//    na adres 'http://localhost:3000/api'.
const api = axios.create({
    baseURL: import.meta.env?.VITE_API_URL || 'http://localhost:3000/api',
});

// 2. Konfiguracja "interceptora" dla zapytań wychodzących.
//    Ta funkcja jest wywoływana PRZED wysłaniem każdego zapytania.
api.interceptors.request.use(
    (config) => {
        // Pobierz token autoryzacyjny z localStorage.
        const token = localStorage.getItem('authToken');

        // Jeśli token istnieje, dołącz go do nagłówka 'Authorization'
        // w standardowym formacie 'Bearer'.
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        // Zwróć zmodyfikowaną konfigurację, aby zapytanie mogło być kontynuowane.
        return config;
    },
    (error) => {
        // Jeśli wystąpi błąd podczas przygotowywania zapytania, odrzuć promise.
        return Promise.reject(error);
    }
);

// 3. Konfiguracja "interceptora" dla odpowiedzi przychodzących.
//    Ta funkcja jest wywoływana PO otrzymaniu odpowiedzi z serwera.
api.interceptors.response.use(
    (response) => {
        // Jeśli odpowiedź jest pomyślna (status 2xx), po prostu ją zwróć.
        return response;
    },
    (error) => {
        // Sprawdź, czy błąd dotyczy autoryzacji.
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Token jest nieprawidłowy, wygasł lub użytkownik nie ma uprawnień.
            // Wyloguj użytkownika, czyszcząc dane sesji.
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            
            // Przekieruj na stronę logowania.
            // Używamy `window.location.replace`, ponieważ jesteśmy poza kontekstem React Router.
            // To jest twarde przeładowanie strony, które jest w tym przypadku pożądane.
            window.location.replace('/api/login');
            console.error("Błąd autoryzacji - wylogowywanie.");
        }
        
        // Dla wszystkich innych błędów, po prostu odrzuć promise,
        // aby mogły być obsłużone w miejscu wywołania (np. w bloku catch).
        return Promise.reject(error);
    }
);
// 4. Eksport skonfigurowanej instancji Axios do użycia w innych częściach aplikacji.
export default api;
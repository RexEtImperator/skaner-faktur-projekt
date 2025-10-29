import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import Card from '../ui/Card';

const RegisterPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        try {
            await register(email, password);
            setMessage('Rejestracja pomyślna! Możesz się teraz zalogować.');
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err.message || 'Nie udało się zarejestrować. Spróbuj ponownie.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md">
                <Card>
                    <form onSubmit={handleSubmit}>
                        <h2 className="text-xl font-semibold text-slate-800">Rejestracja</h2>
                        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
                        {message && <p className="text-green-600 text-sm mt-2">{message}</p>}
                        <div className="mt-4">
                            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="rounded-md border border-slate-300 p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="mt-4">
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Hasło</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="rounded-md border border-slate-300 p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <Button type="submit" variant="primary" size="md" className="w-full mt-4">Zarejestruj się</Button>
                        <p className="text-center text-sm text-slate-600 mt-4">
                            Masz już konto? <a href="/login" className="text-blue-600 hover:underline">Zaloguj się</a>
                        </p>
                    </form>
                </Card>
            </div>
        </div>
    );
};

export default RegisterPage;

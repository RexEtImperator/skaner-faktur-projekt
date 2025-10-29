import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import Card from '../ui/Card';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError(err.message || 'Nie udało się zalogować. Sprawdź swoje dane.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md">
                <Card>
                    <form onSubmit={handleSubmit}>
                        <h2 className="text-xl font-semibold text-slate-800">Logowanie</h2>
                        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
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
                        <Button type="submit" variant="primary" size="md" className="w-full mt-4">Zaloguj się</Button>
                        <p className="text-center text-sm text-slate-600 mt-4">
                            Nie masz konta? <a href="/register" className="text-blue-600 hover:underline">Zarejestruj się</a>
                        </p>
                    </form>
                </Card>
            </div>
        </div>
    );
};

export default LoginPage;

import React from 'react';
import Navbar from '../components/Layout/Navbar';
import Settings from '../components/Tools/Settings';
import Categories from '../components/Tools/Categories';
import Card from '../components/ui/Card';

const ToolsSettingsPage = () => {
    return (
        <>
            <Navbar />
            <main className="mx-auto max-w-7xl bg-white p-6 rounded-lg shadow">
                <h1 className="text-2xl font-semibold text-slate-800">Ustawienia i Narzędzia</h1>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <Settings />
                    </Card>
                    <Card>
                        <Categories />
                    </Card>
                </div>
            </main>
        </>
    );
};

export default ToolsSettingsPage;
import React from 'react';
import Navbar from '../components/Layout/Navbar';
import Reports from '../components/Tools/Reports';
import Settings from '../components/Tools/Settings';
import KsefManager from '../components/Tools/KsefManager';
import Categories from '../components/Tools/Categories';
import Card from '../components/ui/Card';

const SettingsPage = () => {
    return (
        <>
            <Navbar />
            <main className="mx-auto max-w-7xl bg-white p-6 rounded-lg shadow">
                <h1 className="text-2xl font-semibold text-slate-800">Ustawienia</h1>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <Reports />
                    </Card>
                    <Card>
                        <Settings />
                    </Card>
                </div>
                <KsefManager />
                <div className="mt-6">
                    <Card>
                        <Categories />
                    </Card>
                </div>
            </main>
        </>
    );
};

export default SettingsPage;
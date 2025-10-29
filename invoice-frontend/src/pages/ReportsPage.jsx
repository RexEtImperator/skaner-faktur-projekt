import React from 'react';
import Navbar from '../components/Layout/Navbar';
import Reports from '../components/Tools/Reports';
import Card from '../components/ui/Card';

const ReportsPage = () => {
    return (
        <>
            <Navbar />
            <main className="mx-auto max-w-7xl bg-white p-6 rounded-lg shadow">
                <h1 className="text-2xl font-semibold text-slate-800">Raporty</h1>
                <div className="mt-6">
                    <Card>
                        <Reports />
                    </Card>
                </div>
            </main>
        </>
    );
};

export default ReportsPage;
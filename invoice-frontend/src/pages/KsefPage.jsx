import React from 'react';
import Navbar from '../components/Layout/Navbar';
import KsefManager from '../components/Tools/KsefManager';

const KsefPage = () => {
    return (
        <>
            <Navbar />
            <main className="container">
                <h1>Zarządzanie Integracją z KSeF</h1>
                <KsefManager />
            </main>
        </>
    );
};

export default KsefPage;
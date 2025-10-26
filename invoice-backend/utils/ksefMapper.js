const get = (obj, path, defaultValue = null) => {
    const value = path.split('.').reduce((a, b) => (a ? a[b] : undefined), obj);
    return value && value._text ? value._text : defaultValue;
};

exports.mapKsefFaVatToDbModel = (ksefJson) => {
    const fa = ksefJson.Faktura.Fa;
    const podmiot1 = ksefJson.Faktura.Podmiot1;
    const podmiot2 = ksefJson.Faktura.Podmiot2;

    const invoice = {
        ksefReferenceNumber: get(ksefJson.Faktura.Naglowek, 'NumerKSeF'),
        invoiceNumber: get(fa, 'P_2'),
        issueDate: get(fa, 'P_1'),
        issuePlace: get(fa, 'P_1M'),
        sellerName: get(podmiot1, 'DaneIdentyfikacyjne.Nazwa'),
        sellerNip: get(podmiot1, 'DaneIdentyfikacyjne.NIP'),
        sellerAddress: `${get(podmiot1.Adres, 'Ulica')} ${get(podmiot1.Adres, 'NrDomu')}, ${get(podmiot1.Adres, 'KodPocztowy')} ${get(podmiot1.Adres, 'Miejscowosc')}`,
        buyerName: get(podmiot2, 'DaneIdentyfikacyjne.Nazwa'),
        buyerNip: get(podmiot2, 'DaneIdentyfikacyjne.NIP'),
        buyerAddress: `${get(podmiot2.Adres, 'Ulica')} ${get(podmiot2.Adres, 'NrDomu')}, ${get(podmiot2.Adres, 'KodPocztowy')} ${get(podmiot2.Adres, 'Miejscowosc')}`,
        netAmount: parseFloat(get(fa, 'P_13_1', 0)),
        vatAmount: parseFloat(get(fa, 'P_14_1', 0)),
        grossAmount: parseFloat(get(fa, 'P_15', 0)),
        currencyCode: get(fa, 'KodWaluty'),
        paymentDueDate: get(fa, 'TerminPlatnosci'),
        paymentType: get(fa, 'RodzajPlatnosci'),
        accountNumber: get(fa, 'NumerKonta'),
        items: []
    };
    
    let wiersze = fa.FaWiersz;
    if (wiersze && !Array.isArray(wiersze)) {
        wiersze = [wiersze];
    }
    
    if (wiersze) {
        invoice.items = wiersze.map(w => ({
            name: get(w, 'P_7'),
            quantity: parseInt(get(w, 'P_8A', 1)),
            unit: get(w, 'P_8B'),
            netPrice: parseFloat(get(w, 'P_9A', 0)),
            netValue: parseFloat(get(w, 'P_11', 0)),
            vatRate: get(w, 'P_12'),
        }));
    }

    return invoice;
};
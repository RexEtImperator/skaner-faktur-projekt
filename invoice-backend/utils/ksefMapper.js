const get = (obj, path, defaultValue = null) => {
    const value = path.split('.').reduce((a, b) => (a ? a[b] : undefined), obj);
    return value && value._text ? value._text : defaultValue;
};

const toNumber = (val, fallback = 0) => {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : fallback;
};

const toDayMonthYear = (isoDate) => {
    if (!isoDate) return null;
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return null;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
};

exports.mapKsefFaVatToDbModel = (ksefJson) => {
    const fa = ksefJson.Faktura?.Fa || {};
    const podmiot1 = ksefJson.Faktura?.Podmiot1 || {};
    const podmiot2 = ksefJson.Faktura?.Podmiot2 || {};

    const issueDate = get(fa, 'P_1');
    const deliveryDate = get(fa, 'P_6');

    const invoiceData = {
        invoice_number: get(fa, 'P_2'),
        issue_date: issueDate,
        seller_nip: get(podmiot1, 'DaneIdentyfikacyjne.NIP'),
        buyer_nip: get(podmiot2, 'DaneIdentyfikacyjne.NIP'),
        seller_name: get(podmiot1, 'DaneIdentyfikacyjne.PelnaNazwa') || get(podmiot1, 'DaneIdentyfikacyjne.Nazwa', null),
        buyer_name: get(podmiot2, 'DaneIdentyfikacyjne.PelnaNazwa') || get(podmiot2, 'DaneIdentyfikacyjne.Nazwa', null),
        delivery_date: deliveryDate,
        total_net_amount: toNumber(get(fa, 'P_13_1', 0)),
        total_vat_amount: toNumber(get(fa, 'P_14_1', 0)),
        total_gross_amount: toNumber(get(fa, 'P_15', 0)),
        currency: get(fa, 'KodWaluty') || 'PLN',
        day_month_year: toDayMonthYear(issueDate)
    };

    let rows = fa.FaWiersz;
    if (rows && !Array.isArray(rows)) {
        rows = [rows];
    }

    const itemsData = (rows || []).map(w => {
        const description = get(w, 'P_7');
        const quantity = toNumber(get(w, 'P_8A', 1), 1);
        const unit = get(w, 'P_8B', 'szt');
        const unit_price_net = toNumber(get(w, 'P_9A', 0));
        const total_net_amount = toNumber(get(w, 'P_11', 0));
        const vat_rate_str = get(w, 'P_12');
        const vat_rate_num = toNumber(vat_rate_str, 0);
        const total_vat_amount = Number.isFinite(vat_rate_num) ? (total_net_amount * vat_rate_num / 100) : 0;
        const total_gross_amount = total_net_amount + total_vat_amount;
        return {
            description,
            quantity,
            unit,
            catalog_number: null,
            unit_price_net,
            vat_rate: vat_rate_str,
            total_net_amount,
            total_vat_amount,
            total_gross_amount
        };
    });

    return { invoiceData, itemsData };
};
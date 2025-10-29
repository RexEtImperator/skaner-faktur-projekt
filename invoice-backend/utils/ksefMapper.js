const get = (obj, path, defaultValue = null) => {
    const value = path.split('.').reduce((a, b) => (a ? a[b] : undefined), obj);
    return value && value._text ? value._text : defaultValue;
};

const toNumber = (val, fallback = 0) => {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : fallback;
};

const toMonthYear = (isoDate) => {
    if (!isoDate) return null;
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return null;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${mm}/${yyyy}`;
};

exports.mapKsefFaVatToDbModel = (ksefJson) => {
    const fa = ksefJson.Faktura?.Fa || {};
    const podmiot1 = ksefJson.Faktura?.Podmiot1 || {};
    const podmiot2 = ksefJson.Faktura?.Podmiot2 || {};

    const issueDate = get(fa, 'P_1');

    const invoiceData = {
        invoice_number: get(fa, 'P_2'),
        issue_date: issueDate,
        seller_nip: get(podmiot1, 'DaneIdentyfikacyjne.NIP'),
        buyer_nip: get(podmiot2, 'DaneIdentyfikacyjne.NIP'),
        total_net_amount: toNumber(get(fa, 'P_13_1', 0)),
        total_vat_amount: toNumber(get(fa, 'P_14_1', 0)),
        total_gross_amount: toNumber(get(fa, 'P_15', 0)),
        month_year: toMonthYear(issueDate)
    };

    let rows = fa.FaWiersz;
    if (rows && !Array.isArray(rows)) {
        rows = [rows];
    }

    const itemsData = (rows || []).map(w => {
        const description = get(w, 'P_7');
        const quantity = toNumber(get(w, 'P_8A', 1), 1);
        const unit_price_net = toNumber(get(w, 'P_9A', 0));
        const total_net_amount = toNumber(get(w, 'P_11', 0));
        const vat_rate_str = get(w, 'P_12');
        const vat_rate_num = toNumber(vat_rate_str, 0);
        const total_vat_amount = Number.isFinite(vat_rate_num) ? (total_net_amount * vat_rate_num / 100) : 0;
        const total_gross_amount = total_net_amount + total_vat_amount;
        return {
            description,
            quantity,
            unit_price_net,
            vat_rate: vat_rate_str,
            total_net_amount,
            total_vat_amount,
            total_gross_amount
        };
    });

    return { invoiceData, itemsData };
};
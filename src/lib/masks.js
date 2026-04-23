/** @param {string} value */
export function maskPhone(value) {
    const d = String(value ?? '').replace(/\D/g, '').slice(0, 11);
    if (d.length <= 10) {
        return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    }
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

/** @param {string} value */
export function maskCPF(value) {
    const d = String(value ?? '').replace(/\D/g, '').slice(0, 11);
    return d
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/** @param {string} value */
export function maskCNPJ(value) {
    const d = String(value ?? '').replace(/\D/g, '').slice(0, 14);
    return d
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** @param {string} value */
export function maskCPFOrCNPJ(value) {
    const d = String(value ?? '').replace(/\D/g, '');
    return d.length <= 11 ? maskCPF(value) : maskCNPJ(value);
}

/** @param {string} value */
export function maskCurrency(value) {
    const d = String(value ?? '').replace(/\D/g, '');
    const n = parseInt(d || '0', 10) / 100;
    return n.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/** Converte texto formatado em pt-BR (ex.: 1.234,56) ou número em float. */
export function parseCurrencyBRL(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const s = String(value ?? '').trim();
    if (!s) return 0;
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

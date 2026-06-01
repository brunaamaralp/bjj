/** Extrai MM-DD de birthDate (ISO ou DD/MM/YYYY). */
export function getBirthMonthDay(birthDate) {
    if (!birthDate) return null;
    const str = String(birthDate).trim();

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[2]}-${isoMatch[3]}`;

    const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) return `${brMatch[2]}-${brMatch[1]}`;

    return null;
}

/** Chave MM-DD do dia civil local. */
export function getTodayMonthDay(date = new Date()) {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${mes}-${dia}`;
}

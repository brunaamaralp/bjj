export function maskCardNumber(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

export function maskExpiry(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function parseExpiryParts(masked) {
  const [monthRaw, yearRaw] = String(masked || '').split('/');
  const expMonth = String(monthRaw || '').replace(/\D/g, '').slice(0, 2);
  const yearDigits = String(yearRaw || '').replace(/\D/g, '').slice(0, 2);
  const expYear = yearDigits ? `20${yearDigits}` : '';
  return { expMonth, expYear };
}

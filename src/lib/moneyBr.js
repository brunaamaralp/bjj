/** Utilitários de moeda BRL (máscara e parsing). */

export function parseMaskToCents(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10);
}

export function centsToNumber(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  return Math.round(n) / 100;
}

export function numberToCents(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function formatBRLFromCents(cents) {
  const v = (Number(cents) || 0) / 100;
  try {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${v.toFixed(2)}`.replace('.', ',');
  }
}

export function formatBRL(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${n.toFixed(2)}`.replace('.', ',');
  }
}

export function maskFromNumber(value) {
  if (value == null || value === '') return '';
  const cents = Math.round(Number(value) * 100);
  if (!Number.isFinite(cents) || cents < 0) return '';
  return formatBRLFromCents(cents);
}

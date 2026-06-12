const PLACEHOLDER_NAME_RE = /^(amigo|cliente|contato|\d{10,15})$/i;

/**
 * Nome do lead ainda é placeholder (telefone ou genérico)?
 * @param {unknown} name
 * @param {unknown} phone
 */
export function isLeadNamePlaceholder(name, phone = '') {
  const n = String(name || '').trim();
  if (!n) return true;
  const digits = n.replace(/\D/g, '');
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  if (digits && phoneDigits && digits === phoneDigits) return true;
  return PLACEHOLDER_NAME_RE.test(n);
}

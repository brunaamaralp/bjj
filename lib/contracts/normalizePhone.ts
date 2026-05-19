/** Normaliza telefone brasileiro para envio à Autentique (+55XXXXXXXXXXX). */
export function normalizePhoneForAutentique(phone: string | undefined | null): string | undefined {
  const raw = String(phone || '').trim();
  if (!raw) return undefined;

  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;

  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
  if (digits.length === 11 || digits.length === 10) return `+55${digits}`;
  return `+${digits}`;
}

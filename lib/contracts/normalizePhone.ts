/** Dígitos nacionais (DDD + número), sem +55. */
export function extractBrazilNationalDigits(phone: string | undefined | null): string {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';

  if (d.startsWith('55') && d.length >= 12) {
    d = d.slice(2);
  }

  if (d.length > 11) {
    if (d.length === 12 && d.startsWith('0')) {
      d = d.slice(1);
    } else {
      // Ex.: colagem com dígito a mais — mantém DDD no início, não os últimos 11 dígitos.
      d = d.slice(0, 11);
    }
  }

  return d.slice(0, 11);
}

/**
 * Celular antigo com 10 dígitos (DDD + 8) → insere o 9 após o DDD quando parece móvel.
 */
export function normalizeBrazilMobileNational(digits: string): string {
  if (digits.length !== 10) return digits;
  const third = digits[2];
  if (third && third !== '9' && /[6-9]/.test(third)) {
    return `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return digits;
}

export function getBrazilMobileNational(phone: string | undefined | null): string {
  return normalizeBrazilMobileNational(extractBrazilNationalDigits(phone));
}

/** Celular BR: DDD + 9 + 8 dígitos (11 no total, sem contar 55). */
export function isValidBrazilMobilePhone(phone: string | undefined | null): boolean {
  const national = getBrazilMobileNational(phone);
  if (national.length !== 11) return false;
  return national[2] === '9';
}

/** Normaliza telefone brasileiro para envio à Autentique (+55XXXXXXXXXXX). */
export function normalizePhoneForAutentique(phone: string | undefined | null): string | undefined {
  const national = getBrazilMobileNational(phone);
  if (!isValidBrazilMobilePhone(national)) return undefined;
  return `+55${national}`;
}

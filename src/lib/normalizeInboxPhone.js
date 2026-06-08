/** Dígitos apenas. */
export function normalizeInboxPhone(v) {
  return String(v || '').replace(/\D/g, '');
}

/** Variantes BR para casar lead (119…) com conversa WhatsApp (5511…). */
export function inboxPhoneLookupVariants(v) {
  const digits = normalizeInboxPhone(v);
  if (!digits) return [];
  const set = new Set([digits]);
  if (digits.startsWith('55') && digits.length >= 12) {
    set.add(digits.slice(2));
  } else if (digits.length >= 10 && digits.length <= 11) {
    set.add(`55${digits}`);
  }
  return [...set];
}

/** Chave preferida para API/conversas WhatsApp (com DDI 55 quando BR). */
export function primaryInboxPhone(v) {
  const digits = normalizeInboxPhone(v);
  if (!digits) return '';
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

export function inboxPhonesMatch(a, b) {
  const left = inboxPhoneLookupVariants(a);
  const right = new Set(inboxPhoneLookupVariants(b));
  if (!left.length || !right.size) return false;
  return left.some((p) => right.has(p));
}

/** @deprecated Use primaryInboxPhone — mantido para imports existentes. */
export const normalizeLeadPhoneForInbox = primaryInboxPhone;

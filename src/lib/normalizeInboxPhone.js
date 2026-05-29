/** Dígitos apenas — mesma regra do Inbox e dos perfis. */
export function normalizeInboxPhone(v) {
  return String(v || '').replace(/\D/g, '');
}

export const normalizeLeadPhoneForInbox = normalizeInboxPhone;

import { applyNamePlaceholder } from './collectionRules.js';
import { normalizePhoneForWaMe } from './outboundWhatsappTemplate.js';

/**
 * URL wa.me para contato manual (revisão humana antes do envio).
 * @param {string} phone
 * @param {string} [text] texto opcional pré-preenchido
 * @returns {string} vazio se telefone inválido
 */
export function buildWaMeUrl(phone, text) {
  const digits = normalizePhoneForWaMe(phone);
  if (!digits || digits.length < 12) return '';
  const base = `https://wa.me/${digits}`;
  const body = String(text || '').trim();
  return body ? `${base}?text=${encodeURIComponent(body)}` : base;
}

export function studentHasValidWaPhone(phone) {
  return Boolean(buildWaMeUrl(phone));
}

/** Mensagem sugerida da régua de cobrança para WhatsApp manual. */
export function buildCollectionWhatsappDraft({ stage, studentName }) {
  const raw = String(stage?.defaultMessage || '').trim();
  if (!raw) return '';
  return applyNamePlaceholder(raw, studentName);
}

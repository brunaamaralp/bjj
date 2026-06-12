import { formatWhatsAppGroupLabel, isWhatsAppGroupId, isWhatsAppGroupPhoneDigits } from '../../lib/whatsappGroupId.js';

export function normalizeInboxPhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

export function isInboxGroupPhone(phone) {
  return isWhatsAppGroupId(phone);
}

export function formatInboxPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (isWhatsAppGroupPhoneDigits(digits)) return formatWhatsAppGroupLabel(digits);
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

/** URL da foto de perfil WhatsApp já persistida na conversa (lista ou thread). */
export function inboxProfileImageUrl(source) {
  if (!source || typeof source !== 'object') return '';
  return String(source._profileImageUrl || source.whatsapp_profile_image_url || '').trim();
}

/** Lead de criança/júnior: telefone costuma ser do responsável, nome do lead é do aluno. */
export function isChildLeadDisplayContext({ parentName = '', leadType = '' } = {}) {
  if (String(parentName || '').trim()) return true;
  const t = String(leadType || '').trim();
  return t === 'Criança' || t === 'Juniores';
}

/**
 * Normaliza campos de lead + conversa para pickInboxDisplayName.
 */
export function buildInboxDisplayNameArgs({
  lead = null,
  leadName = '',
  manualContactName = '',
  whatsappProfileName = '',
  phone = '',
} = {}) {
  return {
    leadName: String(lead?.name || leadName || '').trim(),
    manualContactName: String(manualContactName || '').trim(),
    whatsappProfileName: String(whatsappProfileName || '').trim(),
    phone: String(phone || '').trim(),
    parentName: String(lead?.parentName || '').trim(),
    leadType: String(lead?.type || '').trim(),
  };
}

/**
 * Nome exibido na inbox (lista, thread, widget).
 * Adulto: prioriza cadastro do lead. Criança/júnior: prioriza quem fala no WhatsApp.
 */
export function pickInboxDisplayName({
  leadName = '',
  manualContactName = '',
  whatsappProfileName = '',
  phone = '',
  parentName = '',
  leadType = '',
} = {}) {
  const lead = String(leadName || '').trim();
  const manual = String(manualContactName || '').trim();
  const wa = String(whatsappProfileName || '').trim();
  const parent = String(parentName || '').trim();
  const phoneStr = String(phone || '').trim();
  const childContext = isChildLeadDisplayContext({ parentName, leadType });

  if (childContext) {
    if (manual) return manual;
    if (wa) return wa;
    if (parent) return parent;
    if (lead) return lead;
  } else {
    if (lead) return lead;
    if (manual) return manual;
    if (wa) return wa;
  }

  if (isInboxGroupPhone(phoneStr)) return formatInboxPhone(phoneStr);
  return formatInboxPhone(phoneStr) || '-';
}

/** Valor inicial ao editar o nome do contato na thread (nunca o nome do aluno). */
export function pickInboxContactNameForEdit({
  manualContactName = '',
  whatsappProfileName = '',
  parentName = '',
} = {}) {
  return (
    String(manualContactName || '').trim() ||
    String(whatsappProfileName || '').trim() ||
    String(parentName || '').trim() ||
    ''
  );
}

/** Subtítulo com nome do aluno quando difere do contato WhatsApp. */
export function inboxStudentSubtitle({
  leadName = '',
  displayName = '',
  parentName = '',
  leadType = '',
} = {}) {
  const student = String(leadName || '').trim();
  if (!student || !isChildLeadDisplayContext({ parentName, leadType })) return '';
  const shown = String(displayName || '').trim();
  if (shown && shown.toLowerCase() === student.toLowerCase()) return '';
  return student;
}

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

export function pickInboxDisplayName({
  leadName = '',
  manualContactName = '',
  whatsappProfileName = '',
  phone = '',
} = {}) {
  const lead = String(leadName || '').trim();
  if (lead) return lead;
  const manual = String(manualContactName || '').trim();
  if (manual) return manual;
  const wa = String(whatsappProfileName || '').trim();
  if (wa) return wa;
  const phoneStr = String(phone || '').trim();
  if (isInboxGroupPhone(phoneStr)) return formatInboxPhone(phoneStr);
  return formatInboxPhone(phoneStr) || '-';
}

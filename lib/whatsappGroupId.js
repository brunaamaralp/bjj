/** IDs de grupo WhatsApp (JID @g.us ou dígitos normalizados). */

export function isWhatsAppGroupPhoneDigits(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return false;
  if (d.startsWith('120') && d.length >= 15) return true;
  if (d.length >= 16) return true;
  return false;
}

export function isWhatsAppGroupId(v) {
  const raw = String(v || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.startsWith('group:') || raw.includes('@g.us')) return true;
  return isWhatsAppGroupPhoneDigits(raw);
}

export function formatWhatsAppGroupLabel(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return 'Grupo WhatsApp';
  const tail = d.length > 4 ? d.slice(-4) : d;
  return `Grupo · …${tail}`;
}

export function rawWhatsAppChatId(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    const id = v.id ?? v.jid ?? v.wid;
    if (id != null) return String(id).trim();
    return '';
  }
  return String(v).trim();
}

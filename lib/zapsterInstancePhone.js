/**
 * Extrai e formata o telefone vinculado a uma instância Zapster (compartilhado client/server).
 */

/** @param {unknown} v */
export function normalizeWaPhoneDigits(v) {
  const d = String(v ?? '')
    .replace(/@.*$/, '')
    .replace(/\D/g, '');
  if (d.length < 10 || d.length > 15) return '';
  return d;
}

/** @param {unknown} data */
export function extractPhoneFromZapsterInstance(data) {
  if (!data || typeof data !== 'object') return '';
  const o = /** @type {Record<string, unknown>} */ (data);
  const profile =
    o.profile && typeof o.profile === 'object'
      ? /** @type {Record<string, unknown>} */ (o.profile)
      : null;
  const owner =
    o.owner && typeof o.owner === 'object' ? /** @type {Record<string, unknown>} */ (o.owner) : null;
  const metadata =
    o.metadata && typeof o.metadata === 'object'
      ? /** @type {Record<string, unknown>} */ (o.metadata)
      : null;
  const nested =
    o.data && typeof o.data === 'object' ? /** @type {Record<string, unknown>} */ (o.data) : null;

  const candidates = [
    o.phone,
    o.phone_number,
    o.wa_phone,
    o.wid,
    profile?.phone,
    profile?.phone_number,
    profile?.wid,
    owner?.phone,
    owner?.phone_number,
    metadata?.phone_number,
    metadata?.phone,
    nested?.phone,
    nested?.phone_number,
  ];

  for (const c of candidates) {
    const digits = normalizeWaPhoneDigits(c);
    if (digits) return digits;
  }

  const jid = String(o.jid || o.owner_jid || profile?.jid || '').trim();
  const jidPrefix = jid.match(/^(\d{10,15})/);
  if (jidPrefix) {
    const fromJid = normalizeWaPhoneDigits(jidPrefix[1]);
    if (fromJid) return fromJid;
  }

  const ownerId = owner?.id;
  if (ownerId != null) {
    const ownerIdStr = String(ownerId).trim();
    if (ownerIdStr && !ownerIdStr.includes('-')) {
      const fromOwner = normalizeWaPhoneDigits(ownerIdStr);
      if (fromOwner) return fromOwner;
    }
  }

  return '';
}

/** @param {unknown} digits */
export function formatWaPhoneDisplay(digits) {
  const d = normalizeWaPhoneDigits(digits);
  if (!d) return '';
  const withCountry = d.startsWith('55') && d.length >= 12 ? d : d.length >= 10 ? `55${d}` : d;
  const local =
    withCountry.startsWith('55') && withCountry.length >= 12 ? withCountry.slice(2) : withCountry;
  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  if (d.length >= 10) return `+${d}`;
  return d;
}

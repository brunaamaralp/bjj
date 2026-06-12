import { inboxPhoneLookupVariants } from './normalizeInboxPhone.js';

function parseMessageArray(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Última mensagem inbound da lead — usa `last_user_msg_at` ou varre o histórico recente.
 * @param {Record<string, unknown> | null | undefined} doc
 */
export function extractLastUserMessageAt(doc) {
  const stored = String(doc?.last_user_msg_at || '').trim();
  if (stored) return stored;

  const metaRole = String(doc?.last_message_role || '').trim().toLowerCase();
  const metaTs = String(doc?.last_message_timestamp || '').trim();
  if (metaRole === 'user' && metaTs) return metaTs;

  let latest = '';
  for (const raw of [doc?.messages_recent, doc?.messages]) {
    for (const m of parseMessageArray(raw)) {
      if (!m || typeof m !== 'object') continue;
      if (m.role !== 'user') continue;
      const ts = String(m.timestamp || m.send_at || '').trim();
      if (!ts) continue;
      latest = pickLatestInboundIso(latest, ts);
    }
    if (latest) break;
  }
  return latest;
}

/** @param {string} current @param {string} next */
export function pickLatestInboundIso(current, next) {
  const a = String(current || '').trim();
  const b = String(next || '').trim();
  if (!b) return a;
  if (!a) return b;
  return new Date(b).getTime() >= new Date(a).getTime() ? b : a;
}

/**
 * @param {{ inboundAfterByLead: Record<string, string>; inboundAfterByPhone: Record<string, string> }} maps
 * @param {{ leadId?: string; phone?: string; lastUserMsgAt?: string }} row
 */
export function mergeInboundIntoMaps(maps, { leadId, phone, lastUserMsgAt }) {
  const at = String(lastUserMsgAt || '').trim();
  if (!at) return maps;

  const lid = String(leadId || '').trim();
  if (lid) {
    maps.inboundAfterByLead[lid] = pickLatestInboundIso(maps.inboundAfterByLead[lid], at);
  }

  for (const variant of inboxPhoneLookupVariants(phone)) {
    maps.inboundAfterByPhone[variant] = pickLatestInboundIso(maps.inboundAfterByPhone[variant], at);
  }

  return maps;
}

/** @param {object[]} docs */
export function buildInboundMapsFromConversations(docs) {
  const inboundAfterByLead = {};
  const inboundAfterByPhone = {};
  for (const doc of docs || []) {
    mergeInboundIntoMaps(
      { inboundAfterByLead, inboundAfterByPhone },
      {
        leadId: doc?.lead_id ?? doc?.leadId,
        phone: doc?.phone_number ?? doc?.phone,
        lastUserMsgAt: extractLastUserMessageAt(doc),
      }
    );
  }
  return { inboundAfterByLead, inboundAfterByPhone };
}

/** @param {string | undefined} phone @param {Record<string, string>} inboundAfterByPhone */
export function resolveInboundAfterForPhone(phone, inboundAfterByPhone = {}) {
  let best = '';
  for (const variant of inboxPhoneLookupVariants(phone)) {
    best = pickLatestInboundIso(best, inboundAfterByPhone[variant]);
  }
  return best;
}

/**
 * @param {object} lead
 * @param {{ inboundAfterByLead?: Record<string, string>; inboundAfterByPhone?: Record<string, string> }} ctx
 */
export function resolveInboundAfterForLead(lead, ctx = {}) {
  const leadId = String(lead?.id || '').trim();
  const fromLead = leadId ? String(ctx.inboundAfterByLead?.[leadId] || '').trim() : '';
  const fromPhone = resolveInboundAfterForPhone(lead?.phone, ctx.inboundAfterByPhone);
  return pickLatestInboundIso(fromLead, fromPhone);
}

/** @param {string} atIso @param {number} classMs */
export function inboundCountsAsContact(atIso, classMs) {
  const inboundMs = new Date(atIso).getTime();
  if (!Number.isFinite(inboundMs)) return false;

  const classYmd = ymdInSaoPaulo(new Date(classMs));
  const inboundYmd = ymdInSaoPaulo(atIso);
  if (classYmd && inboundYmd) return inboundYmd >= classYmd;

  return inboundMs >= classMs;
}

function ymdInSaoPaulo(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

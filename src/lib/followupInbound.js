import { inboxPhoneLookupVariants } from './normalizeInboxPhone.js';

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
        lastUserMsgAt: doc?.last_user_msg_at,
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
  return Number.isFinite(inboundMs) && inboundMs >= classMs;
}

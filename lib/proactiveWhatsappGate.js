/**
 * Regra de envio proativo WhatsApp: só permitir se houve mensagem inbound recente.
 * Lógica pura (cliente + servidor).
 */

import { extractLastUserMessageAt, pickLatestInboundIso } from '../src/lib/followupInbound.js';

export const PROACTIVE_WHATSAPP_INTERACTION_DAYS_DEFAULT = 30;
export const PROACTIVE_SKIP_REASON = 'no_recent_interaction';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** @returns {number} 0 desativa o gate */
export function resolveProactiveInteractionDays() {
  try {
    if (typeof process !== 'undefined' && process.env) {
      const raw = String(process.env.PROACTIVE_WHATSAPP_INTERACTION_DAYS ?? '').trim();
      if (raw === '0') return 0;
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch {
    void 0;
  }
  return PROACTIVE_WHATSAPP_INTERACTION_DAYS_DEFAULT;
}

export function isProactiveWhatsappGateEnabled(windowDays = resolveProactiveInteractionDays()) {
  return Number(windowDays) > 0;
}

/**
 * @param {{ lastUserMsgAt?: string; nowMs?: number; windowDays?: number }} p
 */
export function evaluateRecentWhatsappInteraction({
  lastUserMsgAt,
  nowMs = Date.now(),
  windowDays = resolveProactiveInteractionDays(),
} = {}) {
  const window = Number(windowDays) || 0;
  if (window <= 0) {
    return { allowed: true, lastUserMsgAt: String(lastUserMsgAt || '').trim() || null, daysSince: null, windowDays: 0 };
  }

  const at = String(lastUserMsgAt || '').trim();
  if (!at) {
    return { allowed: false, lastUserMsgAt: null, daysSince: null, windowDays: window };
  }

  const inboundMs = new Date(at).getTime();
  if (!Number.isFinite(inboundMs)) {
    return { allowed: false, lastUserMsgAt: at, daysSince: null, windowDays: window };
  }

  const diffMs = Math.max(0, Number(nowMs) - inboundMs);
  const daysSince = Math.floor(diffMs / MS_PER_DAY);
  return {
    allowed: daysSince <= window,
    lastUserMsgAt: at,
    daysSince,
    windowDays: window,
  };
}

/**
 * Resolve timestamp de interação inbound a partir de conversa e/ou lead.
 * @param {{ conversationDoc?: object | null; leadDoc?: object | null }} sources
 */
export function resolveLastInboundInteractionAt({ conversationDoc, leadDoc } = {}) {
  const fromConversation = conversationDoc ? extractLastUserMessageAt(conversationDoc) : '';
  const fromLead = String(leadDoc?.last_whatsapp_activity_at || leadDoc?.lastWhatsappActivityAt || '').trim();
  return pickLatestInboundIso(fromConversation, fromLead);
}

export function proactiveWhatsappUserMessage(windowDays = resolveProactiveInteractionDays()) {
  const days = Number(windowDays) || PROACTIVE_WHATSAPP_INTERACTION_DAYS_DEFAULT;
  return `Sem conversa no WhatsApp nos últimos ${days} dias com este contato. Peça para o lead responder ou envie manualmente pelo Inbox.`;
}

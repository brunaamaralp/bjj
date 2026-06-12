import { describe, expect, it } from 'vitest';
import {
  evaluateRecentWhatsappInteraction,
  resolveLastInboundInteractionAt,
  PROACTIVE_SKIP_REASON,
} from '../../lib/proactiveWhatsappGate.js';

describe('proactiveWhatsappGate', () => {
  const nowMs = new Date('2026-06-12T15:00:00.000Z').getTime();

  it('permite quando inbound está dentro da janela', () => {
    const at = new Date(nowMs - 5 * 24 * 60 * 60 * 1000).toISOString();
    const out = evaluateRecentWhatsappInteraction({ lastUserMsgAt: at, nowMs, windowDays: 30 });
    expect(out.allowed).toBe(true);
    expect(out.daysSince).toBe(5);
  });

  it('bloqueia quando inbound é mais antigo que a janela', () => {
    const at = new Date(nowMs - 31 * 24 * 60 * 60 * 1000).toISOString();
    const out = evaluateRecentWhatsappInteraction({ lastUserMsgAt: at, nowMs, windowDays: 30 });
    expect(out.allowed).toBe(false);
    expect(out.daysSince).toBe(31);
  });

  it('bloqueia sem timestamp de inbound', () => {
    const out = evaluateRecentWhatsappInteraction({ lastUserMsgAt: '', nowMs, windowDays: 30 });
    expect(out.allowed).toBe(false);
  });

  it('desativa o gate com windowDays 0', () => {
    const out = evaluateRecentWhatsappInteraction({ lastUserMsgAt: '', nowMs, windowDays: 0 });
    expect(out.allowed).toBe(true);
  });

  it('usa o mais recente entre conversa e lead', () => {
    const older = new Date(nowMs - 20 * 24 * 60 * 60 * 1000).toISOString();
    const newer = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString();
    const at = resolveLastInboundInteractionAt({
      conversationDoc: { last_user_msg_at: older },
      leadDoc: { last_whatsapp_activity_at: newer },
    });
    expect(at).toBe(newer);
  });

  it('exporta motivo de skip estável', () => {
    expect(PROACTIVE_SKIP_REASON).toBe('no_recent_interaction');
  });
});

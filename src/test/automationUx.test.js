import { describe, it, expect } from 'vitest';
import {
  buildAutomationFeedbackToasts,
  computeAutomationReadiness,
  formatWhatsappTemplateSentTimeline,
  getLeadAutomationBadges,
  safeAutomationDispatch,
} from '../lib/automationUx.js';
import { AUTOMATION_DEFAULTS } from '../lib/useAutomations.js';

describe('automationUx', () => {
  it('computeAutomationReadiness when all ok', () => {
    const cfg = { schedule_confirm: { ...AUTOMATION_DEFAULTS.schedule_confirm, active: true } };
    const r = computeAutomationReadiness({
      automationsConfig: cfg,
      templatesMap: { confirm: 'Olá {nome}' },
      waConnected: true,
      hasZapsterInstance: true,
    });
    expect(r.ready).toBe(true);
    expect(r.activeCount).toBe(1);
  });

  it('getLeadAutomationBadges lists pending', () => {
    const badges = getLeadAutomationBadges(
      {
        pendingAutomations: [
          { key: 'schedule_reminder', sendAt: '2099-06-01T12:00:00.000Z', sent: false },
        ],
      },
      { schedule_reminder: { active: true } }
    );
    expect(badges).toHaveLength(1);
    expect(badges[0].key).toBe('schedule_reminder');
  });

  it('buildAutomationFeedbackToasts for sent and scheduled', () => {
    const toasts = buildAutomationFeedbackToasts(
      [{ status: 'sent', automationKey: 'schedule_confirm', channel: 'api' }],
      [{ key: 'schedule_reminder', sendAt: '2099-06-01T15:00:00.000Z' }]
    );
    expect(toasts.some((t) => t.type === 'success')).toBe(true);
    expect(toasts.some((t) => t.type === 'info')).toBe(true);
  });

  it('safeAutomationDispatch retorna failed em erro', async () => {
    const result = await safeAutomationDispatch(
      Promise.reject(new Error('network')),
      'schedule_confirm'
    );
    expect(result.immediate[0]).toMatchObject({
      status: 'failed',
      automationKey: 'schedule_confirm',
      reason: 'send_failed',
    });
  });

  it('buildAutomationFeedbackToasts inclui warning em falha', () => {
    const toasts = buildAutomationFeedbackToasts(
      [{ status: 'failed', automationKey: 'missed', reason: 'send_failed' }],
      []
    );
    expect(toasts.some((t) => t.type === 'warning')).toBe(true);
  });

  it('formatWhatsappTemplateSentTimeline', () => {
    const text = formatWhatsappTemplateSentTimeline(
      { text: 'reminder' },
      { templateKey: 'reminder', automationKey: 'schedule_reminder' }
    );
    expect(text).toContain('Lembrete');
    expect(text).toContain('Automático');
  });
});

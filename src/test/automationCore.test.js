import { describe, it, expect } from 'vitest';
import {
  upsertPendingEntry,
  mergePendingAutomations,
  parsePendingAutomations,
  shouldSkipPendingAutomationResend,
  markPendingAutomationSent,
  buildReminderSendAtIso,
  buildWaitingDecisionSendAtIso,
  buildFollowupD1SendAtIso,
  parseAutomationsConfig,
} from '../../lib/automationCore.js';

describe('automationCore', () => {
  it('parseAutomationsConfig merges defaults', () => {
    const cfg = parseAutomationsConfig(JSON.stringify({ schedule_confirm: { active: true } }));
    expect(cfg.schedule_confirm.active).toBe(true);
    expect(cfg.missed.active).toBe(false);
    expect(cfg.followup_d1_attended.active).toBe(false);
    expect(cfg.birthday.active).toBe(false);
    expect(cfg.birthday.templateKey).toBe('birthday');
  });

  it('buildFollowupD1SendAtIso schedules next day at 10h local', () => {
    const iso = buildFollowupD1SendAtIso('2026-06-10');
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(0);
  });

  it('upsertPendingEntry replaces unsent same key', () => {
    const a = [{ key: 'waiting_decision', sendAt: '2026-01-01T00:00:00.000Z', sent: false }];
    const b = upsertPendingEntry(a, 'waiting_decision', '2026-02-01T00:00:00.000Z');
    expect(b).toHaveLength(1);
    expect(b[0].sendAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('buildReminderSendAtIso subtracts delay before class', () => {
    const iso = buildReminderSendAtIso('2026-05-15', '19:00', 120);
    const d = new Date(iso);
    expect(d.getHours()).toBe(17);
    expect(d.getMinutes()).toBe(0);
  });

  it('buildWaitingDecisionSendAtIso is in the future', () => {
    const iso = buildWaitingDecisionSendAtIso(60);
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
  });

  describe('mergePendingAutomations', () => {
    it('(a) preserva sent:true do remoto para mesma key', () => {
      const local = [
        { key: 'schedule_reminder', sendAt: '2026-06-20T10:00:00.000Z', sent: false },
      ];
      const remote = [
        { key: 'schedule_reminder', sendAt: '2026-06-19T10:00:00.000Z', sent: true },
      ];
      expect(mergePendingAutomations(local, remote)).toEqual([
        { key: 'schedule_reminder', sendAt: '2026-06-20T10:00:00.000Z', sent: true },
      ]);
    });

    it('(b) descarta itens só no remoto com sent:false', () => {
      const local = [
        { key: 'waiting_decision', sendAt: '2026-06-21T00:00:00.000Z', sent: false },
      ];
      const remote = [
        { key: 'schedule_reminder', sendAt: '2026-06-19T10:00:00.000Z', sent: false },
        { key: 'waiting_decision', sendAt: '2026-06-20T00:00:00.000Z', sent: false },
      ];
      expect(mergePendingAutomations(local, remote)).toEqual([
        { key: 'waiting_decision', sendAt: '2026-06-21T00:00:00.000Z', sent: false },
      ]);
    });

    it('(c) só local passa direto', () => {
      const local = [
        { key: 'followup_d1_attended', sendAt: '2026-06-11T13:00:00.000Z', sent: false },
      ];
      expect(mergePendingAutomations(local, [])).toEqual(local);
    });

    it('(d) arrays vazios retornam []', () => {
      expect(mergePendingAutomations([], [])).toEqual([]);
      expect(
        mergePendingAutomations([], [
          { key: 'schedule_reminder', sendAt: '2026-06-19T10:00:00.000Z', sent: false },
        ])
      ).toEqual([]);
    });
  });

  describe('parsePendingAutomations', () => {
    it('preserva sentAt opcional', () => {
      const parsed = parsePendingAutomations(
        JSON.stringify([
          { key: 'schedule_reminder', sendAt: '2026-06-15T10:00:00.000Z', sent: false },
          {
            key: 'waiting_decision',
            sendAt: '2026-06-16T10:00:00.000Z',
            sent: false,
            sentAt: '2026-06-15T16:55:00.000Z',
          },
        ])
      );
      expect(parsed[0].sentAt).toBeUndefined();
      expect(parsed[1].sentAt).toBe('2026-06-15T16:55:00.000Z');
    });
  });

  describe('shouldSkipPendingAutomationResend', () => {
    const now = Date.parse('2026-06-15T17:00:00.000Z');

    it('pula reenvio quando sentAt é recente (< 30 min)', () => {
      const item = {
        key: 'schedule_reminder',
        sendAt: '2026-06-15T16:55:00.000Z',
        sent: false,
        sentAt: '2026-06-15T16:40:00.000Z',
      };
      expect(shouldSkipPendingAutomationResend(item, now)).toBe(true);
    });

    it('não pula quando sentAt é antigo (>= 30 min)', () => {
      const item = {
        key: 'schedule_reminder',
        sendAt: '2026-06-15T16:55:00.000Z',
        sent: false,
        sentAt: '2026-06-15T16:00:00.000Z',
      };
      expect(shouldSkipPendingAutomationResend(item, now)).toBe(false);
    });

    it('não pula quando sentAt está ausente', () => {
      expect(
        shouldSkipPendingAutomationResend(
          { key: 'schedule_reminder', sendAt: '2026-06-15T16:55:00.000Z', sent: false },
          now
        )
      ).toBe(false);
    });
  });

  describe('markPendingAutomationSent', () => {
    it('define sent:true e sentAt', () => {
      const item = { key: 'schedule_reminder', sendAt: '2026-06-15T16:55:00.000Z', sent: false };
      expect(markPendingAutomationSent(item, '2026-06-15T17:00:00.000Z')).toEqual({
        key: 'schedule_reminder',
        sendAt: '2026-06-15T16:55:00.000Z',
        sent: true,
        sentAt: '2026-06-15T17:00:00.000Z',
      });
    });
  });
});

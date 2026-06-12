import { describe, it, expect } from 'vitest';
import {
  upsertPendingEntry,
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
});

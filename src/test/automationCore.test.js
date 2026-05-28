import { describe, it, expect } from 'vitest';
import {
  upsertPendingEntry,
  buildReminderSendAtIso,
  buildWaitingDecisionSendAtIso,
  parseAutomationsConfig,
} from '../../lib/automationCore.js';

describe('automationCore', () => {
  it('parseAutomationsConfig merges defaults', () => {
    const cfg = parseAutomationsConfig(JSON.stringify({ schedule_confirm: { active: true } }));
    expect(cfg.schedule_confirm.active).toBe(true);
    expect(cfg.missed.active).toBe(false);
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

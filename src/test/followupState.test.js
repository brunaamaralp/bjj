import { describe, it, expect } from 'vitest';
import { validateFollowupPlaybook } from '../lib/followupPlaybookDefaults.js';
import { LEAD_STATUS } from '../lib/leadStatus.js';
import {
  computeFollowupState,
  enrichFollowUpLeads,
  sortFollowupsByTemperature,
  groupFollowUpsByTemperature,
  getFollowupDaysAgo,
} from '../lib/followupState.js';
import { computeFallbackTemperature } from '../lib/followupTemperature.js';

const baseLead = {
  id: 'l1',
  name: 'Ana',
  scheduledDate: '2026-06-08',
  status: LEAD_STATUS.COMPLETED,
};

describe('computeFallbackTemperature', () => {
  it('compareceu D0 sem contato fica em dia', () => {
    expect(computeFallbackTemperature(baseLead, 'attended', 0, false)).toBe('on_track');
  });

  it('compareceu D+1 sem contato esfria', () => {
    expect(computeFallbackTemperature(baseLead, 'attended', 1, false)).toBe('cooling');
  });

  it('compareceu D+3 sem contato fica crítico', () => {
    expect(computeFallbackTemperature(baseLead, 'attended', 3, false)).toBe('critical');
  });

  it('com contato fica em dia', () => {
    expect(computeFallbackTemperature(baseLead, 'attended', 2, true)).toBe('on_track');
  });

  it('faltou D+2 sem remarcar esfria', () => {
    const missed = { ...baseLead, status: LEAD_STATUS.MISSED };
    expect(computeFallbackTemperature(missed, 'missed', 2, false)).toBe('cooling');
  });
});

describe('computeFollowupState', () => {
  const now = new Date(2026, 5, 10, 12, 0);

  it('detecta contato via followup_contact', () => {
    const state = computeFollowupState(baseLead, {
      now,
      followupContactByLead: { l1: '2026-06-09T10:00:00.000Z' },
    });
    expect(state.hasContactInCycle).toBe(true);
    expect(state.temperature).toBe('on_track');
  });

  it('detecta contato via inbound WhatsApp após a aula', () => {
    const state = computeFollowupState(baseLead, {
      now,
      inboundAfterByLead: { l1: '2026-06-10T09:00:00.000Z' },
    });
    expect(state.hasContactInCycle).toBe(true);
    expect(state.temperature).toBe('on_track');
  });

  it('ignora inbound anterior à aula experimental', () => {
    const state = computeFollowupState(baseLead, {
      now,
      inboundAfterByPhone: { 5511999999999: '2026-06-07T09:00:00.000Z' },
    });
    expect(state.hasContactInCycle).toBe(false);
  });

  it('detecta contato via lastWhatsappActivityAt após a aula', () => {
    const state = computeFollowupState(
      { ...baseLead, lastWhatsappActivityAt: '2026-06-10T09:00:00.000Z' },
      { now }
    );
    expect(state.hasContactInCycle).toBe(true);
    expect(state.temperature).toBe('on_track');
  });

  it('respeita snooze ativo', () => {
    const state = computeFollowupState(baseLead, {
      now,
      followupSnoozeUntilByLead: { l1: '2026-06-12' },
    });
    expect(state.isSnoozed).toBe(true);
  });
});

describe('enrichFollowUpLeads', () => {
  it('ordena crítico antes de em dia', () => {
    const leads = enrichFollowUpLeads(
      [
        { ...baseLead, id: 'a', scheduledDate: '2026-06-10' },
        { ...baseLead, id: 'b', scheduledDate: '2026-06-05' },
      ],
      { now: new Date(2026, 5, 10) }
    );
    const sorted = [...leads].sort(sortFollowupsByTemperature);
    expect(sorted[0].temperature).toBe('critical');
    const groups = groupFollowUpsByTemperature(sorted);
    expect(groups[0].key).toBe('critical');
  });
});

describe('getFollowupDaysAgo', () => {
  it('calcula dias desde a aula', () => {
    const days = getFollowupDaysAgo(baseLead, new Date(2026, 5, 10));
    expect(days).toBe(2);
  });
});

describe('validateFollowupPlaybook', () => {
  it('rejeita offset_days duplicado', () => {
    const errors = validateFollowupPlaybook({
      version: 1,
      enabled: true,
      attended: [
        { offset_days: 0, action_type: 'whatsapp_template', template_key: 'post_class' },
        { offset_days: 0, action_type: 'whatsapp_template', template_key: 'missed' },
      ],
      missed: [],
    });
    expect(errors.some((e) => /prazo diferente/i.test(e))).toBe(true);
  });
});

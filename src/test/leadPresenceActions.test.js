import { describe, expect, it } from 'vitest';
import { LEAD_STATUS } from '../lib/leadStatus.js';
import { buildLeadPresenceUndoPatch, canUndoLeadPresence } from '../lib/leadPresenceActions.js';

describe('leadPresenceActions', () => {
  it('buildLeadPresenceUndoPatch reverte compareceu para agendado', () => {
    const patch = buildLeadPresenceUndoPatch({
      status: LEAD_STATUS.COMPLETED,
      pipelineStage: 'Aguardando decisão',
    });
    expect(patch).toEqual({
      status: LEAD_STATUS.SCHEDULED,
      pipelineStage: 'Aula experimental',
      attendedAt: null,
      missedAt: null,
    });
  });

  it('buildLeadPresenceUndoPatch reverte não compareceu para agendado', () => {
    const patch = buildLeadPresenceUndoPatch({
      status: LEAD_STATUS.MISSED,
      pipelineStage: LEAD_STATUS.MISSED,
    });
    expect(patch?.status).toBe(LEAD_STATUS.SCHEDULED);
    expect(canUndoLeadPresence({ status: LEAD_STATUS.MISSED })).toBe(true);
  });

  it('ignora lead ainda agendado', () => {
    expect(buildLeadPresenceUndoPatch({ status: LEAD_STATUS.SCHEDULED })).toBeNull();
    expect(canUndoLeadPresence({ status: LEAD_STATUS.SCHEDULED })).toBe(false);
  });

  it('undo limpa attendedAt e missedAt', () => {
    const patch = buildLeadPresenceUndoPatch({ status: LEAD_STATUS.COMPLETED });
    expect(patch?.attendedAt).toBeNull();
    expect(patch?.missedAt).toBeNull();
  });
});

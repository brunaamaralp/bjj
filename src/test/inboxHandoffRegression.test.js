import { describe, it, expect, vi, beforeEach } from 'vitest';
import { humanHandoffIsActive, humanHandoffUntilFromMs } from '../../lib/humanHandoffUntil.js';
import { getHumanHandoffHoursForServer } from '../../lib/constants.js';

describe('handoff env parity', () => {
  it('server and client defaults resolve to the same hours when env unset', async () => {
    const { getHumanHandoffHoursForClient } = await import('../../lib/constants.js');
    expect(getHumanHandoffHoursForServer()).toBe(getHumanHandoffHoursForClient());
  });
});

describe('human_handoff_until gate', () => {
  it('handoff ativo quando until está no futuro', () => {
    const until = humanHandoffUntilFromMs(Date.now() + 3600000);
    expect(humanHandoffIsActive(until)).toBe(true);
  });

  it('handoff expirado quando until passou', () => {
    const until = humanHandoffUntilFromMs(Date.now() - 1000);
    expect(humanHandoffIsActive(until)).toBe(false);
  });
});

describe('webhook handoff gate (documentado)', () => {
  it('modo humano ativo impede dispatch de IA no webhook (comportamento esperado)', () => {
    expect(humanHandoffIsActive(humanHandoffUntilFromMs(Date.now() + 3600000))).toBe(true);
    expect(humanHandoffIsActive(humanHandoffUntilFromMs(Date.now() - 1000))).toBe(false);
  });

  it('após expiração do until a IA pode voltar (handoff inativo)', () => {
    const expired = humanHandoffUntilFromMs(Date.now() - 60_000);
    expect(humanHandoffIsActive(expired)).toBe(false);
  });
});

/** Mesma condição que lib/server/agentRespond.js usa antes de chamar Claude. */
function agentRespondWouldSkip(doc) {
  const until = typeof doc?.human_handoff_until === 'string' ? doc.human_handoff_until : '';
  return humanHandoffIsActive(until);
}

describe('agentRespond skipped: human_handoff_active', () => {
  it('retorna skipped quando human_handoff_until está no futuro', () => {
    expect(
      agentRespondWouldSkip({
        human_handoff_until: humanHandoffUntilFromMs(Date.now() + 3600000),
      })
    ).toBe(true);
  });

  it('não skipped quando handoff expirou', () => {
    expect(
      agentRespondWouldSkip({
        human_handoff_until: humanHandoffUntilFromMs(Date.now() - 1000),
      })
    ).toBe(false);
  });
});

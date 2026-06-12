import { describe, it, expect } from 'vitest';
import { humanHandoffUntilFromMs } from '../../lib/humanHandoffUntil.js';
import {
  getHandoffPresentation,
  getThreadHandoffBanner,
  getThreadHandoffPill,
  isAgentAutoReplyEnabled,
} from '../../lib/inboxHandoffPresentation.js';

describe('isAgentAutoReplyEnabled', () => {
  it('exige módulo de IA e ia_ativa', () => {
    expect(isAgentAutoReplyEnabled(true, true)).toBe(true);
    expect(isAgentAutoReplyEnabled(false, true)).toBe(false);
    expect(isAgentAutoReplyEnabled(true, false)).toBe(false);
  });
});

describe('getHandoffPresentation', () => {
  const nowMs = Date.parse('2026-06-12T12:00:00.000Z');

  it('não mostra IA respondendo quando agente está desativado', () => {
    const pres = getHandoffPresentation({
      needHuman: false,
      humanHandoffUntil: null,
      nowMs,
      agentIaActive: false,
    });
    expect(pres.variant).toBe('none');
    expect(pres.text).toBe('');
  });

  it('mostra IA respondendo quando agente está ativo e sem handoff humano', () => {
    const pres = getHandoffPresentation({
      needHuman: false,
      humanHandoffUntil: null,
      nowMs,
      agentIaActive: true,
    });
    expect(pres.variant).toBe('ia');
    expect(pres.text).toContain('A IA está respondendo');
  });

  it('não promete retomada da IA após handoff expirado se agente está desativado', () => {
    const until = humanHandoffUntilFromMs(nowMs - 60_000);
    const pres = getHandoffPresentation({
      needHuman: true,
      humanHandoffUntil: until,
      nowMs,
      agentIaActive: false,
    });
    expect(pres.variant).toBe('human');
    expect(pres.text).not.toContain('IA');
  });
});

describe('getThreadHandoffBanner', () => {
  const nowMs = Date.parse('2026-06-12T12:00:00.000Z');

  it('retorna null quando agente IA está desativado e não há handoff humano', () => {
    expect(
      getThreadHandoffBanner({
        needHuman: false,
        humanHandoffUntil: null,
        nowMs,
        agentIaActive: false,
      })
    ).toBeNull();
  });
});

describe('getThreadHandoffPill', () => {
  const nowMs = Date.parse('2026-06-12T12:00:00.000Z');

  it('retorna null quando não há IA ativa nem handoff humano', () => {
    expect(
      getThreadHandoffPill({
        needHuman: false,
        humanHandoffUntil: null,
        nowMs,
        agentIaActive: false,
      })
    ).toBeNull();
  });
});

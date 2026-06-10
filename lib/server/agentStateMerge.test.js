import { describe, it, expect } from 'vitest';
import { mergeAgentStatePatch, intakeMissingFields } from './agentStateMerge.js';

describe('agentStateMerge', () => {
  it('merge intake collected fields', () => {
    const out = mergeAgentStatePatch(
      { intake: { collected: { cpf: '123' } } },
      { intake: { collected: { birthDate: '2010-01-01' }, missing: ['name'] } }
    );
    expect(out.intake.collected).toEqual({ cpf: '123', birthDate: '2010-01-01' });
    expect(out.intake.missing).toEqual(['name']);
  });

  it('clear_intake removes intake', () => {
    const out = mergeAgentStatePatch({ intake: { collected: {} } }, { clear_intake: true });
    expect(out.intake).toBeUndefined();
  });

  it('intakeMissingFields detects gaps', () => {
    expect(intakeMissingFields({ cpf: '1', name: 'João' })).toContain('birthDate');
    expect(intakeMissingFields({ cpf: '1', name: 'João', birthDate: '2000-01-01' })).toEqual([]);
  });
});

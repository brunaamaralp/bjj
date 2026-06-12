import { describe, it, expect } from 'vitest';
import {
  mergeAgentStatePatch,
  intakeMissingFields,
  intakeMissingFieldsForTier,
} from './agentStateMerge.js';

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

  it('partial tier empty when at least one patchable field present', () => {
    expect(intakeMissingFieldsForTier({ name: 'Manuela', age: '6' }, 'partial')).toEqual([]);
  });

  it('partial tier still empty without cpf', () => {
    expect(intakeMissingFieldsForTier({ name: 'Manuela' }, 'partial')).toEqual([]);
  });

  it('full tier requires name cpf birthDate', () => {
    expect(intakeMissingFieldsForTier({ name: 'Manuela' }, 'full')).toContain('cpf');
    expect(intakeMissingFieldsForTier({ name: 'Manuela' }, 'full')).toContain('birthDate');
  });

  it('full tier complete when all present', () => {
    expect(
      intakeMissingFieldsForTier(
        { name: 'Manuela', cpf: '12345678901', birthDate: '2019-01-01' },
        'full'
      )
    ).toEqual([]);
  });
});

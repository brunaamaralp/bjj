import { describe, it, expect } from 'vitest';
import { getPrimarySuggestedLeadAction } from '../lib/leadClassificationActions.js';
import { TERMS } from '../lib/terminology.js';

describe('getPrimarySuggestedLeadAction', () => {
  const fitnessTerms = TERMS.fitness;
  const physioTerms = TERMS.physio;

  it('suggests assume inbox when needHuman', () => {
    const action = getPrimarySuggestedLeadAction(
      { needHuman: true, phone: '11999999999' },
      { terms: fitnessTerms }
    );
    expect(action?.id).toBe('assume_inbox');
  });

  it('fitness: schedule trial for aula_experimental without date', () => {
    const action = getPrimarySuggestedLeadAction(
      { intention: 'aula_experimental' },
      { terms: fitnessTerms }
    );
    expect(action?.label).toMatch(/experimental/i);
  });

  it('physio: schedule trial label uses avaliação', () => {
    const action = getPrimarySuggestedLeadAction(
      { intention: 'aula_experimental' },
      { terms: physioTerms }
    );
    expect(action?.label).toMatch(/avaliação/i);
  });

  it('suggests link student for aluno_atual', () => {
    const action = getPrimarySuggestedLeadAction(
      { intention: 'aluno_atual' },
      { terms: fitnessTerms }
    );
    expect(action?.id).toBe('link_student');
    expect(action?.label).toMatch(/aluno/i);
  });
});

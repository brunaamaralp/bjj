import { describe, it, expect } from 'vitest';
import {
  intentionDisplayLabel,
  priorityDisplayLabel,
  hotLeadDisplayLabel,
} from '../lib/whatsappClassificationLabels.js';
import { TERMS } from '../lib/terminology.js';

describe('whatsappClassificationLabels', () => {
  it('fitness: aula_experimental', () => {
    expect(intentionDisplayLabel('aula_experimental', { terms: TERMS.fitness })).toBe(
      'Quer agendar experimental'
    );
  });

  it('physio: aula_experimental', () => {
    expect(intentionDisplayLabel('aula_experimental', { terms: TERMS.physio })).toBe(
      'Quer agendar avaliação'
    );
  });

  it('priority alta', () => {
    expect(priorityDisplayLabel('alta')).toBe('Urgente');
  });

  it('hotLead label', () => {
    expect(hotLeadDisplayLabel(true)).toBe('Interessado');
    expect(hotLeadDisplayLabel(false)).toBe('');
  });
});

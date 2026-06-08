import { describe, it, expect } from 'vitest';
import {
  parseLeadYmd,
  formatLeadScheduledLine,
  formatRelativeTimeAgo,
  formatLeadLastInteractionLine,
  pluralizeContactLabel,
} from '../lib/pipelineLeadDisplay.js';

describe('parseLeadYmd', () => {
  it('aceita YYYY-MM-DD válido', () => {
    const d = parseLeadYmd('2026-06-09');
    expect(d?.getDate()).toBe(9);
    expect(d?.getMonth()).toBe(5);
  });

  it('rejeita formato inválido (dd/mm/yyyy)', () => {
    expect(parseLeadYmd('09/06/2026')).toBeNull();
  });
});

describe('formatLeadScheduledLine', () => {
  it('retorna null para data inválida', () => {
    expect(formatLeadScheduledLine({ scheduledDate: '09/06/2026', scheduledTime: '19:00' })).toBeNull();
  });
});

describe('formatLeadLastInteractionLine', () => {
  it('formata última msg quando há activity', () => {
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(formatLeadLastInteractionLine({ lastWhatsappActivityAt: recent })).toBe('Última msg há 2d');
  });

  it('retorna null sem activity', () => {
    expect(formatLeadLastInteractionLine({})).toBeNull();
  });
});

describe('pluralizeContactLabel', () => {
  it('singular com 1', () => {
    expect(pluralizeContactLabel(1, 'Leads')).toBe('lead');
  });

  it('plural com 61', () => {
    expect(pluralizeContactLabel(61, 'Leads')).toBe('leads');
  });
});

describe('formatRelativeTimeAgo', () => {
  it('retorna vazio para data inválida', () => {
    expect(formatRelativeTimeAgo('invalid')).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import {
  formatEnrollmentAnswerNote,
  normalizeCustomLeadQuestions,
  buildCustomAnswersPatch,
} from '../lib/customLeadQuestions.js';
import { readEnrollmentFollowUpTask, addDaysToYmd } from '../lib/enrollmentSettings.js';

describe('customLeadQuestions', () => {
  it('formata nota padronizada', () => {
    expect(formatEnrollmentAnswerNote('Produto de entrada', 'Sim', 'boolean')).toBe('Produto de entrada: Sim');
    expect(formatEnrollmentAnswerNote('Tamanho', 'M', 'select')).toBe('Tamanho: M');
  });

  it('normaliza tipo checkbox para boolean', () => {
    const { questions } = normalizeCustomLeadQuestions([
      { id: 'q1', label: 'Venda no ato', type: 'checkbox' },
    ]);
    expect(questions[0].type).toBe('boolean');
  });

  it('monta patch de respostas', () => {
    const qs = [{ id: 'q1', label: 'Item', type: 'boolean' }];
    expect(buildCustomAnswersPatch(qs, { q1: true })).toEqual({ q1: true });
  });
});

describe('enrollmentSettings', () => {
  it('lê follow-up quando configurado', () => {
    const raw = JSON.stringify({
      enrollmentFollowUpTask: { title: 'Ligação de boas-vindas', days: 7 },
    });
    expect(readEnrollmentFollowUpTask(raw)).toEqual({ title: 'Ligação de boas-vindas', days: 7 });
  });

  it('retorna null sem config válida', () => {
    expect(readEnrollmentFollowUpTask(JSON.stringify({ enrollmentFollowUpTask: { title: '', days: 30 } }))).toBeNull();
    expect(readEnrollmentFollowUpTask(null)).toBeNull();
  });

  it('calcula due_date', () => {
    expect(addDaysToYmd(30, new Date('2026-05-18T12:00:00'))).toBe('2026-06-17');
  });
});

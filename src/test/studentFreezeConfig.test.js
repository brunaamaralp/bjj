import { describe, it, expect } from 'vitest';
import {
  parseStudentFreezeReasons,
  DEFAULT_STUDENT_FREEZE_REASONS,
  mergeFreezeReasonsIntoSettings,
  readStudentFreezeReasonsFromAcademyDoc,
} from '../lib/studentFreezeConfig.js';

describe('studentFreezeReasons', () => {
  it('usa lista padrão quando vazio', () => {
    expect(parseStudentFreezeReasons(null)).toEqual(DEFAULT_STUDENT_FREEZE_REASONS);
  });

  it('preserva custom e garante Outro', () => {
    const custom = parseStudentFreezeReasons(JSON.stringify(['Viagem longa']));
    expect(custom[0]).toBe('Viagem longa');
    expect(custom.some((r) => r.toLowerCase() === 'outro')).toBe(true);
  });

  it('grava e lê motivos em academy.settings', () => {
    const merged = mergeFreezeReasonsIntoSettings('{}', ['Viagem', 'Outro']);
    const doc = { settings: JSON.stringify(merged) };
    expect(readStudentFreezeReasonsFromAcademyDoc(doc)).toContain('Viagem');
  });
});

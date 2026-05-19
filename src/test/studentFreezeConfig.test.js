import { describe, it, expect } from 'vitest';
import {
  parseStudentFreezeReasons,
  DEFAULT_STUDENT_FREEZE_REASONS,
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
});

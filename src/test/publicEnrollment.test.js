import { describe, it, expect } from 'vitest';
import {
  readPublicEnrollment,
  mergePublicEnrollmentIntoSettings,
  buildPublicEnrollmentFormConfig,
  readAcademyPlanNames,
  normalizeEnrollmentPhone,
  generateEnrollmentSalt,
  buildPublicEnrollmentPath,
} from '../lib/publicEnrollmentSettings.js';
import {
  createPublicEnrollmentToken,
  verifyPublicEnrollmentToken,
} from '../lib/publicEnrollmentToken.js';

describe('publicEnrollment', () => {
  it('merge and read publicEnrollment settings', () => {
    const merged = mergePublicEnrollmentIntoSettings('{}', { enabled: true, salt: 'abc123' });
    const cfg = readPublicEnrollment(JSON.stringify(merged));
    expect(cfg.enabled).toBe(true);
    expect(cfg.salt).toBe('abc123');
  });

  it('buildPublicEnrollmentFormConfig strips sensitive fields', () => {
    const form = buildPublicEnrollmentFormConfig({
      name: 'Academia Teste',
      settings: JSON.stringify({ turmas: ['Manhã', 'Noite'], publicEnrollment: { enabled: true, salt: 'x' } }),
      financeConfig: JSON.stringify({ plans: [{ name: 'Mensal' }, { name: 'Anual' }] }),
      customLeadQuestions: [{ id: 'q1', label: 'Como nos conheceu?', type: 'text' }],
    });
    expect(form.academyName).toBe('Academia Teste');
    expect(form.turmas).toEqual(['Manhã', 'Noite']);
    expect(form.plans).toEqual(['Anual', 'Mensal']);
    expect(form.requirePlan).toBe(true);
    expect(form.customQuestions).toHaveLength(1);
    expect(form.enabled).toBe(true);
  });

  it('normalizeEnrollmentPhone strips country code', () => {
    expect(normalizeEnrollmentPhone('(11) 98888-7777')).toBe('11988887777');
    expect(normalizeEnrollmentPhone('5511988887777')).toBe('11988887777');
  });

  it('readAcademyPlanNames from financeConfig', () => {
    expect(readAcademyPlanNames({ financeConfig: { plans: [{ name: 'Básico' }] } })).toEqual(['Básico']);
  });

  it('token round-trip', async () => {
    const salt = generateEnrollmentSalt();
    const secret = 'test-secret-key';
    const token = await createPublicEnrollmentToken('academy-1', salt, secret);
    expect(token.split('.')).toHaveLength(3);
    const parsed = await verifyPublicEnrollmentToken(token, secret);
    expect(parsed).toEqual({ academyId: 'academy-1', salt });
    expect(buildPublicEnrollmentPath(token)).toContain('/inscricao/');
  });

  it('rejects tampered token', async () => {
    const token = await createPublicEnrollmentToken('academy-1', 'salt1', 'secret');
    const parts = token.split('.');
    parts[2] = `${parts[2].slice(0, -2)}xx`;
    const bad = await verifyPublicEnrollmentToken(parts.join('.'), 'secret');
    expect(bad).toBeNull();
  });
});

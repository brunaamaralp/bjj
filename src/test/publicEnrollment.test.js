import { describe, it, expect } from 'vitest';
import {
  readPublicEnrollment,
  mergePublicEnrollmentIntoSettings,
  buildPublicEnrollmentFormConfig,
  readAcademyPlanNames,
  normalizeEnrollmentPhone,
  generateEnrollmentSalt,
  buildPublicEnrollmentPath,
  resolvePublicEnrollmentBelt,
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
    expect(cfg.askBelt).toBe(false);
  });

  it('merge preserves askBelt when patch omits it', () => {
    const base = mergePublicEnrollmentIntoSettings('{}', { enabled: true, salt: 'x', askBelt: true });
    const merged = mergePublicEnrollmentIntoSettings(JSON.stringify(base), { enabled: false });
    const cfg = readPublicEnrollment(JSON.stringify(merged));
    expect(cfg.enabled).toBe(false);
    expect(cfg.askBelt).toBe(true);
  });

  it('buildPublicEnrollmentFormConfig exposes graduation fields when configured', () => {
    const settings = {
      beltGrades: ['Branca', 'Azul'],
      publicEnrollment: { enabled: true, salt: 'x', askBelt: true },
    };
    const form = buildPublicEnrollmentFormConfig({
      name: 'Academia BJJ',
      vertical: 'fitness',
      settings: JSON.stringify(settings),
    });
    expect(form.graduationsActive).toBe(true);
    expect(form.askBelt).toBe(true);
    expect(form.beltOptions).toEqual(['Branca', 'Azul']);
    expect(form.graduationLabel).toBe('Faixa');
  });

  it('askBelt false in form config when graduations inactive', () => {
    const form = buildPublicEnrollmentFormConfig({
      settings: JSON.stringify({ publicEnrollment: { enabled: true, salt: 'x', askBelt: true } }),
    });
    expect(form.graduationsActive).toBe(false);
    expect(form.askBelt).toBe(false);
    expect(form.beltOptions).toEqual([]);
  });

  it('resolvePublicEnrollmentBelt ignores belt when askBelt off', () => {
    const settings = JSON.stringify({
      beltGrades: ['Branca'],
      publicEnrollment: { askBelt: false },
    });
    expect(resolvePublicEnrollmentBelt({ belt: 'Branca' }, settings)).toBe('');
  });

  it('resolvePublicEnrollmentBelt normalizes valid belt', () => {
    const settings = JSON.stringify({
      beltGrades: ['Branca', 'Azul'],
      publicEnrollment: { askBelt: true },
    });
    expect(resolvePublicEnrollmentBelt({ belt: 'Azul' }, settings)).toBe('Azul');
    expect(resolvePublicEnrollmentBelt({ belt: 'Roxa' }, settings)).toBe('');
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

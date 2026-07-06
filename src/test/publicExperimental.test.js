import { describe, it, expect } from 'vitest';
import {
  readPublicExperimental,
  mergePublicExperimentalIntoSettings,
  buildPublicExperimentalFormConfig,
  buildPublicExperimentalPath,
  generateExperimentalSalt,
} from '../lib/publicExperimentalSettings.js';
import {
  createPublicExperimentalToken,
  verifyPublicExperimentalToken,
} from '../lib/publicExperimentalToken.js';
import {
  inferProfileTypeFromBirthDate,
  isSlotVisibleForProfileType,
  filterSlotsForProfileType,
} from '../lib/publicExperimentalAudience.js';
import { validatePublicExperimentalForm } from '../../lib/server/publicExperimentalBook.js';

describe('publicExperimental', () => {
  it('merge and read publicExperimental settings', () => {
    const merged = mergePublicExperimentalIntoSettings('{}', { enabled: true, salt: 'abc123' });
    const cfg = readPublicExperimental(JSON.stringify(merged));
    expect(cfg.enabled).toBe(true);
    expect(cfg.salt).toBe('abc123');
    expect(cfg.audienceRules['Criança']).toBeTruthy();
  });

  it('buildPublicExperimentalFormConfig', () => {
    const settings = { publicExperimental: { enabled: true, salt: 'x' } };
    const form = buildPublicExperimentalFormConfig({ name: 'GB SJo', settings: JSON.stringify(settings) });
    expect(form.enabled).toBe(true);
    expect(form.academyName).toBe('GB SJo');
  });

  it('buildPublicExperimentalPath', () => {
    expect(buildPublicExperimentalPath('tok.en')).toBe('/experimental/tok.en');
  });

  it('token roundtrip', async () => {
    const salt = generateExperimentalSalt();
    const token = await createPublicExperimentalToken('acad-1', salt, 'test-secret-key-32chars!!!!');
    expect(token).toBeTruthy();
    const parsed = await verifyPublicExperimentalToken(token, 'test-secret-key-32chars!!!!');
    expect(parsed?.academyId).toBe('acad-1');
    expect(parsed?.salt).toBe(salt);
  });

  it('inferProfileTypeFromBirthDate', () => {
    expect(inferProfileTypeFromBirthDate('2018-01-15', new Date('2026-07-06'))).toBe('Criança');
    expect(inferProfileTypeFromBirthDate('2010-06-01', new Date('2026-07-06'))).toBe('Juniores');
    expect(inferProfileTypeFromBirthDate('1990-03-20', new Date('2026-07-06'))).toBe('Adulto');
  });

  it('filters GBK slots for children', () => {
    const slots = [
      { id: '1', name: 'GBK Kids', level: 'GBK', modality: 'bjj' },
      { id: '2', name: 'GB1 Fundamentals', level: 'GB1', modality: 'bjj' },
      { id: '3', name: 'Noite', level: '', modality: 'bjj' },
    ];
    const childSlots = filterSlotsForProfileType(slots, 'Criança');
    expect(childSlots.map((s) => s.id)).toEqual(['1', '3']);
    expect(isSlotVisibleForProfileType(slots[1], 'Criança')).toBe(false);
  });

  it('validatePublicExperimentalForm requires parent for minor', () => {
    const adult = validatePublicExperimentalForm({
      name: 'João',
      phone: '11999998888',
      birthDate: '1990-01-01',
    });
    expect(adult.ok).toBe(true);

    const child = validatePublicExperimentalForm({
      name: 'Pedro',
      phone: '11999997777',
      birthDate: '2018-05-05',
    });
    expect(child.ok).toBe(false);
    expect(child.code).toBe('parent_required');
  });
});

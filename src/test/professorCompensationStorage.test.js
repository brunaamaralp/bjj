import { describe, it, expect } from 'vitest';
import {
  readProfessorCompensationFromAcademy,
  mergeProfessorCompensationIntoSettings,
  PROFESSOR_COMPENSATION_SETTINGS_KEY,
} from '../lib/professorCompensationStorage.js';
import { DEFAULT_PRODUCT_DISCOUNT_PCT } from '../../lib/professorCompensation.js';

describe('professorCompensationStorage', () => {
  it('read from empty academy → default discount 30', () => {
    const result = readProfessorCompensationFromAcademy({});
    expect(result.product_discount_pct).toBe(DEFAULT_PRODUCT_DISCOUNT_PCT);
    expect(result.product_discount_pct).toBe(30);
    expect(result.roles.professor).toEqual({ lesson_amount: 0, experimental_amount: 0 });
    expect(result.roles.instructor).toEqual({ lesson_amount: 0, experimental_amount: 0 });
    expect(result.overrides).toEqual({});
  });

  it('read from settings with professorCompensation', () => {
    const doc = {
      settings: JSON.stringify({
        [PROFESSOR_COMPENSATION_SETTINGS_KEY]: {
          product_discount_pct: 40,
          roles: {
            professor: { lesson_amount: 50, experimental_amount: 25 },
            instructor: { lesson_amount: 30, experimental_amount: 15 },
          },
          overrides: {
            staff_1: { lesson_amount: 80 },
          },
        },
      }),
    };
    const result = readProfessorCompensationFromAcademy(doc);
    expect(result.product_discount_pct).toBe(40);
    expect(result.roles.professor).toEqual({ lesson_amount: 50, experimental_amount: 25 });
    expect(result.roles.instructor).toEqual({ lesson_amount: 30, experimental_amount: 15 });
    expect(result.overrides.staff_1).toEqual({ lesson_amount: 80 });
  });

  it('merge preserves other settings keys and writes normalized compensation', () => {
    const raw = JSON.stringify({
      stockCheckSchedule: { enabled: true },
      followupPlaybook: { version: 1 },
    });
    const merged = mergeProfessorCompensationIntoSettings(raw, {
      product_discount_pct: 999,
      roles: {
        professor: { lesson_amount: -10, experimental_amount: 20 },
      },
      overrides: {
        '': { lesson_amount: 1 },
        'ref-a': { lesson_amount: 100, experimental_amount: 50 },
      },
    });

    expect(merged.stockCheckSchedule).toEqual({ enabled: true });
    expect(merged.followupPlaybook).toEqual({ version: 1 });
    expect(merged[PROFESSOR_COMPENSATION_SETTINGS_KEY]).toEqual({
      product_discount_pct: 30,
      roles: {
        professor: { lesson_amount: 0, experimental_amount: 20 },
        instructor: { lesson_amount: 0, experimental_amount: 0 },
      },
      overrides: {
        'ref-a': { lesson_amount: 100, experimental_amount: 50 },
      },
    });
  });
});

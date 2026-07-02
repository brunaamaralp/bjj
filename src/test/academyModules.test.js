import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ACADEMY_MODULES,
  normalizeAcademyModules,
  academyModulesForSave,
} from '../lib/academyModules.js';

describe('academyModules', () => {
  it('DEFAULT_ACADEMY_MODULES habilita vendas', () => {
    expect(DEFAULT_ACADEMY_MODULES.sales).toBe(true);
  });

  it('normalizeAcademyModules força sales true mesmo com false no doc', () => {
    expect(
      normalizeAcademyModules({ sales: false, inventory: true, finance: false })
    ).toEqual({
      sales: true,
      inventory: true,
      finance: false,
      aiEnabled: true,
    });
  });

  it('academyModulesForSave persiste sales true', () => {
    expect(academyModulesForSave({ sales: false, inventory: true })).toMatchObject({
      sales: true,
      inventory: true,
    });
  });
});

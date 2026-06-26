import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENROLLMENT_DISCOUNT_PRESETS,
  findMatchingPreset,
  formatPresetOptionLabel,
  normalizeEnrollmentDiscountPresets,
  readEnrollmentDiscountPresets,
  resolvePresetSelectionKey,
  PRESET_CUSTOM,
  PRESET_NONE,
} from '../lib/enrollmentDiscountPresets.js';
import { DISCOUNT_TYPES } from '../lib/planBilling.js';

describe('enrollmentDiscountPresets', () => {
  it('normalizes valid presets and drops invalid rows', () => {
    const out = normalizeEnrollmentDiscountPresets([
      { id: 'family', label: 'Família', type: 'percent', amount: 7 },
      { label: '', type: 'percent', amount: 5 },
      { label: 'X', type: 'percent', amount: 150 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Família');
  });

  it('readEnrollmentDiscountPresets falls back to defaults', () => {
    expect(readEnrollmentDiscountPresets({})).toEqual(DEFAULT_ENROLLMENT_DISCOUNT_PRESETS);
    expect(readEnrollmentDiscountPresets({ enrollmentDiscountPresets: [] })).toEqual(
      DEFAULT_ENROLLMENT_DISCOUNT_PRESETS
    );
  });

  it('formatPresetOptionLabel shows percent and fixed', () => {
    expect(formatPresetOptionLabel({ label: 'Família', type: 'percent', amount: 7 })).toBe(
      'Família — 7%'
    );
    expect(
      formatPresetOptionLabel({ label: 'Bolsa', type: DISCOUNT_TYPES.FIXED, amount: 50 })
    ).toContain('Bolsa');
  });

  it('findMatchingPreset matches type and amount', () => {
    const presets = [{ id: 'family', label: 'Família', type: 'percent', amount: 7 }];
    expect(findMatchingPreset(presets, 'percent', 7)?.id).toBe('family');
    expect(findMatchingPreset(presets, 'percent', 8)).toBeNull();
  });

  it('resolvePresetSelectionKey maps none, preset and custom', () => {
    const presets = [{ id: 'family', label: 'Família', type: 'percent', amount: 7 }];
    expect(resolvePresetSelectionKey(presets, 'none', 0)).toBe(PRESET_NONE);
    expect(resolvePresetSelectionKey(presets, 'percent', 7)).toBe('family');
    expect(resolvePresetSelectionKey(presets, 'percent', 5)).toBe(PRESET_CUSTOM);
  });
});

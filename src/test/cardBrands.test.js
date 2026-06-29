import { describe, it, expect } from 'vitest';
import { normalizeCardBrand, CARD_BRAND_UI_LABELS } from '../lib/cardBrands.js';

describe('cardBrands', () => {
  it('normaliza aliases', () => {
    expect(normalizeCardBrand('VISA')).toBe('visa');
    expect(normalizeCardBrand('master')).toBe('mastercard');
    expect(normalizeCardBrand('')).toBe('default');
  });

  it('tem label PT para visa', () => {
    expect(CARD_BRAND_UI_LABELS.visa).toBe('Visa');
  });
});

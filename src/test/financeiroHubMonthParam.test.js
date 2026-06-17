import { describe, it, expect } from 'vitest';
import { parseReferenceMonth } from '../lib/monthlyClosing.js';

describe('financeiro hub month query param', () => {
  it('parseReferenceMonth aceita YYYY-MM para ?month=', () => {
    expect(parseReferenceMonth('2026-03')).toBe('2026-03');
    expect(parseReferenceMonth('2026-3')).toBeNull();
    expect(parseReferenceMonth('')).toBeNull();
  });
});

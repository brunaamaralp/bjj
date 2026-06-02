import { describe, expect, it } from 'vitest';
import {
  encodeFinanceTxListCursor,
  parseFinanceTxListCursor,
} from '../../lib/server/financeTxQuery.js';

describe('financeTx list cursor', () => {
  it('parseFinanceTxListCursor returns 0 for empty or invalid', () => {
    expect(parseFinanceTxListCursor('')).toBe(0);
    expect(parseFinanceTxListCursor('not-valid')).toBe(0);
  });

  it('round-trips offset cursor', () => {
    const c = encodeFinanceTxListCursor(50);
    expect(parseFinanceTxListCursor(c)).toBe(50);
    expect(parseFinanceTxListCursor(encodeFinanceTxListCursor(0))).toBe(0);
  });

  it('encodeFinanceTxListCursor clamps negative', () => {
    expect(parseFinanceTxListCursor(encodeFinanceTxListCursor(-5))).toBe(0);
  });
});

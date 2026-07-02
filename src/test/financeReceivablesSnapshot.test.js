import { describe, expect, it } from 'vitest';
import { parseReceivablesPagination } from '../../lib/server/financeReceivablesSnapshot.js';

describe('parseReceivablesPagination', () => {
  it('defaults to 80 items at offset 0', () => {
    expect(parseReceivablesPagination({})).toEqual({ limit: 80, offset: 0 });
  });

  it('clamps limit to max 200', () => {
    expect(parseReceivablesPagination({ limit: '999' })).toEqual({ limit: 200, offset: 0 });
  });

  it('parses offset and minimum limit', () => {
    expect(parseReceivablesPagination({ limit: '10', offset: '40' })).toEqual({
      limit: 10,
      offset: 40,
    });
  });
});

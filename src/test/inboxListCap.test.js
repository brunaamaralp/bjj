import { describe, it, expect } from 'vitest';
import { capInboxListItems, MAX_INBOX_LIST_ITEMS } from '../lib/inboxListCap.js';

describe('capInboxListItems', () => {
  it('returns same list when under cap', () => {
    const items = [{ phone_number: '5511999990001' }];
    const { items: out, capped } = capInboxListItems(items, '');
    expect(capped).toBe(false);
    expect(out).toEqual(items);
  });

  it('trims to last MAX items and sets capped', () => {
    const items = Array.from({ length: MAX_INBOX_LIST_ITEMS + 10 }, (_, i) => ({
      phone_number: `551199999${String(i).padStart(4, '0')}`,
    }));
    const { items: out, capped } = capInboxListItems(items, '');
    expect(capped).toBe(true);
    expect(out).toHaveLength(MAX_INBOX_LIST_ITEMS);
    expect(out[0].phone_number).toBe(items[10].phone_number);
  });

  it('keeps selected phone in list when it would be trimmed', () => {
    const items = Array.from({ length: MAX_INBOX_LIST_ITEMS + 5 }, (_, i) => ({
      phone_number: `5511888${String(i).padStart(5, '0')}`,
    }));
    const selected = items[0].phone_number;
    const { items: out, capped } = capInboxListItems(items, selected);
    expect(capped).toBe(true);
    expect(out.some((it) => it.phone_number === selected)).toBe(true);
  });
});

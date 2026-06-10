import { describe, it, expect } from 'vitest';
import { inboxMessageKey, inboxMessagesChanged } from '../lib/inboxMessageUtils.js';

describe('inboxMessagesChanged', () => {
  const base = [
    { message_id: 'a', role: 'user', content: 'Oi', status: 'sent' },
    { message_id: 'b', role: 'assistant', content: 'Olá', status: 'sent' },
  ];

  it('returns false when lists are identical', () => {
    expect(inboxMessagesChanged(base, [...base])).toBe(false);
  });

  it('returns true when length differs', () => {
    expect(inboxMessagesChanged(base, base.slice(0, 1))).toBe(true);
  });

  it('returns true when status changes', () => {
    const next = [{ ...base[0], status: 'delivered' }, base[1]];
    expect(inboxMessagesChanged(base, next)).toBe(true);
  });

  it('uses inboxMessageKey fallback for messages without id', () => {
    const prev = [{ role: 'user', timestamp: '2026-01-01', content: 'x' }];
    const same = [{ role: 'user', timestamp: '2026-01-01', content: 'x' }];
    const diff = [{ role: 'user', timestamp: '2026-01-01', content: 'y' }];
    expect(inboxMessageKey(prev[0])).toBeTruthy();
    expect(inboxMessagesChanged(prev, same)).toBe(false);
    expect(inboxMessagesChanged(prev, diff)).toBe(true);
  });
});

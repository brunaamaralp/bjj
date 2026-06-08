import { describe, it, expect } from 'vitest';
import { recalcUnreadCount } from '../../lib/server/conversationsStore.js';

describe('recalcUnreadCount', () => {
  const messages = [
    { role: 'user', timestamp: '2026-01-01T10:00:00.000Z', content: 'a' },
    { role: 'assistant', timestamp: '2026-01-01T10:01:00.000Z', content: 'b' },
    { role: 'user', timestamp: '2026-01-01T11:00:00.000Z', content: 'c' },
    { role: 'user', timestamp: '2026-01-01T12:00:00.000Z', content: 'd' },
  ];

  it('conta todas inbound sem last_read_at', () => {
    expect(recalcUnreadCount(messages, null)).toBe(3);
    expect(recalcUnreadCount(messages, '')).toBe(3);
  });

  it('conta inbound após last_read_at', () => {
    expect(recalcUnreadCount(messages, '2026-01-01T10:30:00.000Z')).toBe(2);
    expect(recalcUnreadCount(messages, '2026-01-01T12:00:00.000Z')).toBe(0);
  });

  it('ignora mensagens assistant', () => {
    expect(recalcUnreadCount([{ role: 'assistant', timestamp: '2026-01-01T13:00:00.000Z' }], null)).toBe(0);
  });

  it('conta inbound sem timestamp quando há last_read_at', () => {
    expect(
      recalcUnreadCount(
        [{ role: 'user', content: 'x' }, { role: 'user', timestamp: '2026-01-02T00:00:00.000Z', content: 'y' }],
        '2026-01-01T00:00:00.000Z',
      ),
    ).toBe(2);
  });
});

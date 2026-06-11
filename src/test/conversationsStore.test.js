import { describe, it, expect } from 'vitest';
import { recalcUnreadCount, resolveUnreadCountAfterMerge } from '../../lib/server/conversationsStore.js';
import { buildMessagesRecentPayload } from '../../lib/server/conversationMessages.js';

describe('buildMessagesRecentPayload', () => {
  it('serializa cauda das mensagens', () => {
    const msgs = [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }];
    const parsed = JSON.parse(buildMessagesRecentPayload(msgs, 1));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].content).toBe('b');
  });

  it('cabe no limite de 32KB mesmo com conteúdo grande', () => {
    const msgs = Array.from({ length: 80 }, (_, i) => ({
      role: 'user',
      message_id: `m${i}`,
      timestamp: `2026-01-01T10:${String(i).padStart(2, '0')}:00.000Z`,
      content: 'x'.repeat(2000),
      mediaUrl: `https://example.com/${'a'.repeat(500)}.jpg`,
    }));
    const json = buildMessagesRecentPayload(msgs);
    expect(json.length).toBeLessThanOrEqual(32768);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

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

describe('resolveUnreadCountAfterMerge', () => {
  const history = [
    { role: 'user', message_id: 'm1', timestamp: '2026-01-01T10:00:00.000Z', content: 'a' },
    { role: 'assistant', message_id: 'm2', timestamp: '2026-01-01T10:01:00.000Z', content: 'b' },
    { role: 'user', message_id: 'm3', timestamp: '2026-01-01T11:00:00.000Z', content: 'c' },
  ];

  it('preserva lida sem last_read_at quando prevUnread é 0', () => {
    expect(
      resolveUnreadCountAfterMerge({
        messages: history,
        lastReadAt: '',
        prevUnread: 0,
        historyMessages: history,
      }),
    ).toBe(0);
  });

  it('conta só inbound nova no merge quando prevUnread é 0 e sem last_read_at', () => {
    const merged = [
      ...history,
      { role: 'user', message_id: 'm4', timestamp: '2026-01-01T12:00:00.000Z', content: 'd' },
    ];
    expect(
      resolveUnreadCountAfterMerge({
        messages: merged,
        lastReadAt: '',
        prevUnread: 0,
        historyMessages: history,
      }),
    ).toBe(1);
  });

  it('usa last_read_at quando presente', () => {
    expect(
      resolveUnreadCountAfterMerge({
        messages: history,
        lastReadAt: '2026-01-01T10:30:00.000Z',
        prevUnread: 0,
        historyMessages: history,
      }),
    ).toBe(1);
  });
});

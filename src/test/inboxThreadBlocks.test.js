import { describe, it, expect } from 'vitest';
import { buildInboxThreadBlocks } from '../lib/inboxThreadBlocks.js';

describe('buildInboxThreadBlocks', () => {
  it('groups messages by day and bubble kind', () => {
    const messages = [
      { role: 'user', timestamp: '2026-03-01T10:00:00.000Z', content: 'Oi', message_id: 'm1' },
      {
        role: 'assistant',
        sender: 'human',
        timestamp: '2026-03-01T10:01:00.000Z',
        content: 'Olá',
        message_id: 'm2',
      },
    ];
    const blocks = buildInboxThreadBlocks(messages);
    expect(blocks.some((b) => b.type === 'day')).toBe(true);
    expect(blocks.filter((b) => b.type === 'group')).toHaveLength(2);
  });

  it('returns empty array for no messages', () => {
    expect(buildInboxThreadBlocks([])).toEqual([]);
  });
});

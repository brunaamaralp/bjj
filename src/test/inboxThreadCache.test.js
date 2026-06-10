import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildSelectedFromListItem,
  getInboxThreadCache,
  setInboxThreadCache,
  threadPaginationFromCache,
  invalidateInboxThreadCache,
} from '../lib/inboxThreadCache.js';

describe('inboxThreadCache helpers', () => {
  beforeEach(() => {
    invalidateInboxThreadCache('acad-1', '5511999887766');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buildSelectedFromListItem uses cached messages immediately', () => {
    setInboxThreadCache('acad-1', '5511999887766', {
      messages: [{ message_id: 'm1', role: 'user', content: 'Olá' }],
      nextCursor: '10',
      summary: {
        phone: '5511999887766',
        conversation_id: 'conv-1',
        lead_name: 'Maria',
        ticket_status: 'open',
      },
    });

    const cached = getInboxThreadCache('acad-1', '5511999887766');
    const selected = buildSelectedFromListItem(
      { id: 'conv-1', phone_number: '5511999887766', lead_name: 'Maria' },
      null,
      cached
    );

    expect(selected.messages).toHaveLength(1);
    expect(selected.messages[0].content).toBe('Olá');
    expect(selected.conversation_id).toBe('conv-1');
  });

  it('threadPaginationFromCache reflects next cursor', () => {
    expect(threadPaginationFromCache(null)).toEqual({ cursor: null, hasMore: false });
    expect(
      threadPaginationFromCache({ nextCursor: '42', messages: [] })
    ).toEqual({ cursor: '42', hasMore: true });
  });
});

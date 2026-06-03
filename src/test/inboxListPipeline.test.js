import { describe, it, expect } from 'vitest';
import { filterInboxListItems, groupInboxListItems } from '../lib/inboxListPipeline.js';

describe('inboxListPipeline', () => {
  const items = [
    { _handoffActive: true, _unreadCount: 0, _ticketStatus: 'open' },
    { _handoffActive: false, _unreadCount: 2, _ticketStatus: 'open' },
    { _handoffActive: false, _unreadCount: 0, _ticketStatus: 'resolved' },
  ];

  it('needs_me filter keeps only handoff', () => {
    const out = filterInboxListItems(items, 'needs_me');
    expect(out).toHaveLength(1);
    expect(out[0]._handoffActive).toBe(true);
  });

  it('groups into unread, open, resolved', () => {
    const groups = groupInboxListItems(items);
    expect(groups.find((g) => g.key === 'unread')?.items).toHaveLength(1);
    expect(groups.find((g) => g.key === 'resolved')?.items).toHaveLength(1);
    expect(groups.find((g) => g.key === 'open')?.items).toHaveLength(1);
  });
});

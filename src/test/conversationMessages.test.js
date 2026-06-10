import { describe, it, expect } from 'vitest';
import {
  paginateMessagesWindow,
  buildMessagesRecentPayload,
  loadThreadMessagesFromDoc,
  threadNeedsFullMessagesFetch,
  MESSAGES_RECENT_CAP,
} from '../../lib/server/conversationMessages.js';

describe('conversationMessages', () => {
  const mkMsg = (id, ts) => ({ role: 'user', message_id: id, timestamp: ts, content: id });

  it('paginateMessagesWindow returns last page without cursor', () => {
    const sorted = [1, 2, 3, 4, 5].map((n) => mkMsg(String(n), `2026-01-01T10:0${n}:00.000Z`));
    const { slice, next_cursor } = paginateMessagesWindow(sorted, 2, '');
    expect(slice).toHaveLength(2);
    expect(slice[0].message_id).toBe('4');
    expect(next_cursor).toBe('3');
  });

  it('buildMessagesRecentPayload caps tail', () => {
    const msgs = Array.from({ length: 100 }, (_, i) => mkMsg(String(i), `2026-01-01T10:00:${String(i).padStart(2, '0')}.000Z`));
    const parsed = JSON.parse(buildMessagesRecentPayload(msgs, 10));
    expect(parsed).toHaveLength(10);
    expect(parsed[0].message_id).toBe('90');
  });

  it('loadThreadMessagesFromDoc uses messages_recent and links to full history', () => {
    const full = Array.from({ length: 20 }, (_, i) => mkMsg(`f${i}`, `2026-01-01T10:${String(i).padStart(2, '0')}:00.000Z`));
    const recent = full.slice(-6);
    const doc = {
      messages: JSON.stringify(full),
      messages_recent: JSON.stringify(recent),
    };
    let page = loadThreadMessagesFromDoc(doc, { limit: 5, cursor: '' });
    expect(page.slice).toHaveLength(5);
    expect(page.next_cursor).toBe('1');
    page = loadThreadMessagesFromDoc(doc, { limit: 5, cursor: page.next_cursor });
    expect(page.next_cursor).toBe('full:14');
  });

  it('threadNeedsFullMessagesFetch detects full cursor', () => {
    expect(threadNeedsFullMessagesFetch('full:12')).toBe(true);
    expect(threadNeedsFullMessagesFetch('5')).toBe(false);
  });
});

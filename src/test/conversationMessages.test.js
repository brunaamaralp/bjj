import { describe, it, expect, vi } from 'vitest';
import {
  paginateMessagesWindow,
  buildMessagesRecentPayload,
  conversationMessagesStoragePayload,
  loadThreadMessagesFromDoc,
  threadNeedsFullMessagesFetch,
  hasUsableMessagesRecent,
  MESSAGES_RECENT_CAP,
  MESSAGES_STORE_MAX_BYTES,
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

  it('hasUsableMessagesRecent rejects empty or missing recent payload', () => {
    expect(hasUsableMessagesRecent({ messages_recent: '' })).toBe(false);
    expect(hasUsableMessagesRecent({ messages_recent: '[]' })).toBe(false);
    expect(hasUsableMessagesRecent({ messages_recent: JSON.stringify([mkMsg('1', '2026-01-01')]) })).toBe(true);
  });

  it('conversationMessagesStoragePayload truncates oldest messages when JSON exceeds store limit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pad = 'x'.repeat(900);
    const msgs = Array.from({ length: 80 }, (_, i) => ({
      role: 'user',
      message_id: String(i),
      timestamp: `2026-01-01T10:${String(i).padStart(2, '0')}:00.000Z`,
      content: `${pad}-${i}`,
    }));
    const fullJson = JSON.stringify(msgs);
    expect(fullJson.length).toBeGreaterThan(MESSAGES_STORE_MAX_BYTES - 64);

    const payload = conversationMessagesStoragePayload(msgs, {
      academyId: 'acad-1',
      phoneNumber: '5511999999999',
    });

    expect(payload.messages.length).toBeLessThanOrEqual(MESSAGES_STORE_MAX_BYTES - 64);
    const parsed = JSON.parse(payload.messages);
    expect(parsed.length).toBeLessThan(msgs.length);
    expect(parsed[parsed.length - 1].message_id).toBe('79');
    expect(warn).toHaveBeenCalled();
    const logLine = String(warn.mock.calls[0]?.[0] || '');
    expect(logLine).toContain('messages_store_truncated');
    expect(logLine).toContain('acad-1');
    expect(logLine).toContain('5511999999999');
    warn.mockRestore();
  });
});

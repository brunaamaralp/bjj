import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  conversationsArchivedQueryValue,
  describeArchivedListFilter,
  mapConversationItemsAfterRead,
  mapConversationItemsAfterUnread,
} from '../../src/lib/inboxConversationState.js';

describe('mapConversationItemsAfterRead', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('zera unread_count da conversa correta, não toca as outras', () => {
    const items = [
      { phone_number: '5511999990001', unread_count: 3 },
      { phone_number: '5511888880002', unread_count: 5 },
    ];
    const result = mapConversationItemsAfterRead(items, '5511999990001');
    expect(result[0]).toEqual({
      phone_number: '5511999990001',
      unread_count: 0,
      last_read_at: '2026-06-14T12:00:00.000Z',
    });
    expect(result[1]).toEqual({ phone_number: '5511888880002', unread_count: 5 });
  });

  it('phone não encontrado → retorna lista intacta', () => {
    const items = [{ phone_number: '5511999990001', unread_count: 2 }];
    const result = mapConversationItemsAfterRead(items, '5511777770003');
    expect(result).toEqual(items);
  });
});

describe('mapConversationItemsAfterUnread', () => {
  it('garante unread_count >= 1', () => {
    const items = [{ phone_number: '5511999990001', unread_count: 0 }];
    const result = mapConversationItemsAfterUnread(items, '5511999990001');
    expect(result[0].unread_count).toBe(1);
  });

  it('conversa já com unread_count=3 → mantém 3', () => {
    const items = [{ phone_number: '5511999990001', unread_count: 3 }];
    const result = mapConversationItemsAfterUnread(items, '5511999990001');
    expect(result[0].unread_count).toBe(3);
  });
});

describe('conversationsArchivedQueryValue', () => {
  it("'archived' → '1'", () => {
    expect(conversationsArchivedQueryValue('archived')).toBe('1');
  });

  it("'active' → '0'", () => {
    expect(conversationsArchivedQueryValue('active')).toBe('0');
  });
});

describe('describeArchivedListFilter', () => {
  it('true → equal:archived:true', () => {
    expect(describeArchivedListFilter(true)).toBe('equal:archived:true');
  });

  it('false → notEqual:archived:true', () => {
    expect(describeArchivedListFilter(false)).toBe('notEqual:archived:true');
  });
});

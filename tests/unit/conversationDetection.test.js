import { describe, expect, it } from 'vitest';
import { shouldNotifyConversationListItem } from './helpers/conversationDetection.js';

function meta(entries) {
  return new Map(entries);
}

describe('shouldNotifyConversationListItem', () => {
  it('unread aumentou → deve notificar', () => {
    const previousMeta = meta([
      ['5511999990001', { unread_count: 1, last_user_msg_at: '2026-06-14T10:00:00.000Z', updated_at: '2026-06-14T10:00:00.000Z' }],
    ]);
    const item = {
      phone_number: '5511999990001',
      unread_count: 2,
      last_user_msg_at: '2026-06-14T11:00:00.000Z',
      updated_at: '2026-06-14T11:00:00.000Z',
    };
    expect(shouldNotifyConversationListItem(item, previousMeta, '')).toBe(true);
  });

  it('unread não aumentou + last_user_msg_at não mudou → não notifica', () => {
    const previousMeta = meta([
      ['5511999990001', { unread_count: 2, last_user_msg_at: '2026-06-14T10:00:00.000Z', updated_at: '2026-06-14T10:00:00.000Z' }],
    ]);
    const item = {
      phone_number: '5511999990001',
      unread_count: 2,
      last_user_msg_at: '2026-06-14T10:00:00.000Z',
      updated_at: '2026-06-14T10:00:00.000Z',
    };
    expect(shouldNotifyConversationListItem(item, previousMeta, '')).toBe(false);
  });

  it('unread não aumentou + last_user_msg_at mudou + updated_at avançou → notifica', () => {
    const previousMeta = meta([
      ['5511999990001', { unread_count: 2, last_user_msg_at: '2026-06-14T10:00:00.000Z', updated_at: '2026-06-14T10:00:00.000Z' }],
    ]);
    const item = {
      phone_number: '5511999990001',
      unread_count: 2,
      last_user_msg_at: '2026-06-14T11:00:00.000Z',
      updated_at: '2026-06-14T11:00:00.000Z',
    };
    expect(shouldNotifyConversationListItem(item, previousMeta, '')).toBe(true);
  });

  it('unread não aumentou + last_user_msg_at mudou + updated_at igual → não notifica', () => {
    const previousMeta = meta([
      ['5511999990001', { unread_count: 2, last_user_msg_at: '2026-06-14T10:00:00.000Z', updated_at: '2026-06-14T10:00:00.000Z' }],
    ]);
    const item = {
      phone_number: '5511999990001',
      unread_count: 2,
      last_user_msg_at: '2026-06-14T11:00:00.000Z',
      updated_at: '2026-06-14T10:00:00.000Z',
    };
    expect(shouldNotifyConversationListItem(item, previousMeta, '')).toBe(false);
  });

  it('conversa é a selecionada atualmente → nunca notifica (mesmo com unread > 0)', () => {
    const previousMeta = meta([
      ['5511999990001', { unread_count: 0, last_user_msg_at: '', updated_at: '2026-06-14T09:00:00.000Z' }],
    ]);
    const item = {
      phone_number: '5511999990001',
      unread_count: 5,
      last_user_msg_at: '2026-06-14T12:00:00.000Z',
      updated_at: '2026-06-14T12:00:00.000Z',
    };
    expect(shouldNotifyConversationListItem(item, previousMeta, '5511999990001')).toBe(false);
  });
});

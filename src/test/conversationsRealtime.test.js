import { describe, expect, it, vi } from 'vitest';
import {
  buildConversationsChannel,
  conversationEventToInboundPatch,
  shouldProcessConversationEvent,
  subscribeConversationsRealtime,
} from '../lib/conversationsRealtime.js';

describe('conversationsRealtime', () => {
  it('buildConversationsChannel monta canal Appwrite', () => {
    expect(buildConversationsChannel('db1', 'conv')).toBe('databases.db1.collections.conv.documents');
    expect(buildConversationsChannel('', 'conv')).toBe('');
  });

  it('shouldProcessConversationEvent filtra outra academia', () => {
    expect(shouldProcessConversationEvent({ academy_id: 'a1' }, 'a2')).toBe(false);
    expect(shouldProcessConversationEvent({ academy_id: 'a1' }, 'a1')).toBe(true);
    expect(shouldProcessConversationEvent({ phone_number: '5511999999999' }, 'a1')).toBe(true);
  });

  it('conversationEventToInboundPatch extrai inbound do cliente', () => {
    const patch = conversationEventToInboundPatch({
      lead_id: 'l1',
      phone_number: '5511999999999',
      last_user_msg_at: '2026-06-11T10:00:00.000Z',
    });
    expect(patch).toEqual({
      leadId: 'l1',
      phone: '5511999999999',
      lastUserMsgAt: '2026-06-11T10:00:00.000Z',
    });
  });

  it('conversationEventToInboundPatch ignora evento sem mensagem do cliente', () => {
    expect(
      conversationEventToInboundPatch({
        messages_recent: JSON.stringify([{ role: 'assistant', content: 'Oi', timestamp: '2026-06-11T10:00:00.000Z' }]),
      })
    ).toBeNull();
  });

  it('subscribeConversationsRealtime conecta e repassa eventos', async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const subscribe = vi.fn((_channel, cb) => {
      subscribe._cb = cb;
      return Promise.resolve({ close });
    });
    const onConnected = vi.fn();
    const onEvent = vi.fn();

    const sub = subscribeConversationsRealtime({
      realtimeClient: { subscribe },
      channel: 'databases.db.collections.conv.documents',
      onConnected,
      onEvent,
      subscribeDelayMs: 100,
    });

    vi.advanceTimersByTime(100);
    await Promise.resolve();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(onConnected).toHaveBeenCalledTimes(1);

    subscribe._cb({ payload: { academy_id: 'a1' } });
    expect(onEvent).toHaveBeenCalledTimes(1);

    sub.close();
    expect(close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

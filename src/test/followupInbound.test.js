import { describe, expect, it } from 'vitest';
import {
  buildInboundMapsFromConversations,
  extractLastUserMessageAt,
  resolveInboundAfterForLead,
  resolveInboundAfterForPhone,
} from '../lib/followupInbound.js';

describe('followupInbound', () => {
  it('extrai última mensagem do cliente de last_message_* quando last_user_msg_at está vazio', () => {
    const at = extractLastUserMessageAt({
      last_message_role: 'user',
      last_message_timestamp: '2026-06-11T16:45:00.000Z',
      last_user_msg_at: '',
    });
    expect(at).toBe('2026-06-11T16:45:00.000Z');
  });

  it('extrai última mensagem do cliente de messages_recent quando last_user_msg_at está vazio', () => {
    const at = extractLastUserMessageAt({
      messages_recent: JSON.stringify([
        { role: 'assistant', content: 'Oi!', timestamp: '2026-06-10T12:00:00.000Z' },
        { role: 'user', content: 'Gostei, amanhã alinho os detalhes', timestamp: '2026-06-10T14:30:00.000Z' },
      ]),
    });
    expect(at).toBe('2026-06-10T14:30:00.000Z');
  });

  it('indexa inbound por lead_id e variantes de telefone', () => {
    const maps = buildInboundMapsFromConversations([
      {
        lead_id: 'l1',
        phone_number: '5511988887777',
        last_user_msg_at: '2026-06-10T14:00:00.000Z',
      },
    ]);

    expect(maps.inboundAfterByLead.l1).toBe('2026-06-10T14:00:00.000Z');
    expect(maps.inboundAfterByPhone['5511988887777']).toBe('2026-06-10T14:00:00.000Z');
    expect(maps.inboundAfterByPhone['11988887777']).toBe('2026-06-10T14:00:00.000Z');
  });

  it('resolve inbound para lead com telefone local', () => {
    const at = resolveInboundAfterForLead(
      { id: 'l1', phone: '(11) 98888-7777' },
      {
        inboundAfterByLead: {},
        inboundAfterByPhone: { 5511988887777: '2026-06-10T14:00:00.000Z' },
      }
    );
    expect(at).toBe('2026-06-10T14:00:00.000Z');
    expect(resolveInboundAfterForPhone('11988887777', { 5511988887777: '2026-06-10T14:00:00.000Z' })).toBe(
      '2026-06-10T14:00:00.000Z'
    );
  });
});

describe('patchFollowupInboundCache', () => {
  it('atualiza cache compartilhado para o hero reagir ao inbox', async () => {
    const { patchFollowupInboundCache, getFollowupEventsCache } = await import('../lib/followupEventsCache.js');
    patchFollowupInboundCache('acad-1', {
      leadId: 'l9',
      phone: '5511999998888',
      lastUserMsgAt: '2026-06-11T10:00:00.000Z',
    });
    const cached = getFollowupEventsCache('acad-1');
    expect(cached?.inboundAfterByLead?.l9).toBe('2026-06-11T10:00:00.000Z');
    expect(cached?.inboundAfterByPhone?.['5511999998888']).toBe('2026-06-11T10:00:00.000Z');
  });
});

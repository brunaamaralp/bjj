import { describe, expect, it } from 'vitest';
import {
  buildInboundMapsFromConversations,
  resolveInboundAfterForLead,
  resolveInboundAfterForPhone,
} from '../lib/followupInbound.js';

describe('followupInbound', () => {
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

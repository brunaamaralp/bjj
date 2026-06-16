import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LEAD_STATUS } from '../lib/leadStatus.js';
import { inboundCountsAsContact } from '../lib/followupInbound.js';

vi.mock('../../lib/server/conversationsStore.js', () => ({
  findConversationDoc: vi.fn(),
}));

vi.mock('../../lib/server/appwriteCollections.js', () => ({
  DB_ID: 'db-test',
  LEADS_COL: 'leads-test',
}));

import { findConversationDoc } from '../../lib/server/conversationsStore.js';
import {
  enrichInboundMapsFromFollowupLeads,
  isFollowupLeadForInbound,
} from '../../lib/server/followupInboundFromLeads.js';

describe('inboundCountsAsContact timezone', () => {
  it('conta mensagem no mesmo dia civil da aula (America/Sao_Paulo)', () => {
    const classMs = new Date('2026-06-09T00:00:00').getTime();
    expect(inboundCountsAsContact('2026-06-09T03:00:00.000Z', classMs)).toBe(true);
  });

  it('ignora mensagem antes do dia da aula', () => {
    const classMs = new Date('2026-06-09T00:00:00').getTime();
    expect(inboundCountsAsContact('2026-06-08T23:00:00.000Z', classMs)).toBe(false);
  });
});

describe('isFollowupLeadForInbound', () => {
  const now = new Date(2026, 5, 11, 12, 0);

  it('inclui compareceu dentro da janela de 7 dias', () => {
    expect(
      isFollowupLeadForInbound(
        {
          status: LEAD_STATUS.COMPLETED,
          scheduledDate: '2026-06-09',
          phone: '11988887777',
          origin: 'WhatsApp',
        },
        now
      )
    ).toBe(true);
  });

  it('exclui origem Planilha', () => {
    expect(
      isFollowupLeadForInbound(
        {
          status: LEAD_STATUS.COMPLETED,
          scheduledDate: '2026-06-09',
          phone: '11988887777',
          origin: 'Planilha',
        },
        now
      )
    ).toBe(false);
  });
});

describe('enrichInboundMapsFromFollowupLeads', () => {
  beforeEach(() => {
    vi.mocked(findConversationDoc).mockReset();
  });

  it('busca conversa por telefone/lead_id dos retornos pendentes', async () => {
    // O filtro `isFollowupLeadForInbound` usa `new Date()` internamente.
    // Fixamos o "agora" para tornar o teste determinístico na janela de FOLLOWUP_AGENDA_MAX_DAYS (7).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T12:00:00.000Z'));
    try {
      const listDocuments = vi.fn().mockResolvedValue({
        documents: [
          {
            $id: 'lead-sabrina',
            phone: '5511988887777',
            status: LEAD_STATUS.COMPLETED,
            scheduledDate: '2026-06-09',
            origin: 'Instagram',
          },
        ],
      });

      vi.mocked(findConversationDoc).mockResolvedValue({
        lead_id: 'lead-sabrina',
        phone_number: '5511988887777',
        last_user_msg_at: '2026-06-11T14:00:00.000Z',
      });

      const maps = { inboundAfterByLead: {}, inboundAfterByPhone: {} };
      await enrichInboundMapsFromFollowupLeads({ listDocuments }, 'acad-1', maps);

      expect(listDocuments).toHaveBeenCalled();
      expect(findConversationDoc).toHaveBeenCalledWith(
        '5511988887777',
        'acad-1',
        expect.objectContaining({ leadId: 'lead-sabrina' })
      );
      expect(maps.inboundAfterByLead['lead-sabrina']).toBe('2026-06-11T14:00:00.000Z');
      expect(maps.inboundAfterByPhone['5511988887777']).toBe('2026-06-11T14:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});

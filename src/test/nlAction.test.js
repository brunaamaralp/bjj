import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const nlMocks = vi.hoisted(() => ({
  createSessionJwt: vi.fn(),
  accountGet: vi.fn(),
  createPayment: vi.fn(),
  addLeadEvent: vi.fn(),
  updateLead: vi.fn(),
  addLead: vi.fn(),
  useLeadState: {
    leads: [],
    academyId: 'acad-1',
    userId: 'user-1',
    teamId: 'team-1',
    academyList: [{ id: 'acad-1', name: 'Academia Teste', teamId: 'team-1' }]
  },
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn()
}));

vi.mock('../store/useLeadStore.js', () => ({
  useLeadStore: (selector) => selector({
    leads: nlMocks.useLeadState.leads,
    academyId: nlMocks.useLeadState.academyId,
    userId: nlMocks.useLeadState.userId,
    teamId: nlMocks.useLeadState.teamId,
    academyList: nlMocks.useLeadState.academyList,
    updateLead: nlMocks.updateLead,
    addLead: nlMocks.addLead
  })
}));

vi.mock('../lib/appwrite', () => ({
  createSessionJwt: nlMocks.createSessionJwt,
  account: { get: nlMocks.accountGet }
}));

vi.mock('../lib/studentPayments', () => ({
  createPayment: nlMocks.createPayment,
  updatePayment: vi.fn()
}));

vi.mock('../lib/leadEvents', () => ({
  addLeadEvent: nlMocks.addLeadEvent
}));

vi.mock('../lib/financeExpense', () => ({
  createExpenseTransaction: vi.fn()
}));

vi.mock('../lib/attendance.js', () => ({
  createCheckin: vi.fn(),
  isAttendanceConfigured: vi.fn(() => true)
}));

vi.mock('../lib/financeTxSettle.js', () => ({
  settleFinancialTransactionById: vi.fn(),
  applySettleAccountingSideEffects: vi.fn()
}));

vi.mock('../lib/leadTimelineEvents.js', () => ({
  emitLeadAttendanceChanged: vi.fn(),
  emitLeadsRefresh: vi.fn()
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  ensureAuth: nlMocks.ensureAuth,
  ensureAcademyAccess: nlMocks.ensureAcademyAccess
}));

import { useNlAction } from '../hooks/useNlAction.js';

function makeMockRes() {
  return {
    statusCode: 200,
    jsonData: null,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(obj) {
      this.jsonData = obj;
      return this;
    }
  };
}

describe('Assistente de linguagem natural', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nlMocks.createSessionJwt.mockResolvedValue('jwt-1');
    nlMocks.accountGet.mockResolvedValue({ name: 'Usuário' });
    nlMocks.createPayment.mockResolvedValue({ $id: 'pay-1' });
    nlMocks.addLeadEvent.mockResolvedValue({ $id: 'evt-1' });
    nlMocks.useLeadState.leads = [
      { id: 's1', name: 'Aluno 1', status: 'CONVERTED', contact_type: 'student', plan: 'Mensal' },
      { id: 'l1', name: 'Lead 1', status: 'NEW', contact_type: 'lead', pipelineStage: 'Novo' }
    ];
    vi.unstubAllGlobals();
  });

  describe('interpret', () => {
    it('envia text, students e context para /api/agent', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ action: null })
      });
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => useNlAction());
      await result.current.interpret('registrar pagamento', 'financeiro');
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agent?route=nl-action',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String)
        })
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toBe('registrar pagamento');
      expect(Array.isArray(body.students)).toBe(true);
      expect(body.context).toBe('financeiro');
    });

    it('filtra apenas alunos convertidos da lista de leads', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ action: null }) });
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => useNlAction());
      await result.current.interpret('x', 'financeiro');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.students).toHaveLength(1);
      expect(body.students[0].id).toBe('s1');
    });

    it('retorna action null quando API retorna erro', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ action: null, error: 'falha' })
      });
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => useNlAction());
      const out = await result.current.interpret('x', 'financeiro');
      expect(out.action).toBeNull();
    });

    it('passa academyId no header x-academy-id', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ action: null }) });
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => useNlAction());
      await result.current.interpret('x', 'financeiro');
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['x-academy-id']).toBe('acad-1');
    });
  });

  describe('execute — register_payment', () => {
    it('chama createPayment com lead_id correto', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'register_payment',
        data: { student_id: 's1', reference_month: '2026-04', amount: 150, method: 'pix' }
      });
      expect(nlMocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 's1' }));
    });

    it('chama createPayment com reference_month correto', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'register_payment',
        data: { student_id: 's1', reference_month: '2026-05', amount: 150, method: 'pix' }
      });
      expect(nlMocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ reference_month: '2026-05' }));
    });

    it('chama createPayment com status paid', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'register_payment',
        data: { student_id: 's1', reference_month: '2026-05', amount: 150, method: 'pix' }
      });
      expect(nlMocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }));
    });

    it('lança erro para action não suportada', async () => {
      const { result } = renderHook(() => useNlAction());
      await expect(result.current.execute({ action: 'unknown', data: {} })).rejects.toThrow('Ação não suportada');
    });
  });

  describe('execute — add_note', () => {
    it('chama addLeadEvent com type note', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'add_note',
        data: { lead_id: 'l1', note_text: 'obs teste' }
      });
      expect(nlMocks.addLeadEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'note' }));
    });

    it('chama addLeadEvent com note_text como text', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'add_note',
        data: { lead_id: 'l1', note_text: 'texto da nota' }
      });
      expect(nlMocks.addLeadEvent).toHaveBeenCalledWith(expect.objectContaining({ text: 'texto da nota' }));
    });

    it('chama addLeadEvent com leadId correto', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'add_note',
        data: { lead_id: 'l1', note_text: 'ok' }
      });
      expect(nlMocks.addLeadEvent).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'l1' }));
    });
  });

  describe('nlActionHandler (servidor)', () => {
    beforeEach(() => {
      vi.resetModules();
      process.env.APPWRITE_PROJECT_ID = 'p';
      process.env.APPWRITE_API_KEY = 'k';
      process.env.VITE_APPWRITE_DATABASE_ID = 'db';
      process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID = 'acad';
      process.env.ANTHROPIC_API_KEY = 'anth';
      nlMocks.ensureAuth.mockResolvedValue({ $id: 'u1' });
      nlMocks.ensureAcademyAccess.mockResolvedValue({ academyId: 'acad-1' });
    });

    it('retorna 405 para método GET', async () => {
      const { default: handler } = await import('../../lib/server/nlActionHandler.js');
      const res = makeMockRes();
      await handler({ method: 'GET' }, res);
      expect(res.statusCode).toBe(405);
    });

    it('retorna 400 se text estiver vazio', async () => {
      const { default: handler } = await import('../../lib/server/nlActionHandler.js');
      const res = makeMockRes();
      await handler({ method: 'POST', body: { text: '' } }, res);
      expect(res.statusCode).toBe(400);
    });

    it('retorna action null se Claude não conseguir interpretar', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () => JSON.stringify({ content: [{ text: 'não é json válido de ação' }] })
        })
      );
      const { default: handler } = await import('../../lib/server/nlActionHandler.js');
      const res = makeMockRes();
      await handler({ method: 'POST', body: { text: 'oi', students: [], leads: [] } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.jsonData.action).toBeNull();
    });

    it('resposta JSON é parseada corretamente', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () =>
            JSON.stringify({
              content: [
                {
                  text: JSON.stringify({
                    action: 'add_note',
                    confidence: 'high',
                    data: { student_id: 's1', note_text: 'ok' },
                    summary: 'ok',
                    missing: []
                  })
                }
              ]
            })
        })
      );
      const { default: handler } = await import('../../lib/server/nlActionHandler.js');
      const res = makeMockRes();
      await handler({
        method: 'POST',
        body: {
          text: 'adicionar nota',
          students: [{ id: 's1', name: 'Aluno 1' }],
          leads: []
        }
      }, res);
      expect(res.statusCode).toBe(200);
      expect(res.jsonData.action).toBe('add_note');
      expect(res.jsonData.data.student_id).toBe('s1');
    });
  });
});

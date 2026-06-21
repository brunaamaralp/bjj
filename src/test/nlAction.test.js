import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const nlMocks = vi.hoisted(() => ({
  createSessionJwt: vi.fn(),
  accountGet: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  createSale: vi.fn(),
  addLeadEvent: vi.fn(),
  updateLead: vi.fn(),
  addLead: vi.fn(),
  createExpenseTransaction: vi.fn(),
  createCheckin: vi.fn(),
  adjustStock: vi.fn(),
  sendWhatsappTemplateOutbound: vi.fn(),
  addToast: vi.fn(),
  useLeadState: {
    leads: [],
    academyId: 'acad-1',
    userId: 'user-1',
    teamId: 'team-1',
    financeConfig: { plans: [] },
    modules: { whatsapp: false },
    academyList: [{ id: 'acad-1', name: 'Academia Teste', teamId: 'team-1' }]
  },
  inventoryState: { error: null, sucesso: true, quantity_before: 5, quantity_after: 3 },
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  isAcademyOwnerOrAdminUser: vi.fn(async () => true),
  enrichNlActionContext: vi.fn(async () => ({
    pendingForNl: [],
    recentPaymentsNorm: [],
    pipelineStages: [{ id: 'Novo', label: 'Novo' }],
  })),
  answerAcademyQuery: vi.fn(async (_db, { queryType, referenceMonth }) => ({
    resposta: 'ok',
    rows: [],
    count: 0,
    query_type: queryType,
    reference_month: referenceMonth || '2026-06',
  })),
  inferAcademyQueryType: vi.fn((text) => {
    const t = String(text || '').toLowerCase();
    if (t.includes('não pagou') || t.includes('nao pagou')) return 'unpaid_tuition';
    if (t.includes('faltou')) return 'missed_experimental';
    if (t.includes('compareceu')) return 'attended_experimental';
    if (t.includes('check-in') || t.includes('checkin') || t.includes('veio hoje')) return 'checkins_today';
    return '';
  }),
  listAcademyStudentsMapped: vi.fn(async () => [
    { id: 's1', name: 'Aluno 1', status: 'Matriculado', contact_type: 'student', plan: 'Mensal' },
    { id: 's2', name: 'Aluno 2', status: 'Ativo', contact_type: 'student', plan: 'Trimestral' },
    { id: 's3', name: 'Inativo', status: 'Inativo', contact_type: 'student', student_status: 'inactive', plan: 'Mensal' },
  ]),
}));

vi.mock('../store/useLeadStore.js', () => ({
  useLeadStore: (selector) => selector({
    leads: nlMocks.useLeadState.leads,
    academyId: nlMocks.useLeadState.academyId,
    userId: nlMocks.useLeadState.userId,
    teamId: nlMocks.useLeadState.teamId,
    financeConfig: nlMocks.useLeadState.financeConfig,
    modules: nlMocks.useLeadState.modules,
    academyList: nlMocks.useLeadState.academyList,
    updateLead: nlMocks.updateLead,
    addLead: nlMocks.addLead
  })
}));

vi.mock('../store/useUiStore.js', () => ({
  useUiStore: (selector) => selector({ addToast: nlMocks.addToast })
}));

vi.mock('../store/useInventoryStore.js', () => ({
  useInventoryStore: {
    getState: () => ({
      adjustStock: nlMocks.adjustStock,
      error: null,
    }),
  },
}));

vi.mock('../lib/appwrite', () => ({
  createSessionJwt: nlMocks.createSessionJwt,
  account: { get: nlMocks.accountGet }
}));

vi.mock('../lib/studentPayments', () => ({
  createPayment: nlMocks.createPayment,
  updatePayment: nlMocks.updatePayment
}));

vi.mock('../lib/leadEvents', () => ({
  addLeadEvent: nlMocks.addLeadEvent
}));

vi.mock('../lib/financeExpense', () => ({
  createExpenseTransaction: nlMocks.createExpenseTransaction
}));

vi.mock('../lib/attendance.js', () => ({
  createCheckin: nlMocks.createCheckin,
  isAttendanceConfigured: vi.fn(() => true)
}));

vi.mock('../lib/outboundWhatsappTemplate.js', () => ({
  sendWhatsappTemplateOutbound: nlMocks.sendWhatsappTemplateOutbound
}));

vi.mock('../lib/useWhatsappTemplates.js', () => ({
  useWhatsappTemplates: () => ({
    templates: {},
    academyName: 'Academia Teste',
    zapsterInstanceId: '',
    automationsRaw: '',
  }),
}));

vi.mock('../lib/useAutomations.js', () => ({
  parseAutomationsConfig: () => ({}),
}));

vi.mock('../lib/automationDispatch.js', () => ({
  afterExperimentalScheduled: vi.fn(),
  afterPresenceConfirmed: vi.fn(),
  afterMissed: vi.fn(),
  afterMovedToPipelineStage: vi.fn(),
}));

vi.mock('../lib/automationUx.js', () => ({
  notifyAutomationFeedback: vi.fn(),
  safeAutomationDispatch: vi.fn(async (fn) => fn),
}));

vi.mock('../lib/terminology.js', () => ({
  useTerms: () => ({
    nlCommandBarMarkEnrolledResult: 'Matriculado',
    nlPipelineMoveForbiddenHint: 'Use comando específico',
  }),
}));

vi.mock('../lib/financeTxSettle.js', () => ({
  applySettleAccountingSideEffects: vi.fn()
}));

vi.mock('../lib/leadTimelineEvents.js', () => ({
  emitLeadAttendanceChanged: vi.fn(),
  emitLeadsRefresh: vi.fn()
}));

vi.mock('../store/useSalesStore.js', () => ({
  useSalesStore: (selector) =>
    selector({
      createSale: nlMocks.createSale,
      error: null,
    }),
}));

vi.mock('../hooks/useSalesCatalog.js', () => ({
  useSalesCatalog: () => ({ products: [], loading: false, reload: vi.fn() }),
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  ensureAuth: nlMocks.ensureAuth,
  ensureAcademyAccess: nlMocks.ensureAcademyAccess,
  isAcademyOwnerOrAdminUser: (...args) => nlMocks.isAcademyOwnerOrAdminUser(...args),
}));

vi.mock('../../lib/server/nlActionContextFetch.js', () => ({
  enrichNlActionContext: (...args) => nlMocks.enrichNlActionContext(...args),
}));

vi.mock('../../lib/server/nlAcademyQuery.js', () => ({
  answerAcademyQuery: (...args) => nlMocks.answerAcademyQuery(...args),
  inferAcademyQueryType: (...args) => nlMocks.inferAcademyQueryType(...args),
}));

vi.mock('../../lib/server/listAcademyStudents.js', () => ({
  listAcademyStudentsMapped: (...args) => nlMocks.listAcademyStudentsMapped(...args),
}));

import { useNlAction } from '../hooks/useNlAction.js';
import { applySettleAccountingSideEffects } from '../lib/financeTxSettle.js';

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
    nlMocks.createSale.mockResolvedValue({ venda_id: 'sale-1' });
    nlMocks.addLeadEvent.mockResolvedValue({ $id: 'evt-1' });
    nlMocks.updateLead.mockResolvedValue({ id: 'l1' });
    nlMocks.addLead.mockResolvedValue({ id: 'l2' });
    nlMocks.createExpenseTransaction.mockResolvedValue({ id: 'exp-1' });
    nlMocks.createCheckin.mockResolvedValue({ $id: 'chk-1' });
    nlMocks.updatePayment.mockResolvedValue({ $id: 'pay-upd-1' });
    nlMocks.adjustStock.mockResolvedValue({
      sucesso: true,
      quantity_before: 5,
      quantity_after: 3,
    });
    nlMocks.sendWhatsappTemplateOutbound.mockResolvedValue({ ok: false });
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
      await act(async () => {
        await result.current.execute({
          action: 'register_payment',
          data: { student_id: 's1', reference_month: '2026-04', amount: 150, method: 'pix' }
        });
      });
      expect(nlMocks.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ lead_id: 's1' }),
        expect.objectContaining({ financeConfig: nlMocks.useLeadState.financeConfig })
      );
    });

    it('chama createPayment com reference_month correto', async () => {
      const { result } = renderHook(() => useNlAction());
      await act(async () => {
        await result.current.execute({
          action: 'register_payment',
          data: { student_id: 's1', reference_month: '2026-05', amount: 150, method: 'pix' }
        });
      });
      expect(nlMocks.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ reference_month: '2026-05' }),
        expect.objectContaining({ financeConfig: nlMocks.useLeadState.financeConfig })
      );
    });

    it('chama createPayment com status paid', async () => {
      const { result } = renderHook(() => useNlAction());
      await act(async () => {
        await result.current.execute({
          action: 'register_payment',
          data: { student_id: 's1', reference_month: '2026-05', amount: 150, method: 'pix' }
        });
      });
      expect(nlMocks.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid' }),
        expect.objectContaining({ financeConfig: nlMocks.useLeadState.financeConfig })
      );
    });

    it('register_sale chama createSale com itens e pagamentos', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'register_sale',
        data: {
          student_id: 's1',
          student_name: 'Aluno 1',
          stock_item_id: 'stock-1',
          product_name: 'Kimono',
          quantity: 1,
          unit_price: 50,
          payment_form: 'pix',
        },
      });
      expect(nlMocks.createSale).toHaveBeenCalledWith(
        expect.objectContaining({
          aluno_id: 's1',
          itens: [{ item_estoque_id: 'stock-1', quantidade: 1, preco_unitario: 50 }],
        })
      );
    });

    it('lança erro para action não suportada', async () => {
      const { result } = renderHook(() => useNlAction());
      await expect(result.current.execute({ action: 'unknown', data: {} })).rejects.toThrow('Ação não suportada');
    });

    it('settle_transaction chama settle-finance-tx com transactionId', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, settledAt: '2026-04-26T12:00:00.000Z' }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => useNlAction());
      const out = await result.current.execute({
        action: 'settle_transaction',
        data: { transaction_id: 'tx-1', tx_snapshot: { id: 'tx-1', gross: 100, net: 100, fee: 0, method: 'pix' } },
      });
      expect(out.ok).toBe(true);
      expect(out.transaction_id).toBe('tx-1');
      const settleCall = fetchMock.mock.calls.find((c) => String(c[0] || '').includes('settle-finance-tx'));
      expect(settleCall).toBeTruthy();
      expect(JSON.parse(settleCall[1].body).transactionId).toBe('tx-1');
      expect(applySettleAccountingSideEffects).toHaveBeenCalled();
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

    it('bloqueia mark_enrolled no contexto financeiro', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () =>
            JSON.stringify({
              content: [
                {
                  text: JSON.stringify({
                    action: 'mark_enrolled',
                    confidence: 'high',
                    data: { lead_id: 'l1' },
                    summary: 'matricular',
                    missing: [],
                  }),
                },
              ],
            }),
        })
      );
      const { default: handler } = await import('../../lib/server/nlActionHandler.js');
      const res = makeMockRes();
      await handler({
        method: 'POST',
        body: {
          text: 'matricular lead',
          context: 'financeiro',
          students: [],
          leads: [{ id: 'l1', name: 'Lead 1', status: 'NEW', pipelineStage: 'Novo' }],
        },
      }, res);
      expect(res.statusCode).toBe(200);
      expect(res.jsonData.action).toBeNull();
    });

    it('responde unpaid_tuition sem chamar Anthropic quando a query eh estruturada', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { default: handler } = await import('../../lib/server/nlActionHandler.js');
      const res = makeMockRes();
      await handler({ method: 'POST', body: { text: 'Quem nao pagou este mes?', students: [], leads: [] } }, res);
      expect(res.statusCode).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(nlMocks.answerAcademyQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ academyId: 'acad-1', queryType: 'unpaid_tuition' })
      );
      expect(res.jsonData.action).toBe('academy_query');
      expect(res.jsonData.data.query_type).toBe('unpaid_tuition');
    });

    it('responde active_students_count sem chamar Anthropic', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { default: handler } = await import('../../lib/server/nlActionHandler.js');
      const res = makeMockRes();
      await handler({ method: 'POST', body: { text: 'Quantos alunos ativos temos hoje?', students: [], leads: [] } }, res);
      expect(res.statusCode).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(nlMocks.listAcademyStudentsMapped).toHaveBeenCalledWith('acad-1');
      expect(res.jsonData.action).toBe('academy_query');
      expect(res.jsonData.data.query_type).toBe('active_students_count');
      expect(res.jsonData.data.count).toBe(2);
    });

    it('nao inclui estoque no prompt para query financeira aberta', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            content: [{ text: JSON.stringify({ action: null, error: 'x' }) }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const { default: handler } = await import('../../lib/server/nlActionHandler.js');
      const res = makeMockRes();
      await handler({
        method: 'POST',
        body: {
          text: 'Resuma a situacao financeira deste mes',
          context: 'financeiro',
          students: [{ id: 's1', name: 'Aluno 1', plan: 'Mensal' }],
          leads: [{ id: 'l1', name: 'Lead 1', status: 'Novo', pipelineStage: 'Novo' }],
          stockProducts: [{ id: 'p1', display_label: 'Kimono A1', sale_price: 150, current_quantity: 3 }],
        },
      }, res);
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload.system).not.toMatch(/Produtos do estoque/i);
    });

    it('nao inclui alunos no prompt para query de estoque aberta', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            content: [
              {
                text: JSON.stringify({
                  action: 'inventory_query',
                  confidence: 'high',
                  data: { query_type: 'stock_level' },
                  summary: 'ok',
                  missing: [],
                  warnings: [],
                }),
              },
            ],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const { default: handler } = await import('../../lib/server/nlActionHandler.js');
      const res = makeMockRes();
      await handler({
        method: 'POST',
        body: {
          text: 'Como esta o saldo do estoque de kimonos?',
          students: [{ id: 's1', name: 'Aluno 1', plan: 'Mensal' }],
          leads: [{ id: 'l1', name: 'Lead 1', status: 'Novo', pipelineStage: 'Novo' }],
          stockProducts: [{ id: 'p1', display_label: 'Kimono A1', sale_price: 150, current_quantity: 3 }],
        },
      }, res);
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload.system).not.toMatch(/Alunos cadastrados/i);
    });
  });

  describe('execute — demais ações', () => {
    it('adjust_stock chama useInventoryStore.adjustStock', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'adjust_stock',
        data: { variant_id: 'v1', quantity_change: -2, subtype: 'avaria' },
      });
      expect(nlMocks.adjustStock).toHaveBeenCalledWith(
        expect.objectContaining({ variant_id: 'v1', quantity_change: -2 })
      );
    });

    it('inventory_query retorna resposta', async () => {
      const { result } = renderHook(() => useNlAction());
      const out = await result.current.execute({
        action: 'inventory_query',
        data: { resposta: 'Top vendas: Kimono' },
      });
      expect(out.resposta).toContain('Kimono');
    });

    it('academy_query retorna resposta e rows', async () => {
      const { result } = renderHook(() => useNlAction());
      const out = await result.current.execute({
        action: 'academy_query',
        data: { resposta: '3 matrículas', rows: [{ id: 's1', name: 'Aluno' }] },
      });
      expect(out.rows).toHaveLength(1);
    });

    it('register_expense chama createExpenseTransaction', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'register_expense',
        data: { amount: 50, expense_description: 'Frutas' },
      });
      expect(nlMocks.createExpenseTransaction).toHaveBeenCalled();
    });

    it('register_checkin chama createCheckin', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'register_checkin',
        data: { student_id: 's1' },
      });
      expect(nlMocks.createCheckin).toHaveBeenCalled();
    });

    it('update_payment chama updatePayment', async () => {
      const { result } = renderHook(() => useNlAction());
      await act(async () => {
        await result.current.execute({
          action: 'update_payment',
          data: { payment_id: 'p1', updates: { note: 'obs' } },
        });
      });
      expect(nlMocks.updatePayment).toHaveBeenCalledWith('p1', expect.objectContaining({ note: 'obs' }));
    });

    it('update_student chama updateLead', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'update_student',
        data: { student_id: 's1', updates: { plan: 'Premium' } },
      });
      expect(nlMocks.updateLead).toHaveBeenCalledWith('s1', expect.objectContaining({ plan: 'Premium' }));
    });

    it('create_lead chama addLead', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'create_lead',
        data: { name: 'Novo Lead', phone: '11999998888' },
      });
      expect(nlMocks.addLead).toHaveBeenCalled();
    });

    it('mark_attended atualiza lead', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'mark_attended',
        data: { lead_id: 'l1' },
      });
      expect(nlMocks.updateLead).toHaveBeenCalledWith('l1', expect.objectContaining({ status: 'Compareceu' }));
    });

    it('mark_missed atualiza lead', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'mark_missed',
        data: { lead_id: 'l1', reason: 'Trabalho' },
      });
      expect(nlMocks.updateLead).toHaveBeenCalledWith('l1', expect.objectContaining({ status: 'Não Compareceu' }));
    });

    it('mark_enrolled atualiza lead', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'mark_enrolled',
        data: { lead_id: 'l1' },
      });
      expect(nlMocks.updateLead).toHaveBeenCalledWith('l1', expect.objectContaining({ contact_type: 'student' }));
    });

    it('mark_lost atualiza lead', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'mark_lost',
        data: { lead_id: 'l1', lost_reason: 'Preço' },
      });
      expect(nlMocks.updateLead).toHaveBeenCalledWith('l1', expect.objectContaining({ status: 'Não fechou' }));
    });

    it('schedule_experimental agenda lead', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'schedule_experimental',
        data: { lead_id: 'l1', scheduled_date: '2026-06-15', scheduled_time: '18:30' },
      });
      expect(nlMocks.updateLead).toHaveBeenCalledWith(
        'l1',
        expect.objectContaining({ scheduledDate: '2026-06-15', scheduledTime: '18:30' })
      );
    });

    it('move_pipeline_stage move lead', async () => {
      nlMocks.useLeadState.leads[1].pipelineStage = 'Aguardando decisão';
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'move_pipeline_stage',
        data: { lead_id: 'l1', target_stage_id: 'Novo' },
      });
      expect(nlMocks.updateLead).toHaveBeenCalled();
      nlMocks.useLeadState.leads[1].pipelineStage = 'Novo';
    });

    it('register_whatsapp registra evento', async () => {
      const { result } = renderHook(() => useNlAction());
      await result.current.execute({
        action: 'register_whatsapp',
        data: { lead_id: 'l1', message_description: 'Follow-up' },
      });
      expect(nlMocks.addLeadEvent).toHaveBeenCalled();
    });
  });
});

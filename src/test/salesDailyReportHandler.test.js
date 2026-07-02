import { describe, it, expect, vi, beforeEach } from 'vitest';



const ensureAuth = vi.fn();

const ensureAcademyAccess = vi.fn();

const listAcademySalesPage = vi.fn();

const listSaleItems = vi.fn();

const enrichSaleItems = vi.fn();

const loadLeadNames = vi.fn();

const mapSaleDoc = vi.fn();

const getDocument = vi.fn();

const listStudentPaymentsForReportDay = vi.fn();



vi.mock('../../lib/server/academyAccess.js', () => ({

  ensureAuth,

  ensureAcademyAccess,

  DB_ID: 'db',

  databases: { getDocument },

}));



vi.mock('../../lib/server/salesHistoryHandler.js', () => ({

  listAcademySalesPage,

  listSaleItems,

  enrichSaleItems,

  loadLeadNames,

  mapSaleDoc,

}));



vi.mock('../../lib/server/dailyReportStudentPayments.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listStudentPaymentsForReportDay,
    mapPaymentDocForDailyReport: (doc, names) => ({
      id: doc.$id,
      student_name: names[doc.lead_id] || 'Aluno',
      amount: Number(doc.paid_amount ?? doc.amount) || 0,
      paid_at: doc.paid_at,
      payment_label: doc.method || 'pix',
      reference_month: doc.reference_month,
      status: doc.status,
    }),
  };
});



vi.mock('../../lib/receipts/renderDailyReportPdf.js', () => ({

  renderDailyReportPdfBuffer: vi.fn(async () => Buffer.from('pdf')),

}));



describe('salesDailyReportHandler', () => {

  beforeEach(() => {

    vi.resetModules();

    ensureAuth.mockReset();

    ensureAcademyAccess.mockReset();

    listAcademySalesPage.mockReset();

    listSaleItems.mockReset();

    enrichSaleItems.mockReset();

    loadLeadNames.mockReset();

    mapSaleDoc.mockReset();

    getDocument.mockReset();

    listStudentPaymentsForReportDay.mockReset();

    process.env.SALES_COL = 'sales';

    process.env.VITE_APPWRITE_SALES_COLLECTION_ID = 'sales';

    process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID = 'academies';

    listStudentPaymentsForReportDay.mockResolvedValue({ docs: [], truncated: false });

  });



  function mockRes() {

    const res = {

      statusCode: 200,

      body: null,

      headers: {},

      status(code) {

        this.statusCode = code;

        return this;

      },

      json(payload) {

        this.body = payload;

        return this;

      },

      setHeader(key, val) {

        this.headers[key] = val;

      },

      send(payload) {

        this.body = payload;

        return this;

      },

    };

    return res;

  }



  it('retorna 400 para data inválida', async () => {

    const handler = (await import('../../lib/server/salesDailyReportHandler.js')).default;

    ensureAuth.mockResolvedValue({ $id: 'u1' });

    ensureAcademyAccess.mockResolvedValue({ academyId: 'a1' });



    const res = mockRes();

    await handler({ method: 'GET', query: { date: 'invalid' } }, res);



    expect(res.statusCode).toBe(400);

    expect(res.body.error).toBe('invalid_date');

  });



  it('retorna relatório com vendas concluídas do dia', async () => {

    const handler = (await import('../../lib/server/salesDailyReportHandler.js')).default;

    ensureAuth.mockResolvedValue({ $id: 'u1' });

    ensureAcademyAccess.mockResolvedValue({ academyId: 'a1' });

    getDocument.mockResolvedValue({ name: 'Academia Teste' });



    listAcademySalesPage.mockResolvedValue({

      docs: [

        {

          $id: 'v1',

          status: 'concluida',

          total: 150,

          pagamentos_json: JSON.stringify([{ forma: 'pix', valor: 150 }]),

          $createdAt: '2026-07-01T14:00:00.000Z',

          created_by_name: 'Maria',

        },

        {

          $id: 'v2',

          status: 'concluida',

          total: 50,

          forma_pagamento: 'dinheiro',

          $createdAt: '2026-07-01T15:00:00.000Z',

        },

      ],

      next_cursor: null,

      has_more: false,

    });



    listStudentPaymentsForReportDay.mockResolvedValue({

      docs: [

        {

          $id: 'p1',

          lead_id: 'l1',

          status: 'paid',

          amount: 200,

          paid_amount: 200,

          method: 'pix',

          paid_at: '2026-07-01T16:00:00.000Z',

          reference_month: '2026-07',

        },

      ],

      truncated: false,

    });



    listSaleItems.mockResolvedValue([]);

    enrichSaleItems.mockResolvedValue([]);

    loadLeadNames.mockResolvedValue({ l1: 'João' });

    mapSaleDoc.mockImplementation((doc) => ({

      id: doc.$id,

      status: doc.status,

      total: doc.total,

      created_at: doc.$createdAt,

      items: [],

    }));



    const res = mockRes();

    await handler({ method: 'GET', query: { date: '2026-07-01' } }, res);



    expect(res.statusCode).toBe(200);

    expect(res.body.ok).toBe(true);

    expect(res.body.date).toBe('2026-07-01');

    expect(res.body.academy_name).toBe('Academia Teste');

    expect(res.body.summary.concluded_count).toBe(2);

    expect(res.body.summary.concluded_total).toBe(200);

    expect(res.body.summary.payments_count).toBe(1);

    expect(res.body.summary.payments_total).toBe(200);

    expect(res.body.summary.reception_total).toBe(400);

    expect(res.body.totals_by_payment.pix).toBe(350);

    expect(res.body.totals_by_payment.dinheiro).toBe(50);

    expect(res.body.sales_concluded).toHaveLength(2);

    expect(res.body.payments_received).toHaveLength(1);

    expect(res.body.sales_concluded[0].operator_name).toBe('Maria');

  });



  it('retorna PDF quando format=pdf', async () => {

    const handler = (await import('../../lib/server/salesDailyReportHandler.js')).default;

    ensureAuth.mockResolvedValue({ $id: 'u1' });

    ensureAcademyAccess.mockResolvedValue({ academyId: 'a1' });

    getDocument.mockResolvedValue({ name: 'Academia Teste' });

    listAcademySalesPage.mockResolvedValue({ docs: [], next_cursor: null, has_more: false });

    listSaleItems.mockResolvedValue([]);

    enrichSaleItems.mockResolvedValue([]);

    loadLeadNames.mockResolvedValue({});

    mapSaleDoc.mockImplementation((doc) => ({ id: doc.$id, status: doc.status, total: doc.total }));



    const res = mockRes();

    await handler({ method: 'GET', query: { date: '2026-07-01', format: 'pdf' } }, res);



    expect(res.statusCode).toBe(200);

    expect(res.headers['Content-Type']).toBe('application/pdf');

    expect(Buffer.isBuffer(res.body)).toBe(true);

  });

});


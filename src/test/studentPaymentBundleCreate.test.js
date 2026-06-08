import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBundlePaymentServer,
  repairBundleCoverageForMonth,
} from '../../lib/server/studentPaymentBundleCreate.js';

function parseEqualQueries(queries) {
  const eq = {};
  for (const q of queries || []) {
    let parsed = q;
    if (typeof q === 'string') {
      try {
        parsed = JSON.parse(q);
      } catch {
        parsed = null;
      }
    }
    if (parsed && typeof parsed === 'object' && parsed.method === 'equal') {
      eq[parsed.attribute] = parsed.values?.[0];
    }
  }
  return eq;
}

function mockDatabases() {
  const store = new Map();
  let seq = 0;

  return {
    store,
    createDocument: vi.fn(async (_db, _col, _id, payload) => {
      const id = `pay-${++seq}`;
      const doc = { $id: id, ...payload };
      store.set(id, doc);
      return doc;
    }),
    updateDocument: vi.fn(async (_db, _col, id, patch) => {
      const prev = store.get(id) || { $id: id };
      const doc = { ...prev, ...patch };
      store.set(id, doc);
      return doc;
    }),
    listDocuments: vi.fn(async (_db, _col, queries) => {
      const eq = parseEqualQueries(queries);
      let docs = [...store.values()];
      if (eq.lead_id) docs = docs.filter((d) => String(d.lead_id) === String(eq.lead_id));
      if (eq.reference_month) {
        docs = docs.filter((d) => String(d.reference_month) === String(eq.reference_month));
      }
      if (eq.academy_id) docs = docs.filter((d) => String(d.academy_id) === String(eq.academy_id));
      if (eq.payment_category) {
        docs = docs.filter((d) => String(d.payment_category) === String(eq.payment_category));
      }
      return { documents: docs };
    }),
  };
}

describe('studentPaymentBundleCreate', () => {
  let databases;

  beforeEach(() => {
    databases = mockDatabases();
  });

  it('createBundlePaymentServer cria âncora e meses covered', async () => {
    const mirrorAnchorFn = vi.fn();
    const result = await createBundlePaymentServer({
      databases,
      dbId: 'db',
      paymentsCol: 'payments',
      data: {
        lead_id: 'lead-1',
        academy_id: 'acad-1',
        amount: 1200,
        bundle_months: 3,
        coverage_start_month: '2026-01',
        method: 'pix',
        status: 'paid',
        paid_at: '2026-01-05T12:00:00.000Z',
      },
      mirrorAnchorFn,
    });

    expect(result.monthsCreated).toBe(3);
    expect(result.coverageMonths).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(mirrorAnchorFn).toHaveBeenCalledTimes(1);

    const all = [...databases.store.values()];
    expect(all).toHaveLength(3);
    expect(all.filter((d) => d.status === 'covered')).toHaveLength(2);
    expect(all.find((d) => d.reference_month === '2026-01')?.bundle_months).toBe(3);
  });

  it('repairBundleCoverageForMonth cria mês covered ausente', async () => {
    databases.store.set('anchor-1', {
      $id: 'anchor-1',
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      payment_category: 'bundle',
      bundle_origin_id: 'anchor-1',
      reference_month: '2026-01',
      status: 'paid',
      amount: 1200,
      method: 'pix',
      paid_at: '2026-01-05T12:00:00.000Z',
    });

    const { repaired } = await repairBundleCoverageForMonth({
      databases,
      dbId: 'db',
      paymentsCol: 'payments',
      academyId: 'acad-1',
      referenceMonth: '2026-03',
    });

    expect(repaired).toHaveLength(1);
    expect(repaired[0].reference_month).toBe('2026-03');
    expect(repaired[0].status).toBe('covered');
    expect(repaired[0].bundle_origin_id).toBe('anchor-1');
  });

  it('repairBundleCoverageForMonth preenche bundle_months na âncora legada', async () => {
    databases.store.set('anchor-1', {
      $id: 'anchor-1',
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      payment_category: 'bundle',
      reference_month: '2026-01',
      status: 'paid',
      amount: 1200,
      method: 'pix',
    });

    const { repaired } = await repairBundleCoverageForMonth({
      databases,
      dbId: 'db',
      paymentsCol: 'payments',
      academyId: 'acad-1',
      referenceMonth: '2026-01',
    });

    expect(repaired).toHaveLength(1);
    expect(repaired[0].bundle_months).toBe(12);
    expect(repaired[0].bundle_origin_id).toBe('anchor-1');
  });
});

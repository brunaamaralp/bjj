/**
 * Turno de caixa — GET/POST/PATCH via /api/sales?action=shift*
 */
import { Query, ID } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  databases,
  DB_ID,
} from './academyAccess.js';
import { readSalesSettings } from '../../src/lib/salesSettings.js';
import { parsePagamentosJson, roundMoney, normalizePaymentForma } from './salePayments.js';
import { createDocumentResilient, updateDocumentResilient } from './appwriteSchemaResilient.js';

const CASH_SHIFTS_COL =
  process.env.CASH_SHIFTS_COL || process.env.VITE_APPWRITE_CASH_SHIFTS_COLLECTION_ID || '';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';

function json(res, status, body) {
  res.status(status).json(body);
}

function shiftDocToApi(doc) {
  if (!doc) return null;
  let expected_totals = {};
  let counted_totals = {};
  try {
    expected_totals = JSON.parse(doc.expected_totals_json || '{}');
  } catch {
    void 0;
  }
  try {
    counted_totals = JSON.parse(doc.counted_totals_json || '{}');
  } catch {
    void 0;
  }
  return {
    id: doc.$id,
    status: String(doc.status || ''),
    academy_id: doc.academy_id || doc.academyId,
    opened_by: doc.opened_by,
    opened_by_name: doc.opened_by_name,
    opened_at: doc.opened_at || doc.$createdAt,
    opening_balance: Number(doc.opening_balance || 0),
    closed_by: doc.closed_by || null,
    closed_at: doc.closed_at || null,
    closing_balance: doc.closing_balance != null ? Number(doc.closing_balance) : null,
    expected_totals,
    counted_totals,
    difference: doc.difference != null ? Number(doc.difference) : null,
    notes: doc.notes || '',
    moves_json: doc.moves_json || '[]',
  };
}

export async function findOpenCashShift(academyId) {
  if (!CASH_SHIFTS_COL || !DB_ID || !academyId) return null;
  try {
    const res = await databases.listDocuments(DB_ID, CASH_SHIFTS_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('status', 'open'),
      Query.limit(1),
    ]);
    return res.documents?.[0] || null;
  } catch {
    try {
      const res = await databases.listDocuments(DB_ID, CASH_SHIFTS_COL, [
        Query.equal('academyId', academyId),
        Query.equal('status', 'open'),
        Query.limit(1),
      ]);
      return res.documents?.[0] || null;
    } catch {
      return null;
    }
  }
}

async function aggregateShiftSales(shiftId, academyId) {
  const totals = {};
  if (!SALES_COL || !shiftId) return totals;

  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const queries = [
      Query.equal('cash_shift_id', shiftId),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, SALES_COL, queries);
    } catch {
      break;
    }
    const docs = (res.documents || []).filter(
      (d) =>
        String(d.status || '').toLowerCase() === 'concluida' &&
        (!d.academyId || String(d.academyId) === academyId)
    );
    for (const sale of docs) {
      const list = parsePagamentosJson(sale.pagamentos_json);
      if (list.length) {
        for (const p of list) {
          const forma = normalizePaymentForma(p.forma);
          totals[forma] = roundMoney((totals[forma] || 0) + Number(p.valor || 0));
          if (forma === 'dinheiro' && Number(p.troco) > 0) {
            const trocoForma = normalizePaymentForma(p.forma_troco || 'pix');
            totals[trocoForma] = roundMoney((totals[trocoForma] || 0) - Number(p.troco));
          }
        }
      } else {
        const fp = normalizePaymentForma(sale.forma_pagamento);
        if (fp && fp !== 'a_receber') {
          totals[fp] = roundMoney((totals[fp] || 0) + Number(sale.total || 0));
        }
      }
    }
    if (!res.documents?.length || res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return totals;
}

export default async function cashShiftHandler(req, res) {
  if (!CASH_SHIFTS_COL || !DB_ID) {
    return json(res, 503, { ok: false, error: 'cash_shift_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;
  const userId = me.$id;
  const userName = String(me.name || me.email || 'Usuário').slice(0, 128);

  const action = String(req.query?.action || req.body?.action || '').trim();

  if (req.method === 'GET' && action === 'shift') {
    const open = await findOpenCashShift(academyId);
    if (!open) return json(res, 200, { ok: true, shift: null });
    const expected_totals = await aggregateShiftSales(open.$id, academyId);
    const shift = shiftDocToApi(open);
    shift.expected_totals_live = expected_totals;
    return json(res, 200, { ok: true, shift });
  }

  if (req.method === 'POST' && action === 'shift_open') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return json(res, 400, { ok: false, error: 'invalid_json' });
      }
    }
    const existing = await findOpenCashShift(academyId);
    if (existing) {
      return json(res, 409, { ok: false, error: 'shift_already_open', shift_id: existing.$id });
    }
    const opening = roundMoney(body?.opening_balance ?? 0);
    if (opening < 0) return json(res, 400, { ok: false, error: 'invalid_opening_balance' });

    const doc = await createDocumentResilient(databases, DB_ID, CASH_SHIFTS_COL, ID.unique(), {
      academy_id: academyId,
      academyId,
      status: 'open',
      opened_by: userId,
      opened_by_name: userName,
      opened_at: new Date().toISOString(),
      opening_balance: opening,
      moves_json: '[]',
    });
    return json(res, 200, { ok: true, shift: shiftDocToApi(doc) });
  }

  if (req.method === 'PATCH' && action === 'shift_close') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return json(res, 400, { ok: false, error: 'invalid_json' });
      }
    }
    const open = await findOpenCashShift(academyId);
    if (!open) return json(res, 404, { ok: false, error: 'shift_not_open' });

    const expected_totals = await aggregateShiftSales(open.$id, academyId);
    const counted_totals =
      body?.counted_totals && typeof body.counted_totals === 'object' ? body.counted_totals : {};
    const normalizedCounted = {};
    for (const [k, v] of Object.entries(counted_totals)) {
      normalizedCounted[normalizePaymentForma(k)] = roundMoney(v);
    }

    const opening = roundMoney(open.opening_balance || 0);
    const expectedCash = roundMoney(
      opening + (expected_totals.dinheiro || 0) + (expected_totals.cash || 0)
    );
    const countedCash = roundMoney(
      normalizedCounted.dinheiro ?? normalizedCounted.cash ?? body?.closing_balance ?? 0
    );
    const difference = roundMoney(countedCash - expectedCash);

    const updated = await updateDocumentResilient(databases, DB_ID, CASH_SHIFTS_COL, open.$id, {
      status: 'closed',
      closed_by: userId,
      closed_by_name: userName,
      closed_at: new Date().toISOString(),
      closing_balance: countedCash,
      expected_totals_json: JSON.stringify(expected_totals),
      counted_totals_json: JSON.stringify(normalizedCounted),
      difference,
      notes: String(body?.notes || '').slice(0, 512),
    });
    return json(res, 200, { ok: true, shift: shiftDocToApi(updated) });
  }

  if (req.method === 'POST' && action === 'shift_move') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return json(res, 400, { ok: false, error: 'invalid_json' });
      }
    }
    const open = await findOpenCashShift(academyId);
    if (!open) return json(res, 404, { ok: false, error: 'shift_not_open' });

    const type = String(body?.type || '').trim();
    if (type !== 'withdrawal' && type !== 'supply') {
      return json(res, 400, { ok: false, error: 'invalid_move_type' });
    }
    const amount = roundMoney(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { ok: false, error: 'invalid_amount' });
    }

    let moves = [];
    try {
      moves = JSON.parse(open.moves_json || '[]');
      if (!Array.isArray(moves)) moves = [];
    } catch {
      moves = [];
    }
    moves.push({
      type,
      amount,
      note: String(body?.note || '').slice(0, 256),
      at: new Date().toISOString(),
      by: userId,
      by_name: userName,
    });

    const updated = await updateDocumentResilient(databases, DB_ID, CASH_SHIFTS_COL, open.$id, {
      moves_json: JSON.stringify(moves).slice(0, 4000),
    });
    return json(res, 200, { ok: true, shift: shiftDocToApi(updated) });
  }

  res.setHeader('Allow', 'GET, POST, PATCH');
  return json(res, 405, { ok: false, error: 'method_not_allowed' });
}

export async function assertCashShiftForSale(academyDoc, academyId) {
  const settings = readSalesSettings(academyDoc?.settings);
  if (!settings.requireCashShift) return { ok: true, shiftId: null };
  const open = await findOpenCashShift(academyId);
  if (!open) return { ok: false, error: 'shift_required' };
  return { ok: true, shiftId: open.$id };
}

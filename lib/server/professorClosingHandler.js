/**
 * GET /api/finance?route=professor-closing&month=YYYY-MM
 * POST /api/finance?route=professor-closing  { action: mark-paid | reopen, ... }
 */
import { ID, Permission, Query, Role } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  ensureAcademyOwnerOrAdmin,
  databases,
  DB_ID,
} from './academyAccess.js';
import { apiErro, logApiError } from './friendlyError.js';
import {
  aggregateProfessorClosingMonth,
  isCollectionMissingError,
  monthBoundsFromYearMonth,
  probeProfessorClosingsCollection,
  PROFESSOR_CLOSINGS_COL,
} from './professorClosingAggregate.js';
import {
  buildPaidSnapshot,
  buildProfessorClosingExpenseDescription,
  CLOSING_STATUS_OPEN,
  CLOSING_STATUS_PAID,
  financeExpenseAmountFromNet,
} from '../professorClosing.js';
import { resolveStaffRates } from '../professorCompensation.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { FINANCE_ORIGIN_PROFESSOR_CLOSING } from '../../src/lib/financeOriginTypes.js';
import {
  buildFinanceTxPayload,
  financeTxDocumentForAppwrite,
  financeTxDocumentWithOptionals,
  FINANCIAL_TX_MIN,
} from './financeTxFields.js';
import { createDocumentResilient, updateDocumentResilient } from './appwriteSchemaResilient.js';
import { reverseEligibilityError, reverseSettledFinanceTx } from './financeTxReverse.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import { notifyFinanceHubDataChanged } from './financeHubServerInvalidate.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

function json(res, status, body) {
  res.status(status).json(body);
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== 'object') return null;
  return body;
}

async function assertProfessorClosingsCollection() {
  const probe = await probeProfessorClosingsCollection(databases, DB_ID);
  if (probe === 'ok') return;
  const err = new Error('professor_closings_collection_missing');
  err.code =
    probe === 'unconfigured'
      ? 'professor_closings_not_configured'
      : 'professor_closings_collection_missing';
  throw err;
}

async function findClosingDoc(academyId, staffRef, yearMonth) {
  const res = await databases.listDocuments(DB_ID, PROFESSOR_CLOSINGS_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('staff_ref', staffRef),
    Query.equal('year_month', yearMonth),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

async function ensureClosingDoc({
  academyId,
  staffRef,
  staffName,
  role,
  yearMonth,
  existing,
}) {
  if (existing) return existing;
  return createDocumentResilient(
    databases,
    DB_ID,
    PROFESSOR_CLOSINGS_COL,
    ID.unique(),
    {
      academy_id: academyId,
      staff_ref: staffRef,
      staff_name: String(staffName || staffRef).slice(0, 256),
      role: String(role || 'professor').slice(0, 64),
      year_month: yearMonth,
      status: CLOSING_STATUS_OPEN,
      counts_json: '{}',
      amounts_json: '{}',
      rates_snapshot_json: '{}',
      finance_tx_id: '',
    },
    [Permission.read(Role.users()), Permission.update(Role.users())]
  );
}

function isTxDocumentMissingError(e) {
  const msg = String(e?.message || '').toLowerCase();
  const code = Number(e?.code ?? e?.status ?? 0);
  return (
    code === 404 ||
    msg.includes('document_not_found') ||
    (msg.includes('document') && msg.includes('not found')) ||
    msg.includes('could not be found')
  );
}

/**
 * Reusable settled expense for a closing (not cancelled / not already reversed).
 * @returns {Promise<object|null>}
 */
async function findReusableProfessorClosingExpense(academyId, closingId) {
  if (!FINANCIAL_TX_COL || !DB_ID || !closingId) return null;
  try {
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
      Query.equal('academyId', academyId),
      Query.equal('origin_id', String(closingId)),
      Query.equal('origin_type', FINANCE_ORIGIN_PROFESSOR_CLOSING),
      Query.limit(10),
    ]);
    const docs = res.documents || [];
    for (const doc of docs) {
      const st = String(doc.status || '').toLowerCase();
      if (st !== 'settled') continue;
      // already_reversed / already_cancelled / other ineligible → not reusable
      if (reverseEligibilityError(doc)) continue;
      return doc;
    }
    return null;
  } catch {
    return null;
  }
}

async function createProfessorClosingExpense({
  academyId,
  me,
  amount,
  description,
  paymentMethod,
  bankAccountId,
  yearMonth,
  closingId,
  staffRef,
}) {
  if (!FINANCIAL_TX_COL) {
    const err = new Error('financial_tx_not_configured');
    err.code = 'financial_tx_not_configured';
    throw err;
  }

  const settledAt = new Date().toISOString();
  const payload = buildFinanceTxPayload(
    {
      academyId,
      type: FINANCE_CATEGORIES.SALARIOS.type,
      category: FINANCE_CATEGORIES.SALARIOS.label,
      gross: amount,
      fee: 0,
      method: paymentMethod || 'pix',
      installments: 1,
      planName: description,
      note: `staff_ref=${staffRef}; month=${yearMonth}`,
      status: 'settled',
      settledAt,
      competence_month: yearMonth,
      direction: 'out',
      bank_account: bankAccountId || '',
      origin_type: FINANCE_ORIGIN_PROFESSOR_CLOSING,
      origin_id: closingId,
    },
    {
      created_by: me.$id,
      updated_by: me.$id,
      origin_type: FINANCE_ORIGIN_PROFESSOR_CLOSING,
      origin_id: closingId,
    }
  );
  payload.direction = 'out';

  const forDb = financeTxDocumentWithOptionals(payload);
  const doc = await createDocumentResilient(
    databases,
    DB_ID,
    FINANCIAL_TX_COL,
    ID.unique(),
    forDb,
    [Permission.read(Role.users()), Permission.update(Role.users())]
  );

  await recordFinancialAudit({
    action: 'tx_create',
    payment_id: doc.$id,
    academy_id: academyId,
    user_id: me.$id,
    amount: payload.gross,
    previous_status: '',
    new_status: 'settled',
    meta: {
      origin_type: FINANCE_ORIGIN_PROFESSOR_CLOSING,
      staff_ref: staffRef,
      year_month: yearMonth,
      professor_closing_id: closingId,
    },
  });

  void applyAccountingSideEffectsAutoServer(
    {
      id: doc.$id,
      type: payload.type,
      category: payload.category,
      gross: payload.gross,
      fee: 0,
      net: payload.net,
      status: 'settled',
      settledAt: payload.settledAt,
      competence_month: payload.competence_month || yearMonth,
      planName: payload.planName,
      direction: 'out',
    },
    academyId
  );

  notifyFinanceHubDataChanged(academyId);
  return doc;
}

/**
 * Persist paid snapshot + finance_tx_id; retry once on failure so orphaned txs get linked.
 */
async function persistPaidClosing({ closingId, paidPatch, financeTxId }) {
  try {
    return await updateDocumentResilient(
      databases,
      DB_ID,
      PROFESSOR_CLOSINGS_COL,
      closingId,
      paidPatch
    );
  } catch (firstErr) {
    if (!financeTxId) throw firstErr;
    try {
      return await updateDocumentResilient(
        databases,
        DB_ID,
        PROFESSOR_CLOSINGS_COL,
        closingId,
        paidPatch
      );
    } catch (retryErr) {
      const err = new Error('closing_update_failed_after_expense');
      err.code = 'closing_update_failed_after_expense';
      err.finance_tx_id = financeTxId;
      err.cause = retryErr;
      throw err;
    }
  }
}

function hubRowFromClosing(closing, liveRow = {}) {
  return {
    staff_ref: String(closing.staff_ref || liveRow.staff_ref || '').trim(),
    name: String(closing.staff_name || liveRow.name || '').trim(),
    role: String(closing.role || liveRow.role || 'professor'),
    counts: liveRow.counts || {},
    amounts: liveRow.amounts || {},
    status: String(closing.status || CLOSING_STATUS_OPEN),
    closing_id: closing.$id || null,
    finance_tx_id: String(closing.finance_tx_id || '').trim() || null,
    post_paid_activity: false,
  };
}

async function handleMarkPaid(req, res, me) {
  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const body = parseBody(req);
  if (!body) return json(res, 400, { ok: false, error: 'invalid_json' });

  const month = String(body.month || '').trim();
  const staffRef = String(body.staff_ref || '').trim();
  const paymentMethod = String(body.payment_method || body.method || 'pix').trim() || 'pix';
  const bankAccountId = String(body.bank_account_id || body.bank_account || '').trim();

  if (!monthBoundsFromYearMonth(month)) {
    return json(res, 400, { ok: false, error: 'month_required' });
  }
  if (!staffRef) {
    return json(res, 400, { ok: false, error: 'staff_ref_required' });
  }
  if (!DB_ID) {
    return json(res, 503, { ok: false, error: 'database_not_configured' });
  }

  try {
    await assertProfessorClosingsCollection();
  } catch (e) {
    if (
      e?.code === 'professor_closings_collection_missing' ||
      e?.code === 'professor_closings_not_configured'
    ) {
      return json(res, 503, {
        ok: false,
        error: 'professor_closings_collection_missing',
        message:
          'Coleção professor_closings não configurada. Execute o provisionamento do schema.',
      });
    }
    throw e;
  }

  try {
    const aggregated = await aggregateProfessorClosingMonth(databases, DB_ID, academyId, month, {
      academyDoc,
    });
    const liveRow = (aggregated.rows || []).find((r) => r.staff_ref === staffRef);
    if (!liveRow) {
      return json(res, 404, { ok: false, error: 'staff_not_found' });
    }
    if (liveRow.status === CLOSING_STATUS_PAID) {
      return json(res, 400, { ok: false, error: 'already_paid' });
    }

    const rates = resolveStaffRates(aggregated.compensation, staffRef, liveRow.role);
    const discountPct = aggregated.compensation?.product_discount_pct;
    const snapshot = buildPaidSnapshot({
      counts: liveRow.counts,
      amounts: liveRow.amounts,
      rates,
      discountPct,
    });
    const expenseAmount = financeExpenseAmountFromNet(liveRow.amounts?.net);
    const description = buildProfessorClosingExpenseDescription(liveRow.name, month);

    let existing = null;
    try {
      existing = await findClosingDoc(academyId, staffRef, month);
    } catch (e) {
      if (isCollectionMissingError(e)) {
        return json(res, 503, {
          ok: false,
          error: 'professor_closings_collection_missing',
          message:
            'Coleção professor_closings não configurada. Execute o provisionamento do schema.',
        });
      }
      throw e;
    }

    if (existing && String(existing.status || '').toLowerCase() === CLOSING_STATUS_PAID) {
      return json(res, 400, { ok: false, error: 'already_paid' });
    }

    const closing = await ensureClosingDoc({
      academyId,
      staffRef,
      staffName: liveRow.name,
      role: liveRow.role,
      yearMonth: month,
      existing,
    });

    let financeTxId = '';
    if (expenseAmount >= FINANCIAL_TX_MIN) {
      const reusable = await findReusableProfessorClosingExpense(academyId, closing.$id);
      if (reusable?.$id) {
        financeTxId = reusable.$id;
      } else {
        const txDoc = await createProfessorClosingExpense({
          academyId,
          me,
          amount: expenseAmount,
          description,
          paymentMethod,
          bankAccountId,
          yearMonth: month,
          closingId: closing.$id,
          staffRef,
        });
        financeTxId = txDoc.$id;
        // Link early so a later full paid-patch failure still leaves finance_tx_id on the closing
        try {
          await updateDocumentResilient(databases, DB_ID, PROFESSOR_CLOSINGS_COL, closing.$id, {
            finance_tx_id: financeTxId,
          });
        } catch {
          // Full persist below retries; failure there returns finance_tx_id to the client
        }
      }
    }

    const paidAt = new Date().toISOString();
    const paidPatch = {
      staff_name: String(liveRow.name || staffRef).slice(0, 256),
      role: String(liveRow.role || 'professor').slice(0, 64),
      status: CLOSING_STATUS_PAID,
      counts_json: JSON.stringify(snapshot.counts),
      amounts_json: JSON.stringify(snapshot.amounts),
      rates_snapshot_json: JSON.stringify(snapshot.rates_snapshot),
      finance_tx_id: financeTxId,
      paid_at: paidAt,
      paid_by: String(me.$id || ''),
    };

    const updated = await persistPaidClosing({
      closingId: closing.$id,
      paidPatch,
      financeTxId,
    });

    const row = {
      staff_ref: staffRef,
      name: liveRow.name,
      role: liveRow.role,
      counts: snapshot.counts,
      amounts: snapshot.amounts,
      status: CLOSING_STATUS_PAID,
      closing_id: updated.$id || closing.$id,
      finance_tx_id: financeTxId || null,
      post_paid_activity: false,
    };

    return json(res, 200, {
      ok: true,
      row,
      finance_tx_id: financeTxId || null,
    });
  } catch (e) {
    if (e?.code === 'invalid_month') {
      return json(res, 400, { ok: false, error: 'month_required' });
    }
    if (e?.code === 'financial_tx_not_configured') {
      return json(res, 503, { ok: false, error: 'financial_tx_not_configured' });
    }
    if (e?.code === 'closing_update_failed_after_expense') {
      return json(res, 500, {
        ok: false,
        error: 'closing_update_failed_after_expense',
        finance_tx_id: e.finance_tx_id || null,
        message:
          'Despesa criada, mas o fechamento não foi atualizado. Não tente marcar pago de novo sem conferir o lançamento.',
      });
    }
    if (isCollectionMissingError(e)) {
      return json(res, 503, {
        ok: false,
        error: 'professor_closings_collection_missing',
        message:
          'Coleção professor_closings não configurada. Execute o provisionamento do schema.',
      });
    }
    const msg = String(e?.message || '').trim();
    if (msg === 'valor_invalido' || msg === 'valor_acima_do_limite') {
      return json(res, 400, { ok: false, error: msg });
    }
    logApiError('professor-closing mark-paid', e);
    return json(res, 500, { ok: false, error: apiErro(e, 'save') });
  }
}

async function cancelOrReverseFinanceTx({ prevDoc, academyId, me, reason }) {
  const st = String(prevDoc?.status || '').toLowerCase();
  if (st === 'cancelled') return { skipped: true, reason: 'already_cancelled' };
  if (st === 'settled') {
    const eligibility = reverseEligibilityError(prevDoc);
    if (eligibility === 'already_reversed' || eligibility === 'already_cancelled') {
      return { skipped: true, reason: eligibility };
    }
    if (eligibility) {
      const err = new Error(eligibility);
      err.code = eligibility;
      throw err;
    }
    await reverseSettledFinanceTx({
      prevDoc,
      academyId,
      me,
      reason,
    });
    notifyFinanceHubDataChanged(academyId);
    return { reversed: true };
  }
  // pending / other → cancel
  await databases.updateDocument(
    DB_ID,
    FINANCIAL_TX_COL,
    prevDoc.$id,
    financeTxDocumentForAppwrite({ status: 'cancelled', settledAt: '' })
  );
  await recordFinancialAudit({
    action: 'tx_cancel',
    payment_id: prevDoc.$id,
    academy_id: academyId,
    user_id: me.$id,
    amount: prevDoc.gross,
    previous_status: String(prevDoc.status || ''),
    new_status: 'cancelled',
    meta: { reason: 'professor_closing_reopen' },
  });
  notifyFinanceHubDataChanged(academyId);
  return { cancelled: true };
}

async function handleReopen(req, res, me) {
  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const body = parseBody(req);
  if (!body) return json(res, 400, { ok: false, error: 'invalid_json' });

  const month = String(body.month || '').trim();
  const staffRef = String(body.staff_ref || '').trim();
  const closingId = String(body.closing_id || body.closingId || '').trim();

  if (!monthBoundsFromYearMonth(month) && !closingId) {
    return json(res, 400, { ok: false, error: 'month_required' });
  }
  if (!staffRef && !closingId) {
    return json(res, 400, { ok: false, error: 'staff_ref_required' });
  }
  if (!DB_ID) {
    return json(res, 503, { ok: false, error: 'database_not_configured' });
  }

  try {
    await assertProfessorClosingsCollection();
  } catch (e) {
    if (
      e?.code === 'professor_closings_collection_missing' ||
      e?.code === 'professor_closings_not_configured'
    ) {
      return json(res, 503, {
        ok: false,
        error: 'professor_closings_collection_missing',
        message:
          'Coleção professor_closings não configurada. Execute o provisionamento do schema.',
      });
    }
    throw e;
  }

  try {
    let closing = null;
    if (closingId) {
      try {
        closing = await databases.getDocument(DB_ID, PROFESSOR_CLOSINGS_COL, closingId);
      } catch (e) {
        if (isCollectionMissingError(e)) {
          return json(res, 503, {
            ok: false,
            error: 'professor_closings_collection_missing',
          });
        }
        return json(res, 404, { ok: false, error: 'closing_not_found' });
      }
      if (String(closing.academy_id || '') !== String(academyId)) {
        return json(res, 403, { ok: false, error: 'forbidden' });
      }
    } else {
      closing = await findClosingDoc(academyId, staffRef, month);
      if (!closing) {
        return json(res, 404, { ok: false, error: 'closing_not_found' });
      }
    }

    if (String(closing.status || '').toLowerCase() !== CLOSING_STATUS_PAID) {
      return json(res, 400, { ok: false, error: 'not_paid' });
    }

    const txId = String(closing.finance_tx_id || '').trim();
    if (txId && FINANCIAL_TX_COL) {
      let prevDoc = null;
      try {
        prevDoc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, txId);
      } catch (e) {
        if (!isTxDocumentMissingError(e)) {
          logApiError('professor-closing reopen get tx', e);
          return json(res, 500, { ok: false, error: 'reverse_failed' });
        }
        // tx already gone → safe to reopen
        prevDoc = null;
      }

      if (prevDoc) {
        if (String(prevDoc.academyId || '') !== String(academyId)) {
          return json(res, 403, { ok: false, error: 'forbidden' });
        }
        try {
          await cancelOrReverseFinanceTx({
            prevDoc,
            academyId,
            me,
            reason: `Estorno fechamento professor — ${closing.staff_name || closing.staff_ref} — ${closing.year_month}`,
          });
        } catch (e) {
          const code = String(e?.code || e?.message || '').trim();
          const known400 = [
            'only_settled_can_reverse',
            'cannot_reverse_reversal',
            'cannot_reverse_recurrence_template',
            'already_reversed',
            'already_cancelled',
          ];
          // already_* are success-equivalent (cancelOrReverse already treats them as skipped,
          // but reverseSettledFinanceTx may still throw already_reversed in races)
          if (code === 'already_reversed' || code === 'already_cancelled') {
            // proceed to reopen
          } else if (known400.includes(code)) {
            logApiError('professor-closing reopen reverse', e);
            return json(res, 400, { ok: false, error: code });
          } else {
            logApiError('professor-closing reopen reverse', e);
            return json(res, 500, {
              ok: false,
              error: code || 'reverse_failed',
              message: 'Não foi possível estornar o lançamento; o fechamento permanece pago.',
            });
          }
        }
      }
    } else if (txId && !FINANCIAL_TX_COL) {
      return json(res, 503, { ok: false, error: 'financial_tx_not_configured' });
    }

    const updated = await updateDocumentResilient(
      databases,
      DB_ID,
      PROFESSOR_CLOSINGS_COL,
      closing.$id,
      {
        status: CLOSING_STATUS_OPEN,
        finance_tx_id: '',
        paid_at: '',
        paid_by: '',
      }
    );

    const row = hubRowFromClosing(updated, {
      staff_ref: closing.staff_ref,
      name: closing.staff_name,
      role: closing.role,
    });
    row.status = CLOSING_STATUS_OPEN;
    row.finance_tx_id = null;

    return json(res, 200, { ok: true, row });
  } catch (e) {
    if (isCollectionMissingError(e)) {
      return json(res, 503, {
        ok: false,
        error: 'professor_closings_collection_missing',
      });
    }
    logApiError('professor-closing reopen', e);
    return json(res, 500, { ok: false, error: apiErro(e, 'save') });
  }
}

export default async function professorClosingHandler(req, res) {
  if (req.method === 'GET') {
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId, doc: academyDoc } = access;

    const month = String(req.query.month || '').trim();
    if (!monthBoundsFromYearMonth(month)) {
      return json(res, 400, { ok: false, error: 'month_required' });
    }

    if (!DB_ID) {
      return json(res, 503, { ok: false, error: 'database_not_configured' });
    }

    try {
      const payload = await aggregateProfessorClosingMonth(databases, DB_ID, academyId, month, {
        academyDoc,
      });
      return json(res, 200, payload);
    } catch (e) {
      if (e?.code === 'invalid_month') {
        return json(res, 400, { ok: false, error: 'month_required' });
      }
      logApiError('professor-closing', e);
      return json(res, 500, { ok: false, error: apiErro(e, 'load') });
    }
  }

  if (req.method === 'POST') {
    const me = await ensureAuth(req, res);
    if (!me) return;

    const body = parseBody(req);
    if (!body) return json(res, 400, { ok: false, error: 'invalid_json' });

    const action = String(body.action || '').trim().toLowerCase();
    if (action === 'mark-paid' || action === 'mark_paid') {
      return handleMarkPaid(req, res, me);
    }
    if (action === 'reopen') {
      return handleReopen(req, res, me);
    }
    return json(res, 400, { ok: false, error: 'action_required' });
  }

  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { ok: false, error: 'method_not_allowed' });
}

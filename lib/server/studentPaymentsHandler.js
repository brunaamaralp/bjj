/**
 * POST/PATCH/GET student_payments — mensalidades de alunos (Appwrite).
 * RBAC: titular/admin estornam; recepcionista registra pagamento.
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  ensureAcademyOwnerOrAdmin,
  isAcademyOwnerOrAdminUser,
  DB_ID,
  databases,
} from './academyAccess.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import { expectedAmountWithCardFee } from '../../src/lib/paymentStatus.js';
import { isBundleAnchorPayment } from '../../src/lib/paymentCategories.js';
import { generatePaymentReceiptPdfBuffer } from '../receipts/paymentReceiptPdf.js';
import { formatPaymentIdShort, isPaymentReceiptEligible } from '../receipts/paymentReceiptText.js';
import { syncStudentOverdueAfterPayment } from './studentOverdueSync.js';
import { mirrorStudentPaymentToFinancialTx } from './studentPaymentFinancialTxMirror.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const PEOPLE_COL = STUDENTS_COL;

const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 1_000_000;

const DUPLICATE_PAYMENT_MSG =
  'Já existe um lançamento com este valor e data para este aluno.';

function json(res, status, body) {
  res.status(status).json(body);
}

/** Data civil (YYYY-MM-DD) usada na regra de duplicata. */
export function paymentDuplicateDateKey(data) {
  if (data?.paid_at) return String(data.paid_at).slice(0, 10);
  if (data?.due_date) return String(data.due_date).slice(0, 10);
  const ref = String(data?.reference_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(ref)) return `${ref}-01`;
  return null;
}

function amountsEqual(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) < 0.005;
}

async function findDuplicatePayment({ leadId, academyId, amount, dateKey, excludeId }) {
  if (!PAYMENTS_COL || !leadId || !academyId || !dateKey) return null;
  const list = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('lead_id', leadId),
    Query.equal('academy_id', academyId),
    Query.limit(100),
  ]);
  for (const doc of list.documents || []) {
    if (excludeId && String(doc.$id) === String(excludeId)) continue;
    if (!amountsEqual(doc.amount, amount)) continue;
    if (paymentDuplicateDateKey(doc) === dateKey) return doc;
  }
  return null;
}

function parseFinanceConfig(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

async function maybeSyncOverdueAfterSettlement(studentDoc, academyId, leadId, financeConfig, status) {
  const st = String(status || '').toLowerCase();
  if (st !== 'paid' && st !== 'partial') return;
  if (!PEOPLE_COL) return;
  try {
    await syncStudentOverdueAfterPayment(databases, DB_ID, studentDoc, {
      academyId,
      leadId,
      financeConfig,
      peopleCol: PEOPLE_COL,
    });
  } catch (e) {
    console.error('[student-payments] overdue sync failed', leadId, e?.message || e);
  }
}

async function maybeMirrorPaymentToCaixa(paymentDoc, payload, financeConfig, studentDoc) {
  try {
    return await mirrorStudentPaymentToFinancialTx({
      paymentDoc,
      payload,
      financeConfig,
      studentDoc,
      existingTxId: paymentDoc.financial_tx_id,
    });
  } catch (e) {
    console.error('[student-payments] financial_tx mirror failed', paymentDoc?.$id, e?.message || e);
    return { mirrorId: null, warning: e?.message || 'mirror_failed' };
  }
}

function isGridPayment(doc) {
  const cat = String(doc?.payment_category || 'plan').toLowerCase();
  return cat === 'plan' || cat === 'bundle' || !doc?.payment_category;
}

async function assertStudentInAcademy(studentId, academyId) {
  const doc = await databases.getDocument(DB_ID, STUDENTS_COL, studentId);
  if (String(doc.academyId || '') !== String(academyId)) {
    const err = new Error('forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }
  return doc;
}

function validateAmount(amount, status) {
  const n = Number(amount);
  if (status === 'paid' || status === 'partial') {
    if (!Number.isFinite(n) || n < MIN_AMOUNT || n > MAX_AMOUNT) {
      throw new Error(`Valor deve estar entre R$ ${MIN_AMOUNT} e R$ ${MAX_AMOUNT.toLocaleString('pt-BR')}`);
    }
  }
  return n;
}

function buildPayload(data, financeConfig, studentDoc) {
  const status = String(data.status || 'pending').toLowerCase();
  const method = String(data.method || 'pix');
  const installments = data.installments;
  const student = {
    plan: data.plan_name || studentDoc?.plan,
    dueDay: studentDoc?.due_day ?? studentDoc?.dueDay,
  };
  let expected = Number(data.expected_amount);
  if (!Number.isFinite(expected) || expected <= 0) {
    expected = expectedAmountWithCardFee(student, financeConfig, method, installments, data);
  }
  const paidAmt = Number(data.paid_amount ?? data.amount);
  validateAmount(status === 'partial' ? paidAmt : data.amount ?? paidAmt, status);

  const payload = {
    lead_id: String(data.lead_id),
    academy_id: String(data.academy_id),
    amount: Number(data.amount ?? paidAmt) || 0,
    method,
    account: String(data.account || ''),
    plan_name: String(data.plan_name || studentDoc?.plan || ''),
    status,
    reference_month: data.reference_month || null,
    due_date: data.due_date || null,
    paid_at: data.paid_at || null,
    registered_by: String(data.registered_by || ''),
    registered_by_name: String(data.registered_by_name || ''),
    note: String(data.note || '').slice(0, 2000),
    payment_category: String(data.payment_category || 'plan'),
  };
  if (Number.isFinite(expected) && expected >= 0) payload.expected_amount = expected;
  if (status === 'paid' || status === 'partial') {
    payload.paid_amount = paidAmt;
    payload.amount = paidAmt;
  }
  return payload;
}

async function listBundlePaymentsForReceipt(anchorPayment, academyId) {
  const anchorId = String(anchorPayment.$id || '').trim();
  const originId = String(anchorPayment.bundle_origin_id || anchorId).trim();
  if (!anchorId || !PAYMENTS_COL) return [anchorPayment];

  const leadId = String(anchorPayment.lead_id || '').trim();
  if (!leadId) return [anchorPayment];

  const list = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('lead_id', leadId),
    Query.equal('academy_id', academyId),
    Query.limit(100),
  ]);

  const related = (list.documents || []).filter((p) => {
    const oid = String(p.bundle_origin_id || '').trim();
    return oid === originId || String(p.$id) === anchorId || String(p.$id) === originId;
  });

  return related.length ? related : [anchorPayment];
}

export async function handlePaymentReceiptPdf(req, res, academyId, academyDoc) {
  const paymentId = String(req.query.id || '').trim();
  if (!paymentId) return json(res, 400, { ok: false, erro: 'id_required' });

  try {
    const payment = await databases.getDocument(DB_ID, PAYMENTS_COL, paymentId);
    if (String(payment.academy_id || '') !== String(academyId)) {
      return json(res, 403, { ok: false, erro: 'forbidden' });
    }

    const eligible = isPaymentReceiptEligible(payment);
    if (!eligible.ok) {
      return json(res, 400, {
        ok: false,
        erro: 'Comprovante PDF disponível apenas para pagamentos recebidos (pago ou parcial)',
      });
    }

    const target = isBundleAnchorPayment(payment)
      ? payment
      : await (async () => {
          const oid = String(payment.bundle_origin_id || '').trim();
          if (!oid) return payment;
          try {
            return await databases.getDocument(DB_ID, PAYMENTS_COL, oid);
          } catch {
            return payment;
          }
        })();

    const studentDoc = await assertStudentInAcademy(String(payment.lead_id || ''), academyId);
    const bundlePayments = isBundleAnchorPayment(target)
      ? await listBundlePaymentsForReceipt(target, academyId)
      : [];

    const buffer = await generatePaymentReceiptPdfBuffer({
      payment: target,
      studentDoc,
      academyDoc,
      bundlePayments,
    });

    const idShort = formatPaymentIdShort(target.$id).replace('#', '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="recibo-pagamento-${idShort}.pdf"`
    );
    return res.status(200).send(buffer);
  } catch (e) {
    if (e.code === 'FORBIDDEN') return json(res, 403, { ok: false, erro: 'Acesso negado' });
    console.error('[student-payments] receipt pdf:', paymentId, e?.message || e);
    return json(res, 500, { ok: false, erro: e?.message || 'Erro ao gerar comprovante' });
  }
}

export async function handleListStudentPayments(req, res, academyId) {
  const ym = String(req.query.reference_month || req.query.month || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  if (!PAYMENTS_COL || !ym) return json(res, 400, { ok: false, erro: 'reference_month_required' });

  try {
    const queries = [
      Query.equal('academy_id', academyId),
      Query.equal('reference_month', ym),
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
    ];

    const cursor = String(req.query.cursor || '').trim();
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    } else if (page > 1) {
      queries.push(Query.offset((page - 1) * limit));
    }

    const list = await databases.listDocuments(DB_ID, PAYMENTS_COL, queries);
    const payments = (list.documents || []).filter(isGridPayment);
    const lastDoc = (list.documents || [])[list.documents.length - 1];
    return json(res, 200, {
      ok: true,
      payments,
      page,
      limit,
      total: list.total ?? payments.length,
      next_cursor: lastDoc?.$id && payments.length >= limit ? lastDoc.$id : null,
    });
  } catch (e) {
    console.error(JSON.stringify({
      event: 'student_payments_list_error',
      academyId,
      reference_month: ym,
      page,
      limit,
      PAYMENTS_COL: PAYMENTS_COL ? 'set' : 'MISSING',
      error: e?.message || String(e),
      stack: e?.stack?.slice(0, 600),
    }));
    return json(res, 500, { ok: false, erro: e?.message || 'Erro ao listar pagamentos', detail: e?.message });
  }
}

export async function handleCreateStudentPayment(req, res, academyId, me, academyDoc) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, erro: 'JSON inválido' });
    }
  }

  const leadId = String(body.lead_id || '').trim();
  if (!leadId) return json(res, 400, { ok: false, erro: 'lead_id_required' });

  try {
    const studentDoc = await assertStudentInAcademy(leadId, academyId);
    const financeConfig = parseFinanceConfig(academyDoc.financeConfig);
    const payload = buildPayload({ ...body, lead_id: leadId, academy_id: academyId }, financeConfig, studentDoc);

    const existing = payload.reference_month
      ? await databases.listDocuments(DB_ID, PAYMENTS_COL, [
          Query.equal('lead_id', leadId),
          Query.equal('reference_month', payload.reference_month),
          Query.limit(5),
        ])
      : { documents: [] };

    let doc;
    const prev = existing.documents?.[0];
    if (prev) {
      doc = await databases.updateDocument(DB_ID, PAYMENTS_COL, prev.$id, payload);
      await recordFinancialAudit({
        action: 'payment_update',
        payment_id: prev.$id,
        student_id: leadId,
        academy_id: academyId,
        user_id: me.$id,
        amount: payload.amount,
        previous_status: prev.status,
        new_status: payload.status,
      });
    } else {
      const dateKey = paymentDuplicateDateKey(payload);
      const dup = await findDuplicatePayment({
        leadId,
        academyId,
        amount: payload.amount,
        dateKey,
      });
      if (dup) {
        return json(res, 409, { ok: false, erro: DUPLICATE_PAYMENT_MSG });
      }
      doc = await databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), payload, [
        Permission.read(Role.users()),
        Permission.update(Role.users()),
      ]);
      await recordFinancialAudit({
        action: 'payment_create',
        payment_id: doc.$id,
        student_id: leadId,
        academy_id: academyId,
        user_id: me.$id,
        amount: payload.amount,
        previous_status: '',
        new_status: payload.status,
      });
    }

    const mirrorResult = await maybeMirrorPaymentToCaixa(doc, payload, financeConfig, studentDoc);

    await maybeSyncOverdueAfterSettlement(
      studentDoc,
      academyId,
      leadId,
      financeConfig,
      doc.status
    );

    try {
      doc = await databases.getDocument(DB_ID, PAYMENTS_COL, doc.$id);
    } catch {
      void 0;
    }

    return json(res, 200, {
      ok: true,
      payment: doc,
      mirror_warning: mirrorResult?.warning || null,
    });
  } catch (e) {
    if (e.code === 'FORBIDDEN') return json(res, 403, { ok: false, erro: 'Acesso negado' });
    console.error('[student-payments POST]', e?.message || e);
    return json(res, 400, { ok: false, erro: e.message || 'Erro ao registrar pagamento' });
  }
}

export async function handlePatchStudentPayment(req, res, academyId, me, academyDoc) {
  const paymentId = String(req.query.id || '').trim();
  if (!paymentId) return json(res, 400, { ok: false, erro: 'id_required' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, erro: 'JSON inválido' });
    }
  }

  const isReverse = body.action === 'reverse' || body.status === 'cancelled';
  if (isReverse) {
    const adminAccess = await ensureAcademyOwnerOrAdmin(req, res, me);
    if (!adminAccess) return;
  } else if (!(await isAcademyOwnerOrAdminUser(academyDoc, me))) {
    return json(res, 403, { ok: false, erro: 'Apenas titular ou administrador pode editar lançamentos' });
  }

  try {
    const prev = await databases.getDocument(DB_ID, PAYMENTS_COL, paymentId);
    if (String(prev.academy_id || '') !== String(academyId)) {
      return json(res, 403, { ok: false, erro: 'forbidden' });
    }

    const studentDoc = await assertStudentInAcademy(String(prev.lead_id || ''), academyId);
    const financeConfig = parseFinanceConfig(academyDoc.financeConfig);
    const merged = {
      ...prev,
      ...body,
      lead_id: prev.lead_id,
      academy_id: academyId,
    };
    const patch = isReverse
      ? { status: 'cancelled' }
      : buildPayload(merged, financeConfig, studentDoc);

    const dateKey = paymentDuplicateDateKey(patch);
    const dup = await findDuplicatePayment({
      leadId: String(prev.lead_id || ''),
      academyId,
      amount: patch.amount,
      dateKey,
      excludeId: paymentId,
    });
    if (dup) {
      return json(res, 409, { ok: false, erro: DUPLICATE_PAYMENT_MSG });
    }

    const doc = await databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, patch);
    await recordFinancialAudit({
      action: isReverse ? 'payment_reverse' : 'payment_patch',
      payment_id: paymentId,
      student_id: prev.lead_id,
      academy_id: academyId,
      user_id: me.$id,
      amount: doc.amount,
      previous_status: prev.status,
      new_status: doc.status,
    });

    if (isReverse && String(prev.financial_tx_id || '').trim()) {
      console.error(
        JSON.stringify({
          event: 'financial_tx_mirror_alert',
          payment_id: paymentId,
          financial_tx_id: prev.financial_tx_id,
          message: 'Estorno registrado — confira espelho no Caixa manualmente se necessário',
        })
      );
    }

    const mirrorResult = await maybeMirrorPaymentToCaixa(doc, patch, financeConfig, studentDoc);

    await maybeSyncOverdueAfterSettlement(
      studentDoc,
      academyId,
      String(prev.lead_id || ''),
      financeConfig,
      doc.status
    );

    try {
      doc = await databases.getDocument(DB_ID, PAYMENTS_COL, doc.$id);
    } catch {
      void 0;
    }

    return json(res, 200, {
      ok: true,
      payment: doc,
      mirror_warning: mirrorResult?.warning || null,
    });
  } catch (e) {
    console.error('[student-payments PATCH]', paymentId, e?.message || e);
    return json(res, 500, { ok: false, erro: e?.message || 'Erro ao atualizar pagamento' });
  }
}

export default async function studentPaymentsHandler(req, res) {
  if (!PAYMENTS_COL || !DB_ID) {
    return json(res, 503, { ok: false, erro: 'student_payments_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  if (req.method === 'GET') {
    const paymentId = String(req.query.id || '').trim();
    const format = String(req.query.format || req.query.action || '').trim().toLowerCase();
    if (paymentId && (format === 'pdf' || format === 'receipt_pdf')) {
      return handlePaymentReceiptPdf(req, res, academyId, academyDoc);
    }
    return handleListStudentPayments(req, res, academyId);
  }
  if (req.method === 'POST') {
    return handleCreateStudentPayment(req, res, academyId, me, academyDoc);
  }
  if (req.method === 'PATCH') {
    return handlePatchStudentPayment(req, res, academyId, me, academyDoc);
  }
  if (req.method === 'DELETE') {
    return handleDeleteStudentPayment(req, res, academyId, me, academyDoc);
  }

  return json(res, 405, { ok: false, erro: 'method_not_allowed' });
}

export async function handleDeleteStudentPayment(req, res, academyId, me, academyDoc) {
  const paymentId = String(req.query.id || '').trim();
  if (!paymentId) return json(res, 400, { ok: false, erro: 'id_required' });

  if (!(await isAcademyOwnerOrAdminUser(academyDoc, me))) {
    return json(res, 403, { ok: false, erro: 'Apenas titular ou administrador pode excluir lançamentos' });
  }

  try {
    const prev = await databases.getDocument(DB_ID, PAYMENTS_COL, paymentId);
    if (String(prev.academy_id || '') !== String(academyId)) {
      return json(res, 403, { ok: false, erro: 'forbidden' });
    }

    const txId = String(prev.financial_tx_id || '').trim();
    if (txId) {
      const FINANCIAL_TX_COL =
        process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
        process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
        '';
      if (FINANCIAL_TX_COL) {
        try {
          await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, { status: 'cancelled' });
        } catch (e) {
          console.error('[student-payments DELETE] financial_tx cancel:', e?.message || e);
        }
      }
    }

    await databases.deleteDocument(DB_ID, PAYMENTS_COL, paymentId);
    await recordFinancialAudit({
      action: 'payment_delete',
      payment_id: paymentId,
      student_id: prev.lead_id,
      academy_id: academyId,
      user_id: me.$id,
      amount: prev.amount,
      previous_status: prev.status,
      new_status: 'deleted',
    });

    return json(res, 200, { ok: true, deleted: true });
  } catch (e) {
    console.error('[student-payments DELETE]', paymentId, e?.message || e);
    return json(res, 500, { ok: false, erro: e?.message || 'Erro ao excluir pagamento' });
  }
}

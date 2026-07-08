/**
 * POST/PATCH/GET student_payments — mensalidades de alunos (Appwrite).
 * RBAC: titular/admin estornam; recepcionista registra pagamento.
 */
import { apiErro, logApiError } from './friendlyError.js';

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
import { expectedAmountWithCardFee, shouldMirrorPaymentToCaixa } from '../../src/lib/paymentStatus.js';
import { buildEqualInstallmentSchedule } from '../../src/lib/installmentSchedule.js';
import { enrichInstallmentScheduleWithAcquirerFees } from '../../src/lib/acquirerFees.js';
import { resolveAcquirerFeesForPayment } from '../../src/lib/resolveAcquirerFees.js';
import { resolveCreditDaysFromSettings } from '../../src/lib/paymentSettlement.js';
import { dueDateInMonth, studentDueDay } from '../../src/lib/collectionOverdue.js';
import { canonicalPaymentMethodKey } from '../../src/lib/paymentMethods.js';
import { readPaymentMethodSettings } from '../../src/lib/paymentMethodSettings.js';
import {
  countActiveCaptureMethods,
  findCaptureMethodById,
  listActiveCaptureMethods,
  resolveBankAccountForCaptureMethod,
} from '../../src/lib/captureMethods.js';
import { validateCardBrandForSubmit } from '../../src/lib/captureMethodPaymentForm.js';
import { applyAutoMarkReceivedToPaymentStatus } from '../../src/lib/paymentSettlement.js';
import {
  PAYMENT_CATEGORY,
  isBundleAnchorPayment,
  isBundleChildPayment,
  normalizePaymentCategory,
  shouldUpsertByReferenceMonth,
} from '../../src/lib/paymentCategories.js';
import {
  createBundlePaymentServer,
  repairBundleCoverageForMonth,
} from './studentPaymentBundleCreate.js';
import { generatePaymentReceiptPdfBuffer } from '../receipts/paymentReceiptPdf.js';
import { formatPaymentIdShort, isPaymentReceiptEligible } from '../receipts/paymentReceiptText.js';
import { syncStudentOverdueAfterPayment } from './studentOverdueSync.js';
import { scheduleControlIdOverdueReconcile } from './controlidOverdueAccess.js';
import { mirrorStudentPaymentToFinancialTx } from './studentPaymentFinancialTxMirror.js';
import { cancelFinancialTxMirrorsForPayment } from './studentPaymentMirrorCancel.js';
import { reverseSettledFinanceTx } from './financeTxReverse.js';
import {
  markFinancialTxSyncPending,
  clearFinancialTxSyncPending,
} from './studentPaymentSyncPending.js';
import { assertOrRepairStudentInAcademy } from './studentAcademyRepair.js';
import { notifyFinanceHubDataChanged } from './financeHubServerInvalidate.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const PEOPLE_COL = STUDENTS_COL;
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
  process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
  process.env.FINANCIAL_TX_COL ||
  '';

const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 1_000_000;

const DUPLICATE_PAYMENT_MSG =
  'Já existe um lançamento com este valor e data para este aluno.';

const PAYMENT_METHOD_DISABLED_MSG =
  'Esta forma de pagamento está desativada nas configurações financeiras.';

const CAPTURE_METHOD_REQUIRED_MSG =
  'Selecione por qual meio o pagamento foi recebido.';

function assertCaptureMethodForPayment(financeConfig, method, captureMethodId) {
  const key = canonicalPaymentMethodKey(method);
  if (key !== 'cartao_credito' && key !== 'cartao_debito') return;
  const count = countActiveCaptureMethods(financeConfig, key);
  if (count <= 1) return;
  const id = String(captureMethodId || '').trim();
  if (!id) throw new Error(CAPTURE_METHOD_REQUIRED_MSG);
  const cap = findCaptureMethodById(financeConfig, id);
  if (!cap || !cap.active || cap.paymentMethod !== key) {
    throw new Error('Meio de captura inválido ou inativo.');
  }
}

function assertCardBrandForPayment(financeConfig, data) {
  const method = data.method || 'pix';
  const key = canonicalPaymentMethodKey(method);
  if (key !== 'cartao_credito' && key !== 'cartao_debito') return;
  const inst = Math.min(12, Math.max(1, Number(data.installments) || 1));
  const captureMethodId = String(data.capture_method_id || '').trim();
  const feeReceiverId = String(data.fee_receiver_id || '').trim();
  const bankAccount =
    resolveBankAccountForCaptureMethod(financeConfig, captureMethodId) ||
    String(data.account || '').trim();
  const err = validateCardBrandForSubmit(financeConfig, {
    method,
    installments: inst,
    captureMethodId,
    feeReceiverId,
    bankAccount,
    cardBrand: data.card_brand,
  });
  if (err) throw new Error(err);
}

function assertPaymentMethodActive(financeConfig, method) {
  const key = canonicalPaymentMethodKey(method);
  if (!key) throw new Error('Forma de pagamento inválida.');
  const settings = readPaymentMethodSettings(financeConfig)[key];
  if (!settings?.active) throw new Error(PAYMENT_METHOD_DISABLED_MSG);
}

function validatePaymentMethodsForCreate(financeConfig, data) {
  assertPaymentMethodActive(financeConfig, data.method || 'pix');
  assertCaptureMethodForPayment(financeConfig, data.method, data.capture_method_id);
  assertCardBrandForPayment(financeConfig, data);
  const troco = Math.round(Number(data.troco || 0) * 100) / 100;
  if (troco > 0) {
    assertPaymentMethodActive(financeConfig, data.forma_troco || 'pix');
  }
}

function validatePaymentMethodChange(financeConfig, nextMethod, prevMethod) {
  const nextKey = canonicalPaymentMethodKey(nextMethod);
  const prevKey = canonicalPaymentMethodKey(prevMethod);
  if (nextKey && nextKey !== prevKey) {
    assertPaymentMethodActive(financeConfig, nextMethod);
  }
}

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

async function findDuplicatePayment({
  leadId,
  academyId,
  amount,
  dateKey,
  referenceMonth,
  excludeId,
}) {
  if (!PAYMENTS_COL || !leadId || !academyId || !dateKey) return null;
  const wantRef = String(referenceMonth || '').trim();
  const list = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('lead_id', leadId),
    Query.equal('academy_id', academyId),
    Query.limit(100),
  ]);
  for (const doc of list.documents || []) {
    if (excludeId && String(doc.$id) === String(excludeId)) continue;
    if (!amountsEqual(doc.amount, amount)) continue;
    if (paymentDuplicateDateKey(doc) !== dateKey) continue;
    const docRef = String(doc.reference_month || '').trim();
    if (wantRef && docRef && wantRef !== docRef) continue;
    return doc;
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

async function maybeSyncOverdueAfterSettlement(studentDoc, academyId, leadId, financeConfig, status, academyDoc) {
  const st = String(status || '').toLowerCase();
  if (st !== 'paid' && st !== 'partial') return;
  if (!PEOPLE_COL) return;
  try {
    const result = await syncStudentOverdueAfterPayment(databases, DB_ID, studentDoc, {
      academyId,
      leadId,
      financeConfig,
      peopleCol: PEOPLE_COL,
    });
    if (result?.updated && academyDoc) {
      scheduleControlIdOverdueReconcile({ academyId, academyDoc, studentId: leadId });
    }
  } catch (e) {
    console.error('[student-payments] overdue sync failed', leadId, e?.message || e);
  }
}

async function maybeMirrorPaymentToCaixa(paymentDoc, payload, financeConfig, studentDoc) {
  const paymentId = paymentDoc?.$id;
  const status = String(payload?.status ?? paymentDoc?.status ?? '').toLowerCase();
  try {
    const result = await mirrorStudentPaymentToFinancialTx({
      paymentDoc,
      payload,
      financeConfig,
      studentDoc,
      existingTxId: paymentDoc.financial_tx_id,
    });
    if (result.mirrorId && !result.warning) {
      await clearFinancialTxSyncPending(paymentId);
    } else if (shouldMirrorPaymentToCaixa(status)) {
      await markFinancialTxSyncPending(paymentId);
    }
    return result;
  } catch (e) {
    if (shouldMirrorPaymentToCaixa(status)) {
      await markFinancialTxSyncPending(paymentId);
    }
    console.error('[student-payments] financial_tx mirror failed', paymentDoc?.$id, e?.message || e);
    return { mirrorId: null, warning: e?.message || 'mirror_failed' };
  }
}

function isGridPayment(doc) {
  const cat = String(doc?.payment_category || 'plan').toLowerCase();
  return cat === 'plan' || cat === 'bundle' || !doc?.payment_category;
}

async function assertStudentInAcademy(studentId, academyId) {
  return assertOrRepairStudentInAcademy(databases, DB_ID, STUDENTS_COL, studentId, academyId);
}

function validateAmount(amount, status) {
  const n = Number(amount);
  if (status === 'paid' || status === 'partial') {
    if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
      throw new Error(`Valor deve estar entre R$ 0 e R$ ${MAX_AMOUNT.toLocaleString('pt-BR')}`);
    }
  }
  return n;
}

function hasExplicitMonetaryField(data, key) {
  return Object.prototype.hasOwnProperty.call(data || {}, key) && data?.[key] != null;
}

const PAYMENT_OPTIONAL_ATTRS = [
  'paid_amount',
  'expected_amount',
  'payment_category',
  'bundle_months',
  'bundle_origin_id',
  'installments',
  'troco',
  'forma_troco',
  'troco_account',
  'capture_method_id',
  'capture_method_name',
  'fee_receiver_id',
  'card_brand',
];

async function writePaymentDocument(writeFn, payload) {
  let current = { ...payload };
  for (let attempt = 0; attempt < PAYMENT_OPTIONAL_ATTRS.length + 1; attempt += 1) {
    try {
      return await writeFn(current);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/unknown attribute/i.test(msg)) throw e;
      const next = { ...current };
      let stripped = false;
      for (const key of PAYMENT_OPTIONAL_ATTRS) {
        if (key in next) {
          delete next[key];
          stripped = true;
          break;
        }
      }
      if (!stripped) throw e;
      current = next;
    }
  }
  return writeFn(current);
}

function buildPayload(data, financeConfig, studentDoc) {
  const method = String(data.method || 'pix');
  let status = applyAutoMarkReceivedToPaymentStatus(
    String(data.status || 'pending').toLowerCase(),
    method,
    financeConfig
  );
  const installments = data.installments;
  const methodKey = canonicalPaymentMethodKey(method);
  let captureMethodId = String(data.capture_method_id || '').trim();
  if (
    (methodKey === 'cartao_credito' || methodKey === 'cartao_debito') &&
    !captureMethodId
  ) {
    const single = listActiveCaptureMethods(financeConfig, methodKey);
    if (single.length === 1) captureMethodId = single[0].id;
  }
  const capture = captureMethodId ? findCaptureMethodById(financeConfig, captureMethodId) : null;
  const captureAccount = resolveBankAccountForCaptureMethod(financeConfig, captureMethodId);
  const student = {
    plan: data.plan_name || studentDoc?.plan,
    discount_amount: studentDoc?.discount_amount ?? studentDoc?.discountAmount ?? 0,
    discount_type: studentDoc?.discount_type ?? studentDoc?.discountType,
    dueDay: studentDoc?.due_day ?? studentDoc?.dueDay,
  };
  const category = normalizePaymentCategory(data.payment_category);
  const hasExplicitAmount = hasExplicitMonetaryField(data, 'amount');
  const hasExplicitExpected = hasExplicitMonetaryField(data, 'expected_amount');
  const rawAmount = hasExplicitAmount ? Number(data.amount) : Number(data.amount ?? data.paid_amount);
  let expected = hasExplicitExpected ? Number(data.expected_amount) : Number.NaN;
  if (!Number.isFinite(expected)) {
    if (category === PAYMENT_CATEGORY.FEE || category === PAYMENT_CATEGORY.OTHER) {
      expected = Number.isFinite(rawAmount) ? rawAmount : 0;
    } else {
      expected = expectedAmountWithCardFee(student, financeConfig, method, installments, data);
    }
  }
  const paidAmt = Number(data.paid_amount ?? data.amount);
  const amountForValidation = hasExplicitAmount ? rawAmount : data.amount ?? paidAmt;
  validateAmount(status === 'partial' ? paidAmt : amountForValidation, status);

  const payload = {
    lead_id: String(data.lead_id),
    academy_id: String(data.academy_id),
    amount: Number.isFinite(rawAmount) ? rawAmount : 0,
    method,
    account: captureAccount || String(data.account || ''),
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
  const inst = Math.min(12, Math.max(1, Number(installments) || 1));
  if (canonicalPaymentMethodKey(method) === 'cartao_credito') {
    payload.installments = inst;
  }
  if (captureMethodId) {
    payload.capture_method_id = captureMethodId.slice(0, 64);
    if (capture?.name) payload.capture_method_name = String(capture.name).slice(0, 80);
    const feeReceiverId = String(data.fee_receiver_id || capture?.feeReceiverId || '').trim();
    if (feeReceiverId) payload.fee_receiver_id = feeReceiverId.slice(0, 64);
  }
  const cardBrand = String(data.card_brand || '').trim();
  if (cardBrand) payload.card_brand = cardBrand.slice(0, 32);
  if (status === 'paid' || status === 'partial') {
    payload.paid_amount = paidAmt;
    if (!payload.paid_at) payload.paid_at = new Date().toISOString();
  } else if (status === 'pending') {
    payload.paid_at = null;
    if (payload.paid_amount != null) delete payload.paid_amount;
  }
  const bundleMonths = Number(data.bundle_months);
  if (
    normalizePaymentCategory(payload.payment_category) === PAYMENT_CATEGORY.BUNDLE &&
    Number.isFinite(bundleMonths) &&
    bundleMonths > 0
  ) {
    payload.bundle_months = Math.trunc(bundleMonths);
  }
  if (data.bundle_origin_id != null && String(data.bundle_origin_id).trim()) {
    payload.bundle_origin_id = String(data.bundle_origin_id).trim();
  }
  const troco = Math.round(Number(data.troco || 0) * 100) / 100;
  if (troco > 0) {
    if (method !== 'dinheiro') {
      throw new Error('Troco só pode ser informado em pagamentos em dinheiro.');
    }
    const paid = Number(payload.paid_amount ?? payload.amount);
    if (Number.isFinite(paid) && troco > paid) {
      throw new Error('Troco não pode ser maior que o valor recebido da mensalidade.');
    }
    payload.troco = troco;
    payload.forma_troco = String(data.forma_troco || 'pix').trim() || 'pix';
    const trocoAccount = String(data.troco_account || '').trim();
    if (trocoAccount) payload.troco_account = trocoAccount.slice(0, 128);
  }

  if (
    !data.installment_schedule_json &&
    inst > 1 &&
    (status === 'pending' || status === 'awaiting')
  ) {
    const dueYmd =
      String(data.due_date || '').slice(0, 10) ||
      (() => {
        const ym = String(data.reference_month || '').trim();
        if (!/^\d{4}-\d{2}$/.test(ym)) return '';
        const day = studentDueDay(studentDoc) || 10;
        const d = dueDateInMonth(ym, day);
        return d ? d.toISOString().slice(0, 10) : '';
      })();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) {
      const schedule = buildEqualInstallmentSchedule(expected, inst, dueYmd);
      const enriched = enrichInstallmentScheduleWithAcquirerFees(
        schedule,
        method,
        inst,
        resolveAcquirerFeesForPayment(financeConfig, {
          bankAccount: String(data.account || '').trim(),
          method,
        }),
        resolveCreditDaysFromSettings(financeConfig, method)
      );
      if (enriched.length) {
        payload.installment_schedule_json = JSON.stringify(enriched).slice(0, 4096);
      }
    }
  }
  if (data.installment_schedule_json) {
    payload.installment_schedule_json = String(data.installment_schedule_json).slice(0, 4096);
  }

  return payload;
}

function preserveExistingLaunchAmounts(prev, payload, source = null) {
  if (!prev || !isGridPayment(prev)) return payload;
  const next = { ...payload };
  const hasExplicitAmount = hasExplicitMonetaryField(source, 'amount');
  const hasExplicitExpected = hasExplicitMonetaryField(source, 'expected_amount');
  const prevAmount = Number(prev.amount);
  if (!hasExplicitAmount && Number.isFinite(prevAmount) && prevAmount >= 0) {
    next.amount = prevAmount;
  }
  const prevExpected = Number(prev.expected_amount);
  if (!hasExplicitExpected && Number.isFinite(prevExpected) && prevExpected >= 0) {
    next.expected_amount = prevExpected;
  }
  return next;
}

async function findPaymentForMonthUpsert(leadId, referenceMonth, paymentCategory) {
  const ym = String(referenceMonth || '').trim();
  if (!ym || !shouldUpsertByReferenceMonth(paymentCategory)) return null;
  const list = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('lead_id', leadId),
    Query.equal('reference_month', ym),
    Query.limit(25),
  ]);
  for (const doc of list.documents || []) {
    if (isGridPayment(doc)) return doc;
  }
  return null;
}

/** Desvincula mês de pacote quando vira lançamento avulso (plan/fee/other). */
function detachBundleLinkageOnUpsert(prev, payload) {
  const next = { ...payload };
  const nextCat = normalizePaymentCategory(next);
  if (nextCat === PAYMENT_CATEGORY.BUNDLE) return next;
  if (isBundleChildPayment(prev) || (prev?.bundle_origin_id && !isBundleAnchorPayment(prev))) {
    next.bundle_origin_id = null;
  }
  if (nextCat !== PAYMENT_CATEGORY.BUNDLE && next.bundle_months != null) {
    delete next.bundle_months;
  }
  return next;
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
    return json(res, 500, { ok: false, erro: apiErro(e, 'action') });
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

    await repairBundleCoverageForMonth({
      databases,
      dbId: DB_ID,
      paymentsCol: PAYMENTS_COL,
      academyId,
      referenceMonth: ym,
    });

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
    return json(res, 500, { ok: false, erro: apiErro(e, 'load') });
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
    validatePaymentMethodsForCreate(financeConfig, body);
    const category = normalizePaymentCategory(body.payment_category);
    const bundleMonths = Number(body.bundle_months);

    if (category === PAYMENT_CATEGORY.BUNDLE && bundleMonths >= 1) {
      const dateKey = paymentDuplicateDateKey({
        paid_at: body.paid_at,
        reference_month: body.coverage_start_month || body.reference_month,
      });
      const dup = await findDuplicatePayment({
        leadId,
        academyId,
        amount: Number(body.amount),
        dateKey,
        referenceMonth: body.coverage_start_month || body.reference_month,
      });
      if (dup && isBundleAnchorPayment(dup)) {
        return json(res, 409, { ok: false, erro: DUPLICATE_PAYMENT_MSG });
      }

      const bundleResult = await createBundlePaymentServer({
        databases,
        dbId: DB_ID,
        paymentsCol: PAYMENTS_COL,
        data: { ...body, lead_id: leadId, academy_id: academyId },
        mirrorAnchorFn: async (anchorDoc, mirrorData) => {
          const payload = buildPayload(
            { ...body, lead_id: leadId, academy_id: academyId, ...mirrorData },
            financeConfig,
            studentDoc
          );
          await maybeMirrorPaymentToCaixa(anchorDoc, payload, financeConfig, studentDoc);
        },
      });

      let doc = bundleResult.anchor;
      await recordFinancialAudit({
        action: 'payment_create',
        payment_id: doc.$id,
        student_id: leadId,
        academy_id: academyId,
        user_id: me.$id,
        amount: Number(doc.amount),
        previous_status: '',
        new_status: doc.status,
      });

      await maybeSyncOverdueAfterSettlement(
        studentDoc,
        academyId,
        leadId,
        financeConfig,
        doc.status,
        academyDoc
      );

      try {
        doc = await databases.getDocument(DB_ID, PAYMENTS_COL, doc.$id);
      } catch {
        void 0;
      }

      notifyFinanceHubDataChanged(academyId);
      return json(res, 200, {
        ok: true,
        payment: doc,
        bundle_months_created: bundleResult.monthsCreated,
        bundle_months_skipped: bundleResult.monthsSkipped,
      });
    }

    const payload = buildPayload({ ...body, lead_id: leadId, academy_id: academyId }, financeConfig, studentDoc);

    let doc;
    const prev = await findPaymentForMonthUpsert(
      leadId,
      payload.reference_month,
      payload.payment_category
    );
    if (prev) {
      const nextPayload = detachBundleLinkageOnUpsert(
        prev,
        preserveExistingLaunchAmounts(prev, payload, body)
      );
      doc = await writePaymentDocument(
        (p) => databases.updateDocument(DB_ID, PAYMENTS_COL, prev.$id, p),
        nextPayload
      );
      await recordFinancialAudit({
        action: 'payment_update',
        payment_id: prev.$id,
        student_id: leadId,
        academy_id: academyId,
        user_id: me.$id,
        amount: nextPayload.amount,
        previous_status: prev.status,
        new_status: nextPayload.status,
      });
    } else {
      const dateKey = paymentDuplicateDateKey(payload);
      const dup = await findDuplicatePayment({
        leadId,
        academyId,
        amount: payload.amount,
        dateKey,
        referenceMonth: payload.reference_month,
      });
      if (dup) {
        return json(res, 409, { ok: false, erro: DUPLICATE_PAYMENT_MSG });
      }
      doc = await writePaymentDocument(
        (p) =>
          databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), p, [
            Permission.read(Role.users()),
            Permission.update(Role.users()),
          ]),
        payload
      );
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
      doc.status,
      academyDoc
    );

    try {
      doc = await databases.getDocument(DB_ID, PAYMENTS_COL, doc.$id);
    } catch {
      void 0;
    }

    notifyFinanceHubDataChanged(academyId);
    return json(res, 200, {
      ok: true,
      payment: doc,
      mirror_warning: mirrorResult?.warning || null,
    });
  } catch (e) {
    if (e.code === 'FORBIDDEN') return json(res, 403, { ok: false, erro: 'Acesso negado' });
    console.error('[student-payments POST]', e?.message || e);
    return json(res, 400, { ok: false, erro: apiErro(e, 'save') });
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
    if (!isReverse && body.method != null) {
      validatePaymentMethodChange(financeConfig, body.method, prev.method);
    }
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
      referenceMonth: patch.reference_month,
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

    let mirrorResult = null;
    if (isReverse) {
      const txId = String(prev.financial_tx_id || doc.financial_tx_id || '').trim();
      if (txId && FINANCIAL_TX_COL) {
        try {
          const txDoc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, txId);
          const txStatus = String(txDoc.status || '').toLowerCase();
          if (txStatus === 'settled') {
            await reverseSettledFinanceTx({
              prevDoc: txDoc,
              academyId,
              me,
              reason: 'Estorno mensalidade',
            });
          } else {
            const cancelResult = await cancelFinancialTxMirrorsForPayment(paymentId, {
              explicitTxId: txId,
            });
            if (cancelResult.errors?.length) {
              console.warn(
                '[student-payments PATCH reverse] mirror cancel:',
                paymentId,
                cancelResult.errors
              );
            }
          }
        } catch (e) {
          console.warn('[student-payments PATCH reverse] financial_tx:', paymentId, e?.message || e);
          const cancelResult = await cancelFinancialTxMirrorsForPayment(paymentId, {
            explicitTxId: txId,
          });
          if (cancelResult.errors?.length) {
            console.warn(
              '[student-payments PATCH reverse] mirror cancel fallback:',
              paymentId,
              cancelResult.errors
            );
          }
        }
      } else {
        const cancelResult = await cancelFinancialTxMirrorsForPayment(paymentId, {
          explicitTxId: txId,
        });
        if (cancelResult.errors?.length) {
          console.warn(
            '[student-payments PATCH reverse] mirror cancel:',
            paymentId,
            cancelResult.errors
          );
        }
      }
    } else {
      mirrorResult = await maybeMirrorPaymentToCaixa(doc, patch, financeConfig, studentDoc);
    }

    await maybeSyncOverdueAfterSettlement(
      studentDoc,
      academyId,
      String(prev.lead_id || ''),
      financeConfig,
      doc.status,
      academyDoc
    );

    try {
      doc = await databases.getDocument(DB_ID, PAYMENTS_COL, doc.$id);
    } catch {
      void 0;
    }

    notifyFinanceHubDataChanged(academyId);
    return json(res, 200, {
      ok: true,
      payment: doc,
      mirror_warning: mirrorResult?.warning || null,
    });
  } catch (e) {
    console.error('[student-payments PATCH]', paymentId, e?.message || e);
    return json(res, 500, { ok: false, erro: apiErro(e, 'save') });
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
    const cancelResult = await cancelFinancialTxMirrorsForPayment(paymentId, { explicitTxId: txId });
    if (cancelResult.errors?.length) {
      console.warn('[student-payments DELETE] mirror cancel:', paymentId, cancelResult.errors);
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

    notifyFinanceHubDataChanged(academyId);
    return json(res, 200, { ok: true, deleted: true });
  } catch (e) {
    console.error('[student-payments DELETE]', paymentId, e?.message || e);
    return json(res, 500, { ok: false, erro: apiErro(e, 'delete') });
  }
}

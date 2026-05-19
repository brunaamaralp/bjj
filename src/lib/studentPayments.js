import { Query, ID } from 'appwrite';
import { databases, DB_ID, FINANCIAL_TX_COL } from './appwrite.js';
import { buildClientDocumentPermissions } from './clientDocumentPermissions.js';
import { mirrorGrossForPayment, shouldMirrorPaymentToCaixa } from './paymentStatus.js';
import {
  PAYMENT_CATEGORY,
  normalizePaymentCategory,
  isMensalidadesGridPayment,
  shouldUpsertByReferenceMonth,
  enumerateCoverageMonths,
} from './paymentCategories.js';
import {
  buildCoverageMonthSpecs,
  resolveBundleMonthAction,
  listCancellableCoveredMonths,
} from './bundleCoverage.js';

const PAYMENTS_COL = import.meta.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID || '';

/** Só grava `financial_tx_id` no documento de mensalidade se a coleção Appwrite tiver esse atributo (string) e esta env estiver true/1. */
const WRITE_FINANCIAL_TX_REF_ON_PAYMENT = ['true', '1', 'yes'].includes(
  String(import.meta.env.VITE_STUDENT_PAYMENT_WRITE_FINANCIAL_TX_REF || '').trim().toLowerCase()
);

const OPTIONAL_ATTRS = [
  'paid_amount',
  'expected_amount',
  'payment_category',
  'bundle_months',
  'bundle_origin_id',
];

function buildPaymentPayload(data) {
  const status = String(data.status || 'pending').toLowerCase();
  const expected = Number(data.expected_amount);
  const paidAmt = Number(data.paid_amount);
  const amountLegacy = Number(data.amount);
  const category = normalizePaymentCategory(data.payment_category);

  let amount = amountLegacy;
  if (status === 'partial') {
    amount = Number.isFinite(paidAmt) ? paidAmt : amountLegacy;
  } else if (status === 'paid') {
    amount = Number.isFinite(paidAmt) && paidAmt > 0 ? paidAmt : amountLegacy;
  } else if (status === 'covered') {
    amount = Number.isFinite(amountLegacy) ? amountLegacy : 0;
  }

  const payload = {
    lead_id: data.lead_id,
    academy_id: data.academy_id,
    amount: Number.isFinite(amount) ? amount : 0,
    method: data.method || 'pix',
    account: data.account ?? '',
    plan_name: data.plan_name ?? '',
    status,
    reference_month: data.reference_month ?? null,
    due_date: data.due_date ?? null,
    paid_at: data.paid_at ?? null,
    registered_by: data.registered_by ?? '',
    registered_by_name: data.registered_by_name ?? '',
    note: data.note ?? '',
    payment_category: category,
  };

  if (Number.isFinite(expected) && expected >= 0) {
    payload.expected_amount = expected;
  }
  if (status === 'partial' || status === 'paid') {
    if (Number.isFinite(paidAmt) && paidAmt >= 0) {
      payload.paid_amount = paidAmt;
    } else if (Number.isFinite(amount) && amount >= 0) {
      payload.paid_amount = amount;
    }
  }

  const bundleMonths = Number(data.bundle_months);
  if (category === PAYMENT_CATEGORY.BUNDLE && Number.isFinite(bundleMonths) && bundleMonths > 0) {
    payload.bundle_months = bundleMonths;
  }
  if (data.bundle_origin_id != null && String(data.bundle_origin_id).trim()) {
    payload.bundle_origin_id = String(data.bundle_origin_id).trim();
  }

  return payload;
}

async function writePaymentDocument(writeFn, payload) {
  let current = { ...payload };
  for (let attempt = 0; attempt < OPTIONAL_ATTRS.length + 1; attempt += 1) {
    try {
      return await writeFn(current);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('Unknown attribute')) throw e;
      const next = { ...current };
      let stripped = false;
      for (const key of OPTIONAL_ATTRS) {
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

async function syncFinancialTxMirror({
  paymentDoc,
  data,
  permissions,
  existingTxId,
  skipMirror = false,
}) {
  if (skipMirror || !FINANCIAL_TX_COL) return null;

  const status = String(data.status || '').toLowerCase();
  const expected = Number(data.expected_amount);
  const paidAmt = Number(data.paid_amount ?? data.amount);
  const refMonth = data.reference_month ? String(data.reference_month) : '';
  const note =
    String(data.note || '').trim() ||
    (refMonth ? `Mensalidade ${refMonth}` : 'Pagamento');
  const txId = String(existingTxId || paymentDoc?.financial_tx_id || '').trim();

  if (!shouldMirrorPaymentToCaixa(status)) {
    if (txId) {
      try {
        await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, {
          status: 'cancelled',
        });
      } catch (err) {
        console.error('financial_tx cancel on awaiting failed:', err);
      }
    }
    return null;
  }

  const gross = mirrorGrossForPayment(status, paidAmt, expected);
  if (!Number.isFinite(gross) || gross <= 0) return txId || null;

  const mirrorPayload = {
    academyId: data.academy_id,
    saleId: '',
    lead_id: data.lead_id,
    method: data.method || 'pix',
    installments: 1,
    type: 'plan',
    planName: data.plan_name || data.note || '',
    gross,
    fee: 0,
    net: gross,
    status: 'settled',
    settledAt: data.paid_at || new Date().toISOString(),
    note,
  };

  try {
    if (txId) {
      const updated = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, mirrorPayload);
      return updated.$id;
    }
    const mirror = permissions
      ? await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), mirrorPayload, permissions)
      : await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), mirrorPayload);
    return mirror.$id;
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg.includes('Unknown attribute')) {
      delete mirrorPayload.lead_id;
      if (txId) {
        const updated = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, mirrorPayload);
        return updated.$id;
      }
      const mirror = permissions
        ? await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), mirrorPayload, permissions)
        : await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), mirrorPayload);
      return mirror.$id;
    }
    console.error('financial_tx mirror failed:', err);
    return null;
  }
}

async function attachFinancialTxRef(paymentId, mirrorId) {
  if (!mirrorId || !WRITE_FINANCIAL_TX_REF_ON_PAYMENT || !paymentId) return;
  try {
    await databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, { financial_tx_id: mirrorId });
  } catch (err) {
    console.error('financial_tx_id update failed:', err);
  }
}

function buildPermissions(data) {
  const teamId = String(data.team_id ?? '').trim();
  const userId = String(data.registered_by ?? '').trim();
  return teamId || userId
    ? buildClientDocumentPermissions({ teamId, userId })
    : null;
}

/**
 * Busca pagamento existente para upsert (plan/bundle no mesmo mês).
 */
export async function findPaymentForMonthUpsert(leadId, referenceMonth, paymentCategory = PAYMENT_CATEGORY.PLAN) {
  if (!PAYMENTS_COL || !leadId || !referenceMonth) return null;
  if (!shouldUpsertByReferenceMonth(paymentCategory)) return null;

  const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('lead_id', leadId),
    Query.equal('reference_month', referenceMonth),
    Query.limit(25),
  ]);

  for (const doc of res.documents || []) {
    if (isMensalidadesGridPayment(doc)) return doc;
  }
  return null;
}

async function persistPaymentDocument({ data, existingId, permissions, skipMirror }) {
  const payload = buildPaymentPayload(data);
  const mergedData = { ...data, ...payload };

  let doc;
  if (existingId) {
    doc = await writePaymentDocument(
      (p) => databases.updateDocument(DB_ID, PAYMENTS_COL, existingId, p),
      payload
    );
  } else {
    doc = await writePaymentDocument(
      (p) =>
        permissions
          ? databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), p, permissions)
          : databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), p),
      payload
    );
  }

  const mirrorId = await syncFinancialTxMirror({
    paymentDoc: doc,
    data: mergedData,
    permissions,
    existingTxId: data.financial_tx_id || doc.financial_tx_id,
    skipMirror,
  });
  if (mirrorId) await attachFinancialTxRef(doc.$id, mirrorId);

  return mirrorId ? { ...doc, financial_tx_id: mirrorId } : doc;
}

/**
 * Plano com cobertura: âncora (paid + valor total + Caixa) + meses covered.
 */
export async function createBundlePayment(data) {
  if (!PAYMENTS_COL) {
    throw new Error('student_payments_collection_not_configured');
  }

  const bundleMonths = Number(data.bundle_months);
  const startYm = String(data.coverage_start_month || data.reference_month || '').trim();
  if (!bundleMonths || bundleMonths < 1 || !/^\d{4}-\d{2}$/.test(startYm)) {
    throw new Error('bundle_coverage_invalid');
  }

  const totalAmount = Number(data.amount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('bundle_amount_invalid');
  }

  const permissions = buildPermissions(data);
  const base = {
    lead_id: data.lead_id,
    academy_id: data.academy_id,
    team_id: data.team_id,
    method: data.method,
    account: data.account,
    plan_name: data.plan_name,
    paid_at: data.paid_at,
    registered_by: data.registered_by,
    registered_by_name: data.registered_by_name,
    note: data.note,
    status: data.status || 'paid',
  };

  const specs = buildCoverageMonthSpecs({
    startYm,
    bundleMonths,
    totalAmount,
    base,
  });

  let anchorId = null;
  let anchor = null;
  let monthsCreated = 0;
  let monthsSkipped = 0;

  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const existing = await findPaymentForMonthUpsert(
      data.lead_id,
      spec.reference_month,
      PAYMENT_CATEGORY.BUNDLE
    );
    const action = resolveBundleMonthAction(existing);

    if (action === 'skip') {
      monthsSkipped += 1;
      if (i === 0 && existing?.$id) {
        anchorId = existing.$id;
        anchor = existing;
      }
      continue;
    }

    const doc = await persistPaymentDocument({
      data: {
        ...spec,
        bundle_origin_id: i === 0 ? undefined : anchorId,
        bundle_months: i === 0 ? bundleMonths : null,
        financial_tx_id: i === 0 ? data.financial_tx_id || existing?.financial_tx_id : undefined,
      },
      existingId: action === 'upsert' ? existing?.$id : null,
      permissions,
      skipMirror: i !== 0,
    });

    monthsCreated += 1;

    if (i === 0) {
      anchor = doc;
      anchorId = doc.$id;
      if (String(doc.bundle_origin_id || '') !== anchorId) {
        try {
          anchor = await databases.updateDocument(DB_ID, PAYMENTS_COL, anchorId, {
            bundle_origin_id: anchorId,
          });
        } catch (e) {
          const msg = String(e?.message || '');
          if (!msg.includes('Unknown attribute')) throw e;
        }
      }
    }
  }

  if (!anchorId) {
    throw new Error('bundle_anchor_not_created');
  }

  return {
    anchor: anchor || { $id: anchorId },
    monthsCreated,
    monthsSkipped,
    coverageMonths: enumerateCoverageMonths(startYm, bundleMonths),
  };
}

/**
 * Cancela meses futuros cobertos a partir de um mês (inclusive).
 * @param {{ refundAmount?: number, method?: string, note?: string }} opts
 */
export async function cancelBundleCoverageFromMonth({
  lead_id,
  academy_id,
  anchor_id,
  from_reference_month,
  payments = [],
  registered_by,
  registered_by_name,
  refundAmount = 0,
  method = 'pix',
  note = '',
}) {
  if (!PAYMENTS_COL || !lead_id || !anchor_id || !from_reference_month) {
    throw new Error('cancel_bundle_invalid');
  }

  const toCancel = listCancellableCoveredMonths(anchor_id, payments, from_reference_month);
  const cancelled = [];

  for (const doc of toCancel) {
    const updated = await databases.updateDocument(DB_ID, PAYMENTS_COL, doc.$id, {
      status: 'cancelled',
    });
    cancelled.push(updated);
  }

  let refundTxId = null;
  const refund = Number(refundAmount);
  if (FINANCIAL_TX_COL && Number.isFinite(refund) && refund > 0) {
    const permissions = buildPermissions({ registered_by, team_id: '' });
    const mirrorPayload = {
      academyId: academy_id,
      saleId: '',
      lead_id,
      method: method || 'pix',
      installments: 1,
      type: 'expense',
      planName: note || `Estorno cobertura — ${from_reference_month}`,
      gross: refund,
      fee: 0,
      net: refund,
      status: 'settled',
      settledAt: new Date().toISOString(),
      note: note || `Estorno parcial plano com cobertura`,
    };
    try {
      const tx = permissions
        ? await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), mirrorPayload, permissions)
        : await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), mirrorPayload);
      refundTxId = tx.$id;
    } catch (e) {
      console.error('bundle refund mirror failed:', e);
    }
  }

  return { cancelled, refundTxId };
}

export async function getStudentPayments(leadId, academyId, limit = 120) {
  if (!PAYMENTS_COL || !leadId || !academyId) return [];
  const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('lead_id', leadId),
    Query.equal('academy_id', academyId),
    Query.orderDesc('reference_month'),
    Query.limit(limit),
  ]);
  return res.documents;
}

/**
 * Lista pagamentos do mês para a grade de Mensalidades (exclui taxa/outro).
 */
export async function getMonthlyPayments(academyId, referenceMonth) {
  const ym = String(referenceMonth || '').trim();
  if (!PAYMENTS_COL || !academyId || !ym) return [];

  const PAGE_SIZE = 100;
  let allDocs = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const queries = [
      Query.equal('academy_id', academyId),
      Query.equal('reference_month', ym),
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_SIZE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, queries);
    const batch = res.documents || [];
    allDocs = [...allDocs, ...batch];

    if (batch.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      cursor = batch[batch.length - 1].$id;
    }
  }

  return allDocs.filter(isMensalidadesGridPayment);
}

/**
 * Cria ou atualiza documento de pagamento (sem espelhar Caixa quando skipMirror).
 */
export async function upsertStudentPayment({ data, existingId = null, skipMirror = false }) {
  if (!PAYMENTS_COL) {
    throw new Error('student_payments_collection_not_configured');
  }
  const permissions = buildPermissions(data);
  return persistPaymentDocument({
    data,
    existingId,
    permissions,
    skipMirror,
  });
}

export async function createPayment(data) {
  if (!PAYMENTS_COL) {
    throw new Error('student_payments_collection_not_configured');
  }
  if (!data.lead_id || !data.academy_id) {
    throw new Error('lead_id e academy_id são obrigatórios');
  }

  const category = normalizePaymentCategory(data.payment_category);

  if (category === PAYMENT_CATEGORY.BUNDLE && data.bundle_months) {
    const result = await createBundlePayment(data);
    return result.anchor;
  }

  const permissions = buildPermissions(data);

  if (category === PAYMENT_CATEGORY.FEE || category === PAYMENT_CATEGORY.OTHER) {
    const feePayload = {
      ...data,
      payment_category: category,
      reference_month: data.reference_month ?? null,
    };
    return persistPaymentDocument({
      data: feePayload,
      existingId: null,
      permissions,
      skipMirror: false,
    });
  }

  if (!data.reference_month) {
    throw new Error('reference_month_required');
  }

  const existing = await findPaymentForMonthUpsert(
    data.lead_id,
    data.reference_month,
    category
  );

  return persistPaymentDocument({
    data: { ...data, payment_category: category },
    existingId: existing?.$id,
    permissions,
    skipMirror: false,
  });
}

export async function updatePayment(paymentId, data) {
  if (!PAYMENTS_COL) {
    throw new Error('student_payments_collection_not_configured');
  }
  return databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, data);
}

/**
 * Cria ou atualiza pagamento do mês (grade / fluxo unificado).
 */
export async function saveMonthlyPayment({
  paymentId,
  lead_id,
  academy_id,
  team_id,
  reference_month,
  status,
  paid_amount,
  expected_amount,
  paid_at,
  due_date,
  method,
  account,
  plan_name,
  note,
  registered_by,
  registered_by_name,
  financial_tx_id,
  payment_category,
}) {
  const data = {
    lead_id,
    academy_id,
    team_id,
    reference_month,
    status,
    paid_amount,
    expected_amount,
    amount: paid_amount,
    paid_at,
    due_date,
    method,
    account,
    plan_name,
    note,
    registered_by,
    registered_by_name,
    payment_category: payment_category || PAYMENT_CATEGORY.PLAN,
    financial_tx_id,
  };

  if (paymentId) {
    const permissions = buildPermissions(data);
    return persistPaymentDocument({
      data,
      existingId: paymentId,
      permissions,
      skipMirror: false,
    });
  }

  return createPayment(data);
}

export async function getPaymentStatus(leadId, academyId) {
  if (!PAYMENTS_COL || !leadId || !academyId) {
    return { status: 'none', payment: null };
  }
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('lead_id', leadId),
    Query.equal('academy_id', academyId),
    Query.equal('reference_month', currentMonth),
    Query.limit(25),
  ]);
  const doc =
    (res.documents || []).find(isMensalidadesGridPayment) || null;
  if (!doc) return { status: 'none', payment: null };
  const st = String(doc.status || '').toLowerCase();
  if (st === 'paid' || st === 'covered') return { status: 'paid', payment: doc };
  if (st === 'awaiting') return { status: 'awaiting', payment: doc };
  if (st === 'partial') return { status: 'partial', payment: doc };
  return { status: 'pending', payment: doc };
}

export { PAYMENT_CATEGORY, normalizePaymentCategory, isMensalidadesGridPayment };

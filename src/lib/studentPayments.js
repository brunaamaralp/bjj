import { Query, ID } from 'appwrite';
import { databases, DB_ID, FINANCIAL_TX_COL } from './appwrite.js';
import { buildClientDocumentPermissions } from './clientDocumentPermissions.js';
import { mirrorGrossForPayment, shouldMirrorPaymentToCaixa } from './paymentStatus.js';

const PAYMENTS_COL = import.meta.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID || '';

/** Só grava `financial_tx_id` no documento de mensalidade se a coleção Appwrite tiver esse atributo (string) e esta env estiver true/1. */
const WRITE_FINANCIAL_TX_REF_ON_PAYMENT = ['true', '1', 'yes'].includes(
  String(import.meta.env.VITE_STUDENT_PAYMENT_WRITE_FINANCIAL_TX_REF || '').trim().toLowerCase()
);

function buildPaymentPayload(data) {
  const status = String(data.status || 'pending').toLowerCase();
  const expected = Number(data.expected_amount);
  const paidAmt = Number(data.paid_amount);
  const amountLegacy = Number(data.amount);

  let amount = amountLegacy;
  if (status === 'partial') {
    amount = Number.isFinite(paidAmt) ? paidAmt : amountLegacy;
  } else if (status === 'paid') {
    amount = Number.isFinite(paidAmt) && paidAmt > 0 ? paidAmt : amountLegacy;
  }

  const payload = {
    lead_id: data.lead_id,
    academy_id: data.academy_id,
    amount: Number.isFinite(amount) ? amount : 0,
    method: data.method || 'pix',
    account: data.account ?? '',
    plan_name: data.plan_name ?? '',
    status,
    reference_month: data.reference_month,
    due_date: data.due_date ?? null,
    paid_at: data.paid_at ?? null,
    registered_by: data.registered_by ?? '',
    registered_by_name: data.registered_by_name ?? '',
    note: data.note ?? '',
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

  return payload;
}

async function writePaymentDocument(createFn, payload, permissions) {
  try {
    return await createFn(payload);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown attribute')) {
      const slim = { ...payload };
      delete slim.paid_amount;
      delete slim.expected_amount;
      return await createFn(slim);
    }
    throw e;
  }
}

async function syncFinancialTxMirror({
  paymentDoc,
  data,
  permissions,
  existingTxId,
}) {
  if (!FINANCIAL_TX_COL) return null;

  const status = String(data.status || '').toLowerCase();
  const expected = Number(data.expected_amount);
  const paidAmt = Number(data.paid_amount ?? data.amount);
  const note = String(data.note || '').trim() || `Mensalidade ${data.reference_month}`;
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
    planName: data.plan_name || '',
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

async function attachFinancialTxRef(paymentId, mirrorId, permissions) {
  if (!mirrorId || !WRITE_FINANCIAL_TX_REF_ON_PAYMENT || !paymentId) return;
  try {
    await databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, { financial_tx_id: mirrorId });
  } catch (err) {
    console.error('financial_tx_id update failed:', err);
  }
}

export async function getStudentPayments(leadId, academyId) {
  if (!PAYMENTS_COL || !leadId || !academyId) return [];
  const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('lead_id', leadId),
    Query.equal('academy_id', academyId),
    Query.orderDesc('reference_month'),
    Query.limit(24),
  ]);
  return res.documents;
}

/**
 * Lista pagamentos de todos os alunos da academia em um mês (YYYY-MM).
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

  return allDocs;
}

export async function createPayment(data) {
  if (!PAYMENTS_COL) {
    throw new Error('student_payments_collection_not_configured');
  }
  if (!data.lead_id || !data.academy_id) {
    throw new Error('lead_id e academy_id são obrigatórios');
  }

  const payload = buildPaymentPayload(data);
  const teamId = String(data.team_id ?? '').trim();
  const userId = String(data.registered_by ?? '').trim();
  const permissions =
    teamId || userId
      ? buildClientDocumentPermissions({
          teamId,
          userId,
        })
      : null;

  const doc = await writePaymentDocument(
    (p) =>
      permissions
        ? databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), p, permissions)
        : databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), p),
    payload,
    permissions
  );

  const mirrorId = await syncFinancialTxMirror({ paymentDoc: doc, data: { ...data, ...payload }, permissions });
  if (mirrorId) await attachFinancialTxRef(doc.$id, mirrorId);

  return doc;
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
  };

  const teamId = String(team_id ?? '').trim();
  const userId = String(registered_by ?? '').trim();
  const permissions =
    teamId || userId
      ? buildClientDocumentPermissions({ teamId, userId })
      : null;

  if (paymentId) {
    const patch = buildPaymentPayload(data);
    const doc = await writePaymentDocument(
      (p) => databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, p),
      patch
    );
    const mirrorId = await syncFinancialTxMirror({
      paymentDoc: doc,
      data: { ...data, ...patch },
      permissions,
      existingTxId: financial_tx_id || doc.financial_tx_id,
    });
    if (mirrorId && mirrorId !== String(doc.financial_tx_id || '')) {
      await attachFinancialTxRef(doc.$id, mirrorId);
      return { ...doc, financial_tx_id: mirrorId };
    }
    return doc;
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
    Query.limit(1),
  ]);
  const doc = res.documents[0] || null;
  if (!doc) return { status: 'none', payment: null };
  const st = String(doc.status || '').toLowerCase();
  if (st === 'paid') return { status: 'paid', payment: doc };
  if (st === 'awaiting') return { status: 'awaiting', payment: doc };
  if (st === 'partial') return { status: 'partial', payment: doc };
  return { status: 'pending', payment: doc };
}

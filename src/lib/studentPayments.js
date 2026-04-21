import { Query, ID } from 'appwrite';
import { databases, DB_ID, FINANCIAL_TX_COL } from './appwrite.js';

const PAYMENTS_COL = import.meta.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID || '';

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

export async function createPayment(data) {
  if (!PAYMENTS_COL) {
    throw new Error('student_payments_collection_not_configured');
  }
  const payload = {
    lead_id: data.lead_id,
    academy_id: data.academy_id,
    amount: data.amount,
    method: data.method,
    account: data.account ?? '',
    plan_name: data.plan_name ?? '',
    status: data.status,
    reference_month: data.reference_month,
    due_date: data.due_date ?? null,
    paid_at: data.paid_at ?? null,
    registered_by: data.registered_by ?? '',
    registered_by_name: data.registered_by_name ?? '',
    note: data.note ?? '',
  };
  const doc = await databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), payload);

  if (FINANCIAL_TX_COL) {
    databases
      .createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), {
        academyId: data.academy_id,
        saleId: '',
        lead_id: data.lead_id,
        method: data.method,
        installments: 1,
        type: 'plan',
        planName: data.plan_name || '',
        gross: data.amount,
        fee: 0,
        net: data.amount,
        status: data.status === 'paid' ? 'settled' : 'pending',
        settledAt: data.status === 'paid' ? data.paid_at || new Date().toISOString() : '',
        note: data.note || `Mensalidade ${data.reference_month}`,
      })
      .catch((err) => console.error('financial_tx mirror failed:', err));
  }

  return doc;
}

export async function updatePayment(paymentId, data) {
  if (!PAYMENTS_COL) {
    throw new Error('student_payments_collection_not_configured');
  }
  return databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, data);
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
  if (doc.status === 'paid') return { status: 'paid', payment: doc };
  return { status: 'pending', payment: doc };
}

import { Query, ID } from 'appwrite';
import { databases, DB_ID, FINANCIAL_TX_COL } from './appwrite.js';
import { buildClientDocumentPermissions } from './clientDocumentPermissions.js';
import { useLeadStore } from '../store/useLeadStore.js';

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

/**
 * Lista pagamentos de todos os alunos da academia em um mês (YYYY-MM).
 * Requer permissão de leitura na coleção filtrando por `academy_id` (não só por `lead_id`).
 * Pagina com cursor até trazer todos os documentos (mesmo padrão de useLeadStore / api/leads).
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
  const { leads } = useLeadStore.getState();
  const leadExists = Array.isArray(leads) && leads.some((l) => l.id === data.lead_id);
  if (!leadExists) {
    console.error('createPayment: lead_id não encontrado', data.lead_id);
    throw new Error('Lead não encontrado nesta academia');
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
  const permissions = buildClientDocumentPermissions({
    teamId: data.team_id ?? '',
    userId: data.registered_by ?? '',
  });
  const doc = await databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), payload, permissions);

  if (FINANCIAL_TX_COL) {
    try {
      const mirror = await databases.createDocument(
        DB_ID,
        FINANCIAL_TX_COL,
        ID.unique(),
        {
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
        },
        permissions
      );
      const mirrorId = String(mirror?.$id || '').trim();
      if (mirrorId) {
        databases
          .updateDocument(DB_ID, PAYMENTS_COL, doc.$id, { financial_tx_id: mirrorId })
          .catch((err) => console.error('financial_tx_id update failed:', err));
      }
    } catch (err) {
      console.error('financial_tx mirror failed:', err);
    }
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

import { databases, DB_ID, FINANCIAL_TX_COL } from './appwrite';
import { ID } from 'appwrite';

const STUDENT_PAYMENTS_COL = String(import.meta.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID || '').trim();

/**
 * Registra pagamento do aluno e espelha em FINANCIAL_TX (fire-and-forget).
 * @param {object} data
 * @param {string} data.academy_id
 * @param {string} [data.lead_id]
 * @param {string} [data.method]
 * @param {string} [data.plan_name]
 * @param {number} data.amount
 * @param {string} [data.status] — ex.: 'paid' | 'pending'
 * @param {string} [data.paid_at]
 * @param {string} [data.note]
 * @param {string} [data.reference_month]
 */
export async function createPayment(data) {
  if (!STUDENT_PAYMENTS_COL) {
    throw new Error('student_payments_collection_not_configured');
  }
  const doc = await databases.createDocument(DB_ID, STUDENT_PAYMENTS_COL, ID.unique(), {
    academy_id: data.academy_id,
    lead_id: data.lead_id || '',
    method: data.method || 'pix',
    plan_name: data.plan_name || '',
    amount: Number(data.amount) || 0,
    status: data.status || 'pending',
    paid_at: data.paid_at || '',
    note: data.note || '',
    reference_month: data.reference_month || '',
  });

  if (FINANCIAL_TX_COL) {
    const settled = data.status === 'paid';
    const settledAt = settled ? (data.paid_at || new Date().toISOString()) : '';
    databases
      .createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), {
        academyId: data.academy_id,
        saleId: '',
        lead_id: data.lead_id || '',
        method: data.method || 'pix',
        installments: 1,
        type: 'plan',
        planName: data.plan_name || '',
        gross: Number(data.amount) || 0,
        fee: 0,
        net: Number(data.amount) || 0,
        status: settled ? 'settled' : 'pending',
        settledAt,
        note: data.note || `Mensalidade ${data.reference_month || ''}`.trim(),
      })
      .catch((err) => console.error('financial_tx mirror failed:', err));
  }

  return doc;
}

/**
 * Busca student_payments da grade (plan/bundle) por aluno + mês.
 */
import { Query } from 'node-appwrite';
import { PAYMENT_CATEGORY, normalizePaymentCategory } from '../../src/lib/paymentCategories.js';

function studentPaymentsCol() {
  return (
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
    process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
    ''
  );
}

function isGridPayment(doc) {
  const cat = normalizePaymentCategory(doc);
  return cat === PAYMENT_CATEGORY.PLAN || cat === PAYMENT_CATEGORY.BUNDLE;
}

export async function findStudentPaymentForMonth(databases, dbId, { studentId, academyId, referenceMonth }) {
  if (!studentPaymentsCol() || !studentId || !academyId || !referenceMonth) return null;
  const res = await databases.listDocuments(dbId, studentPaymentsCol(), [
    Query.equal('lead_id', studentId),
    Query.equal('academy_id', academyId),
    Query.equal('reference_month', referenceMonth),
    Query.limit(25),
  ]);
  for (const doc of res.documents || []) {
    if (isGridPayment(doc)) return doc;
  }
  return null;
}

/**
 * Persistência de overdue / overdue_label no documento do aluno (students).
 * Ortogonal a student_status (active/inactive).
 */
import { Query } from 'node-appwrite';
import { parseOverdueLabel, DEFAULT_OVERDUE_LABEL } from '../../src/lib/collectionRules.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

const SETTLED_PAYMENT_STATUSES = new Set(['paid', 'covered', 'frozen', 'cancelled', 'awaiting']);

export function resolveOverdueLabelFromFinanceConfig(financeConfig) {
  return parseOverdueLabel(
    financeConfig?.overdueLabel ?? financeConfig?.overdue_label ?? DEFAULT_OVERDUE_LABEL
  );
}

export function todayYmdUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** Pagamento em aberto com vencimento civil anterior a hoje. */
export function isOpenOverduePayment(payment, todayYmd = todayYmdUtc()) {
  const st = String(payment?.status || '').toLowerCase();
  if (SETTLED_PAYMENT_STATUSES.has(st)) return false;
  const due = String(payment?.due_date || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due < todayYmd;
}

export function hasOpenOverduePayments(payments, todayYmd = todayYmdUtc()) {
  for (const p of payments || []) {
    if (isOpenOverduePayment(p, todayYmd)) return true;
  }
  return false;
}

export function studentDocIsMarkedOverdue(doc) {
  return doc?.overdue === true;
}

export function studentDocHasOverdueLabel(doc) {
  return Boolean(String(doc?.overdue_label ?? doc?.overdueLabel ?? '').trim());
}

export async function listAllPaymentsForLead(databases, dbId, academyId, leadId) {
  if (!PAYMENTS_COL || !leadId || !academyId) return [];
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const queries = [
      Query.equal('lead_id', String(leadId)),
      Query.equal('academy_id', String(academyId)),
      Query.limit(PAGE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, PAYMENTS_COL, queries);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return all;
}

async function updateStudentOverdueDoc(databases, dbId, collectionId, studentId, patch) {
  try {
    await databases.updateDocument(dbId, collectionId, studentId, patch);
    return { ok: true };
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/unknown attribute/i.test(msg)) throw e;
    const lean = { ...patch };
    delete lean.overdue_label;
    if (Object.keys(lean).length) {
      await databases.updateDocument(dbId, collectionId, studentId, lean);
    }
    return { ok: true, partial: true, warning: msg };
  }
}

/**
 * Marca inadimplente se overdue ainda não estiver true (evita writes repetidos).
 */
export async function markStudentOverdueIfUnset(databases, dbId, studentDoc, financeConfig, peopleCol) {
  if (!peopleCol || !studentDoc?.$id) return { updated: false, reason: 'not_configured' };
  if (studentDocIsMarkedOverdue(studentDoc)) return { updated: false, reason: 'already_marked' };

  const label = resolveOverdueLabelFromFinanceConfig(financeConfig);
  const patch = { overdue: true, overdue_label: label };
  await updateStudentOverdueDoc(databases, dbId, peopleCol, studentDoc.$id, patch);
  return { updated: true, action: 'marked', overdue_label: label };
}

/**
 * Remove marca de inadimplente se estava setada.
 */
export async function clearStudentOverdueIfSet(databases, dbId, studentDoc, peopleCol) {
  if (!peopleCol || !studentDoc?.$id) return { updated: false, reason: 'not_configured' };
  if (!studentDocIsMarkedOverdue(studentDoc) && !studentDocHasOverdueLabel(studentDoc)) {
    return { updated: false, reason: 'already_clear' };
  }

  await updateStudentOverdueDoc(databases, dbId, peopleCol, studentDoc.$id, {
    overdue: false,
    overdue_label: null,
  });
  return { updated: true, action: 'cleared' };
}

/**
 * Após pagamento pago/parcial: limpa overdue só se não restar pagamento em aberto vencido.
 */
export async function syncStudentOverdueAfterPayment(
  databases,
  dbId,
  studentDoc,
  { academyId, leadId, financeConfig, peopleCol }
) {
  const col = peopleCol;
  if (!col || !studentDoc?.$id) return { updated: false, reason: 'not_configured' };

  const payments = await listAllPaymentsForLead(databases, dbId, academyId, leadId);
  const today = todayYmdUtc();

  if (hasOpenOverduePayments(payments, today)) {
    if (studentDocIsMarkedOverdue(studentDoc)) {
      return { updated: false, reason: 'still_overdue' };
    }
    return markStudentOverdueIfUnset(databases, dbId, studentDoc, financeConfig, col);
  }

  return clearStudentOverdueIfSet(databases, dbId, studentDoc, col);
}

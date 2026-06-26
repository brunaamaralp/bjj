/**
 * Unifica alunos matriculados entre coleções students e leads (migração GBLP).
 */
import { normalizeStudentStatus, STUDENT_STATUS } from './studentStatus.js';
import { normalizeDiscountType } from './planBilling.js';

export function isMatriculatedPersonDoc(doc) {
  if (!doc) return false;
  const status = String(doc.status || '').trim();
  const contactType = String(doc.contact_type || '').trim().toLowerCase();
  const studentStatus = String(doc.student_status || doc.studentStatus || '').trim().toLowerCase();
  if (studentStatus === STUDENT_STATUS.INACTIVE || studentStatus === STUDENT_STATUS.ACTIVE) return true;
  if (contactType === 'student') return true;
  if (status === 'Matriculado') return true;
  return false;
}

/** Plano efetivo: cadastro do aluno ou plan_name do pagamento do mês. */
export function effectiveStudentPlan(student, payment = null) {
  return String(student?.plan || payment?.plan_name || '').trim();
}

/**
 * Mapeia documento leads → shape de aluno para financeiro / mensalidades.
 * @param {object} doc
 */
export function mapLeadDocToStudentShape(doc) {
  const dueDayRaw = Number(doc.due_day ?? doc.dueDay ?? 0);
  const dueDay = Number.isFinite(dueDayRaw) && dueDayRaw >= 1 && dueDayRaw <= 31 ? Math.trunc(dueDayRaw) : null;
  const turmaRaw = String(doc.turma ?? doc.class_name ?? doc.className ?? '').trim();
  const discountRaw = Number(doc.discount_amount ?? doc.discountAmount ?? 0);
  const discountAmount =
    Number.isFinite(discountRaw) && discountRaw >= 0 ? Math.round(discountRaw * 100) / 100 : 0;

  return {
    id: doc.$id,
    _isStudent: true,
    name: doc.name,
    phone: doc.phone || doc.phone_number || '',
    email: String(doc.email || '').trim(),
    type: doc.type || 'Adulto',
    turma: turmaRaw,
    className: turmaRaw,
    status: 'Matriculado',
    contact_type: 'student',
    pipelineStage: 'Matriculado',
    studentStatus: normalizeStudentStatus(doc.student_status || doc.studentStatus || STUDENT_STATUS.ACTIVE),
    plan: String(doc.plan || '').trim(),
    discountAmount,
    discountType: normalizeDiscountType(doc),
    dueDay,
    preferredPaymentMethod: doc.preferred_payment_method || doc.preferredPaymentMethod || '',
    preferredPaymentAccount: doc.preferred_payment_account || doc.preferredPaymentAccount || '',
    freeze_status: doc.freeze_status || doc.freezeStatus || '',
    createdAt: doc.$createdAt,
    convertedAt: doc.converted_at || doc.convertedAt || null,
    enrollmentDate: doc.enrollmentDate || doc.enrollment_date || '',
  };
}

/**
 * Mescla documentos brutos: students sobrescrevem leads com mesmo $id.
 * @param {object[]} studentDocs
 * @param {object[]} leadDocs
 */
export function mergeMatriculatedPersonDocs(studentDocs = [], leadDocs = []) {
  const byId = new Map();
  for (const doc of leadDocs || []) {
    if (!isMatriculatedPersonDoc(doc)) continue;
    const id = String(doc.$id || '').trim();
    if (!id) continue;
    byId.set(id, doc);
  }
  for (const doc of studentDocs || []) {
    const id = String(doc.$id || '').trim();
    if (!id) continue;
    byId.set(id, doc);
  }
  return [...byId.values()];
}

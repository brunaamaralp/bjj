/**
 * Matrícula via link público: cria aluno em students ou converte lead existente.
 */
import { ID, Query } from 'node-appwrite';
import {
  buildAcademyDocumentPermissions,
  AcademyPermissionError,
} from './academyDocumentPermissions.js';
import { DB_ID } from './academyAccess.js';
import { addLeadEventServer } from './leadEvents.js';
import { buildStudentPayloadFromDoc } from '../../src/lib/leadStudentPayload.js';
import { buildCustomAnswersPatch, formatEnrollmentAnswerNote, hasCustomAnswerValue } from '../../src/lib/customLeadQuestions.js';
import {
  PUBLIC_ENROLLMENT_ORIGIN,
  readAcademyPlanNames,
  normalizeEnrollmentPhone,
} from '../../src/lib/publicEnrollmentSettings.js';
import { LEAD_STATUS } from '../../src/lib/leadStatus.js';
import { STUDENT_EVENT_TYPES } from '../../src/lib/studentEventTypes.js';
import { TASK_TEMPLATE_TRIGGERS } from '../../src/lib/taskTemplates.js';
import { applyTaskTemplate } from './applyTaskTemplate.js';
import { namesMatchForDedup } from '../../src/lib/studentPhoneDuplicate.js';

const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

function phoneQueryVariants(phone) {
  const p = normalizeEnrollmentPhone(phone);
  if (!p) return [];
  const set = new Set([p]);
  if (p.length >= 10) set.add(`55${p}`);
  return [...set];
}

async function findDocByPhone(databases, collectionId, academyId, phone, { name = '' } = {}) {
  if (!collectionId) return null;
  const compareName = String(name || '').trim();
  for (const variant of phoneQueryVariants(phone)) {
    try {
      const res = await databases.listDocuments(DB_ID, collectionId, [
        Query.equal('academyId', [academyId]),
        Query.equal('phone', [variant]),
        Query.limit(8),
      ]);
      for (const doc of res.documents || []) {
        if (normalizeEnrollmentPhone(doc.phone) !== normalizeEnrollmentPhone(phone)) continue;
        if (compareName.length >= 2 && !namesMatchForDedup(doc.name, compareName)) continue;
        return doc;
      }
    } catch {
      void 0;
    }
  }
  return null;
}

async function recordCustomAnswerNotes({ academyId, studentId, questions, customAnswers }) {
  for (const q of questions || []) {
    const qid = String(q?.id || '').trim();
    if (!qid) continue;
    const value = customAnswers[qid];
    if (!hasCustomAnswerValue(value)) continue;
    const text = formatEnrollmentAnswerNote(q.label, value, q.type);
    if (!text) continue;
    await addLeadEventServer({
      academyId,
      leadId: studentId,
      type: 'note',
      text: text.slice(0, 1000),
      createdBy: 'public_enrollment',
    });
  }
}

async function runEnrollmentSideEffects({ databases, academyId, studentId, studentName }) {
  try {
    await applyTaskTemplate({
      databases,
      dbId: DB_ID,
      academyId,
      trigger: TASK_TEMPLATE_TRIGGERS.ENROLLMENT,
      leadId: studentId,
      leadName: studentName,
      anchorDate: new Date().toISOString().slice(0, 10),
      createdBy: 'public_enrollment',
    });
  } catch (e) {
    console.warn('[public-enrollment] task template:', e?.message || e);
  }
}

function buildFormOverrides(form, customAnswersJson) {
  const today = new Date().toISOString().slice(0, 10);
  const overrides = {
    name: String(form.name || '').trim(),
    phone: normalizeEnrollmentPhone(form.phone),
    type: String(form.type || 'Adulto').trim() || 'Adulto',
    origin: PUBLIC_ENROLLMENT_ORIGIN,
    parentName: String(form.parentName || '').trim(),
    age: form.age != null && form.age !== '' ? String(form.age).trim() : '',
    sexo: String(form.sexo || '').trim().slice(0, 16),
    birth_date: String(form.birthDate || '').trim().slice(0, 10),
    is_first_experience: String(form.isFirstExperience || 'Sim').trim() || 'Sim',
    plan: String(form.plan || '').trim(),
    student_status: 'active',
    enrollmentDate: today,
    converted_at: new Date().toISOString(),
    custom_answers_json: customAnswersJson,
  };
  const turma = String(form.turma || '').trim().slice(0, 64);
  if (turma) overrides.turma = turma;
  return overrides;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {object} academyDoc
 * @param {string} academyId
 * @param {object} form
 * @param {Array} questions
 */
export async function enrollPublicStudent(databases, academyDoc, academyId, form, questions = []) {
  if (!STUDENTS_COL) {
    const err = new Error('students_collection_not_configured');
    err.code = 'misconfigured';
    throw err;
  }

  const name = String(form.name || '').trim();
  const phone = normalizeEnrollmentPhone(form.phone);
  if (!name) {
    const err = new Error('name_required');
    err.code = 'name_required';
    throw err;
  }
  if (!phone || phone.length < 10) {
    const err = new Error('phone_invalid');
    err.code = 'phone_invalid';
    throw err;
  }

  const plans = readAcademyPlanNames(academyDoc);
  const plan = String(form.plan || '').trim();
  if (plans.length > 0 && !plan) {
    const err = new Error('plan_required');
    err.code = 'plan_required';
    throw err;
  }
  if (plans.length > 0 && plan && !plans.includes(plan)) {
    const err = new Error('plan_invalid');
    err.code = 'plan_invalid';
    throw err;
  }

  const customAnswers = buildCustomAnswersPatch(questions, form.customAnswers || {});
  const customAnswersJson = JSON.stringify(customAnswers);
  const overrides = buildFormOverrides(form, customAnswersJson);
  const perms = buildAcademyDocumentPermissions(academyDoc);
  const notes = String(form.notes || '').trim().slice(0, 2000);

  const existingStudent = await findDocByPhone(databases, STUDENTS_COL, academyId, phone, { name });
  if (existingStudent) {
    if (normalizeStudentStatus(existingStudent.student_status) === 'active') {
      const err = new Error('phone_duplicate');
      err.code = 'phone_duplicate';
      err.message = 'Este telefone já está cadastrado como aluno ativo.';
      throw err;
    }
    const err = new Error('student_inactive');
    err.code = 'student_inactive';
    err.message =
      'Encontramos um cadastro inativo com este telefone. Entre em contato com a academia para reativar.';
    throw err;
  }

  const existingLead = LEADS_COL ? await findDocByPhone(databases, LEADS_COL, academyId, phone, { name }) : null;

  let studentId;
  let convertedFromLead = false;

  if (existingLead) {
    convertedFromLead = true;
    studentId = existingLead.$id;
    const payload = buildStudentPayloadFromDoc(
      { ...existingLead, academyId, ...overrides },
      { academyId }
    );

    await databases.createDocument(DB_ID, STUDENTS_COL, studentId, payload, perms);

    try {
      await databases.deleteDocument(DB_ID, LEADS_COL, studentId);
    } catch (delErr) {
      console.error('[public-enrollment] lead delete after student create:', delErr?.message || delErr);
      throw delErr;
    }

    await addLeadEventServer({
      academyId,
      leadId: studentId,
      type: 'converted',
      from: String(existingLead.pipeline_stage || existingLead.pipelineStage || ''),
      to: LEAD_STATUS.CONVERTED,
      text: 'Matriculado pelo link público',
      createdBy: 'public_enrollment',
    });
  } else {
    studentId = ID.unique();
    const payload = buildStudentPayloadFromDoc({ academyId, ...overrides }, { academyId });
    await databases.createDocument(DB_ID, STUDENTS_COL, studentId, payload, perms);
  }

  await addLeadEventServer({
    academyId,
    leadId: studentId,
    type: STUDENT_EVENT_TYPES.ENROLLED,
    text: convertedFromLead
      ? 'Lead convertido em aluno pelo link público'
      : 'Aluno matriculado pelo link público',
    createdBy: 'public_enrollment',
    payloadJson: {
      plan,
      origin: PUBLIC_ENROLLMENT_ORIGIN,
      source: convertedFromLead ? 'public_link_from_lead' : 'public_link',
    },
  });

  await recordCustomAnswerNotes({
    academyId,
    studentId,
    questions,
    customAnswers: form.customAnswers || {},
  });

  if (notes) {
    await addLeadEventServer({
      academyId,
      leadId: studentId,
      type: 'note',
      text: notes,
      createdBy: 'public_enrollment',
    });
  }

  await runEnrollmentSideEffects({
    databases,
    academyId,
    studentId,
    studentName: name,
  });

  return {
    studentId,
    convertedFromLead,
    plan,
  };
}

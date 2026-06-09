/**
 * Repara alunos sem academyId (bug de matrícula antiga).
 * Infere a academia por lead_events, pagamentos ou dica explícita.
 */
import { Query } from 'node-appwrite';

const LEAD_EVENTS_COL =
  process.env.VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID ||
  process.env.APPWRITE_LEAD_EVENTS_COLLECTION_ID ||
  '';
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

export function studentAcademyFromDoc(doc) {
  return String(doc?.academyId || doc?.academy_id || '').trim();
}

export function isOrphanStudentDoc(doc) {
  return !studentAcademyFromDoc(doc);
}

async function inferAcademyFromLeadEvents(databases, dbId, studentId) {
  if (!LEAD_EVENTS_COL || !studentId) return '';
  try {
    const res = await databases.listDocuments(dbId, LEAD_EVENTS_COL, [
      Query.equal('lead_id', String(studentId).trim()),
      Query.orderDesc('at'),
      Query.limit(25),
    ]);
    for (const ev of res.documents || []) {
      const aid = String(ev.academy_id || '').trim();
      if (aid) return aid;
    }
  } catch {
    void 0;
  }
  return '';
}

async function inferAcademyFromPayments(databases, dbId, studentId) {
  if (!PAYMENTS_COL || !studentId) return '';
  try {
    const res = await databases.listDocuments(dbId, PAYMENTS_COL, [
      Query.equal('lead_id', String(studentId).trim()),
      Query.orderDesc('$createdAt'),
      Query.limit(10),
    ]);
    for (const p of res.documents || []) {
      const aid = String(p.academy_id || '').trim();
      if (aid) return aid;
    }
  } catch {
    void 0;
  }
  return '';
}

/**
 * @returns {Promise<string>} academyId inferido ou ''
 */
export async function inferStudentAcademyId(databases, dbId, studentId, hintAcademyId = '') {
  const hint = String(hintAcademyId || '').trim();
  if (hint) return hint;

  const fromEvents = await inferAcademyFromLeadEvents(databases, dbId, studentId);
  if (fromEvents) return fromEvents;

  return inferAcademyFromPayments(databases, dbId, studentId);
}

/**
 * Garante que o aluno pertence à academia; repara órfãos quando há evidência.
 * @returns {Promise<object>} documento Appwrite (possivelmente reparado)
 */
export async function assertOrRepairStudentInAcademy(databases, dbId, studentsCol, studentId, academyId) {
  const sid = String(studentId || '').trim();
  const aid = String(academyId || '').trim();
  if (!sid || !aid || !studentsCol) {
    const err = new Error('forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }

  let doc = await databases.getDocument(dbId, studentsCol, sid);
  const docAcademy = studentAcademyFromDoc(doc);

  if (docAcademy === aid) return doc;

  if (!docAcademy) {
    const inferred = await inferStudentAcademyId(databases, dbId, sid, aid);
    if (inferred === aid) {
      doc = await databases.updateDocument(dbId, studentsCol, sid, { academyId: aid });
      console.info('[studentAcademyRepair] academyId reparado', { studentId: sid, academyId: aid });
      return doc;
    }
  }

  const err = new Error('forbidden');
  err.code = 'FORBIDDEN';
  throw err;
}

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Busca alunos por telefone (inclui órfãos sem academyId).
 */
export async function findStudentsByPhone(databases, dbId, studentsCol, phone, { limit = 20 } = {}) {
  const digits = normalizePhoneDigits(phone);
  if (!studentsCol || digits.length < 8) return [];

  const phoneFields = ['phone', 'phone_number', 'emergencyPhone', 'emergency_phone'];
  const found = new Map();

  for (const field of phoneFields) {
    for (const variant of [digits, digits.slice(-11), digits.slice(-10), digits.slice(-9)]) {
      if (!variant || variant.length < 8) continue;
      try {
        const res = await databases.listDocuments(dbId, studentsCol, [
          Query.equal(field, variant),
          Query.limit(Math.min(limit, 25)),
        ]);
        for (const doc of res.documents || []) {
          const docPhone = normalizePhoneDigits(doc.phone || doc.phone_number || '');
          if (
            docPhone &&
            (docPhone === digits ||
              docPhone.endsWith(digits) ||
              digits.endsWith(docPhone) ||
              docPhone.endsWith(digits.slice(-11)) ||
              digits.endsWith(docPhone.slice(-11)))
          ) {
            found.set(doc.$id, doc);
          }
        }
      } catch {
        void 0;
      }
    }
  }

  return [...found.values()].slice(0, limit);
}

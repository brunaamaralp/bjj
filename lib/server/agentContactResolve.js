import { findLeadByPhone, findRegisteredStudentByPhone } from './ensureWhatsAppInboundLead.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { DB_ID, LEADS_COL } from './appwriteCollections.js';

/**
 * Resolve contato WhatsApp → student ou lead na academia.
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {string} phone
 * @param {object} [conversationDoc]
 */
export async function resolveWhatsAppContact(databases, academyId, phone, conversationDoc) {
  const a = String(academyId || '').trim();
  const p = String(phone || '').trim();
  const convLeadId = String(conversationDoc?.lead_id || '').trim();

  const studentDoc = await findRegisteredStudentByPhone(databases, a, p);
  if (studentDoc?.$id) {
    const student = mapAppwriteDocToStudent(studentDoc);
    return {
      kind: 'student',
      id: studentDoc.$id,
      name: String(student.name || studentDoc.name || '').trim(),
      doc: studentDoc,
      student,
      isEnrolled: true,
    };
  }

  let leadDoc = await findLeadByPhone(databases, p, a);
  if (!leadDoc && convLeadId && LEADS_COL && DB_ID) {
    try {
      leadDoc = await databases.getDocument(DB_ID, LEADS_COL, convLeadId);
      const la = String(leadDoc?.academyId || leadDoc?.academy_id || '').trim();
      if (la !== a) leadDoc = null;
    } catch {
      leadDoc = null;
    }
  }

  if (leadDoc?.$id) {
    return {
      kind: 'lead',
      id: leadDoc.$id,
      name: String(leadDoc.name || '').trim(),
      doc: leadDoc,
      student: null,
      isEnrolled: String(leadDoc.status || '').trim() === 'Matriculado',
    };
  }

  return { kind: 'unknown', id: '', name: '', doc: null, student: null, isEnrolled: false };
}

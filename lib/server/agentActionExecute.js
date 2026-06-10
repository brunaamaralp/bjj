import { DB_ID, STUDENTS_COL, ACADEMIES_COL } from './appwriteCollections.js';
import { createConversationNoteServer, addLeadNoteServer } from './conversationNoteServer.js';
import { updateStudentServer } from './updateStudentServer.js';
import { createLeadServer } from './createLeadServer.js';
import { executeFreezeServer } from './planFreezeExecute.js';
import { FREEZE_STATUS_ACTIVE } from '../planFreezeCore.js';

const PLAN_FREEZES_COL =
  process.env.VITE_APPWRITE_PLAN_FREEZES_COLLECTION_ID ||
  process.env.PLAN_FREEZES_COLLECTION_ID ||
  '';

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {object} params
 */
export async function executeAgentAction(databases, {
  academyId,
  academyDoc,
  conversationId,
  phone,
  contact,
  action,
  data,
  agentState,
}) {
  const act = String(action || '').trim();
  const d = data && typeof data === 'object' ? data : {};
  const aid = String(academyId || '').trim();

  if (act === 'add_conversation_note') {
    const noteText = String(d.note_text || d.body || '').trim();
    if (!noteText) return { ok: false, error: 'note_text_required' };
    return createConversationNoteServer(databases, {
      academyId: aid,
      conversationId,
      body: noteText,
    });
  }

  if (act === 'add_lead_note') {
    const leadId = String(contact?.id || d.lead_id || '').trim();
    const noteText = String(d.note_text || '').trim();
    if (!leadId || contact?.kind === 'unknown') return { ok: false, error: 'lead_not_found' };
    if (!noteText) return { ok: false, error: 'note_text_required' };
    return addLeadNoteServer(databases, { academyId: aid, leadId, noteText });
  }

  if (act === 'update_student') {
    if (contact?.kind === 'unknown') return { ok: false, error: 'contact_not_found' };
    const payload = { ...d, student_id: contact?.id };
    if (agentState?.intake?.collected) {
      Object.assign(payload, agentState.intake.collected);
    }
    return updateStudentServer(databases, { academyId: aid, contact, data: payload });
  }

  if (act === 'create_lead') {
    if (contact?.kind !== 'unknown') return { ok: false, error: 'contact_already_exists' };
    return createLeadServer(databases, {
      academyId: aid,
      academyDoc,
      phone: d.phone || d.lead_phone || phone,
      name: d.name || d.lead_name,
      type: d.type,
      origin: d.origin || 'WhatsApp',
    });
  }

  if (act === 'freeze_plan') {
    if (contact?.kind !== 'student') {
      return { ok: false, error: 'student_required_for_freeze' };
    }
    const student = contact.student;
    if (String(student?.freeze_status || '').trim() === FREEZE_STATUS_ACTIVE) {
      return { ok: false, error: 'student_already_frozen' };
    }
    const fp = agentState?.freeze_pending || {};
    if (fp.awaiting_confirmation === true) {
      return { ok: false, error: 'awaiting_confirmation' };
    }
    const startYmd = String(d.start_ymd || d.startYmd || fp.start_ymd || '').slice(0, 10);
    const endYmd = String(d.end_ymd || d.endYmd || fp.end_ymd || '').slice(0, 10);
    const durationDays = d.duration_days ?? d.durationDays ?? fp.duration_days;
    const reason = String(d.reason || fp.reason || '').trim();
    const indefinite = d.indefinite === true || fp.indefinite === true;

    return executeFreezeServer({
      databases,
      dbId: DB_ID,
      studentsCol: STUDENTS_COL,
      planFreezesCol: PLAN_FREEZES_COL,
      academiesCol: ACADEMIES_COL,
      academyId: aid,
      studentId: contact.id,
      startYmd,
      endYmd,
      durationDays,
      reason,
      indefinite,
      registeredBy: 'ai-agent',
    });
  }

  return { ok: false, error: 'unknown_action' };
}

import { addLeadEvent } from './leadEvents.js';
import { STUDENT_STATUS } from './studentStatus.js';
import {
  formatDeactivateNote,
  parseOffboardingChecklist,
  readOffboardingChecklistFromAcademyDoc,
  todayYmdLocal,
} from './studentOffboarding.js';
import { readStudentExitReasonsFromAcademyDoc } from './studentExitConfig.js';

/**
 * Desliga aluno: status, motivo, data, nota na timeline e tarefas de checklist.
 * @param {object} opts
 * @param {object} opts.student — lead/aluno atual
 * @param {string} opts.leadId
 * @param {string} opts.academyId
 * @param {string} opts.userId
 * @param {object} opts.permCtx
 * @param {string} opts.exitReason
 * @param {string} opts.exitDate — YYYY-MM-DD
 * @param {string} [opts.exitNotes]
 * @param {object} [opts.academyDoc] — documento academia (motivos/checklist)
 * @param {function} opts.updateLead — useLeadStore updateLead
 * @param {function} opts.createTask — useTaskStore createTask
 */
export async function deactivateStudent({
  student,
  leadId,
  academyId,
  userId,
  permCtx,
  exitReason,
  exitDate,
  exitNotes = '',
  academyDoc,
  updateLead,
  createTask,
}) {
  const ymd = String(exitDate || '').trim().slice(0, 10) || todayYmdLocal();

  await updateLead(leadId, {
    studentStatus: STUDENT_STATUS.INACTIVE,
    exitReason: String(exitReason || '').trim(),
    exitDate: ymd,
  });

  const noteText = formatDeactivateNote({ exitReason, exitDate: ymd, exitNotes });
  await addLeadEvent({
    academyId,
    leadId,
    type: 'note',
    text: noteText,
    createdBy: userId || 'user',
    permissionContext: permCtx,
  });
  await updateLead(leadId, { lastNoteAt: new Date().toISOString() });

  const checklist = readOffboardingChecklistFromAcademyDoc(academyDoc);
  const studentName = String(student?.name || '').trim();
  const due = ymd;

  for (const title of checklist) {
    try {
      await createTask({
        title: String(title).trim(),
        description: `Checklist de desligamento — ${studentName}`,
        status: 'pending',
        due_date: due,
        lead_id: leadId,
        lead_name: studentName,
      });
    } catch (e) {
      console.warn('[deactivateStudent] falha ao criar tarefa:', title, e);
    }
  }
}

/**
 * Reativa aluno ativo.
 */
export async function reactivateStudent({
  leadId,
  academyId,
  userId,
  permCtx,
  updateLead,
}) {
  await updateLead(leadId, {
    studentStatus: STUDENT_STATUS.ACTIVE,
    exitReason: '',
    exitDate: '',
  });

  const br = new Date().toLocaleDateString('pt-BR');
  await addLeadEvent({
    academyId,
    leadId,
    type: 'note',
    text: `Aluno reativado em ${br}.`,
    createdBy: userId || 'user',
    permissionContext: permCtx,
  });
  await updateLead(leadId, { lastNoteAt: new Date().toISOString() });
}

export { readStudentExitReasonsFromAcademyDoc };

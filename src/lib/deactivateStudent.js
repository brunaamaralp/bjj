import { addLeadEvent } from './leadEvents.js';
import { STUDENT_STATUS } from './studentStatus.js';
import { formatDeactivateNote, todayYmdLocal } from './studentOffboarding.js';
import { applyTaskTemplateForTrigger, TASK_TEMPLATE_TRIGGERS } from './applyTaskTemplateClient.js';

/**
 * Desliga aluno: status, motivo, data, nota na timeline e tarefas do template student_exit.
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
  updateLead,
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

  const studentName = String(student?.name || '').trim();
  let tasksCreated = 0;
  let templateName = '';

  try {
    const applied = await applyTaskTemplateForTrigger({
      academyId,
      trigger: TASK_TEMPLATE_TRIGGERS.STUDENT_EXIT,
      leadId,
      leadName: studentName,
      anchorDate: ymd,
    });
    tasksCreated = applied.created;
    templateName = applied.templateName;
  } catch (e) {
    console.warn('[deactivateStudent] template student_exit:', e?.message || e);
  }

  return { tasksCreated, templateName };
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

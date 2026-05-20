import { addLeadEvent } from './leadEvents.js';
import { STUDENT_STATUS } from './studentStatus.js';
import { formatDeactivateNote, todayYmdLocal } from './studentOffboarding.js';
import { applyTaskTemplateForTrigger, TASK_TEMPLATE_TRIGGERS } from './applyTaskTemplateClient.js';
import { readControlIdConfig } from '../../lib/controlidSettings.js';
import { revokeControlIdStudent } from './controlidApi.js';

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
  updateStudent,
  updateLead,
  academySettingsRaw = null,
}) {
  const patch = updateStudent || updateLead;
  if (!patch) throw new Error('updateStudent_required');
  const ymd = String(exitDate || '').trim().slice(0, 10) || todayYmdLocal();

  await patch(leadId, {
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

  const controlIdCfg = readControlIdConfig(academySettingsRaw);
  const controlIdUser =
    student?.controlid_user_id ?? student?.controlidUserId ?? student?.device_id;
  if (controlIdCfg.enabled && controlIdUser) {
    void revokeControlIdStudent(academyId, { leadId }).catch((e) => {
      console.warn('[deactivateStudent] controlid revoke:', e?.message || e);
    });
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
  updateStudent,
  updateLead,
}) {
  const patch = updateStudent || updateLead;
  if (!patch) throw new Error('updateStudent_required');
  await patch(leadId, {
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
  if (updateLead && !updateStudent) {
    await updateLead(leadId, { lastNoteAt: new Date().toISOString() });
  }
}

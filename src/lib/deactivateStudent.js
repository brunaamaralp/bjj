import { addLeadEvent } from './leadEvents.js';
import { STUDENT_EVENT_TYPES } from './studentEventTypes.js';
import { STUDENT_STATUS } from './studentStatus.js';
import { todayYmdLocal } from './studentOffboarding.js';
import { applyTaskTemplateForTrigger, TASK_TEMPLATE_TRIGGERS } from './applyTaskTemplateClient.js';
import { readControlIdConfig } from '../../lib/controlidSettings.js';
import { revokeControlIdStudent } from './controlidApi.js';
import { deactivateStudentApi } from './studentsApi.js';

/**
 * Desligamento: validação no servidor (POST /api/students/deactivate).
 *
 * Checklist `student_offboarding_checklist` na academia NÃO gera tarefas automáticas aqui:
 * usamos apenas o template STUDENT_EXIT (applyTaskTemplateForTrigger), que é o fluxo
 * operacional ativo. O checklist permanece como referência configurável na UI da academia.
 */
export async function deactivateStudent({
  student,
  leadId,
  academyId,
  exitReason,
  exitDate,
  exitNotes = '',
  cancelFuturePayments = false,
  mergeStudent,
  refreshPaymentStatus,
  academySettingsRaw = null,
}) {
  const ymd = String(exitDate || '').trim().slice(0, 10) || todayYmdLocal();

  const apiRes = await deactivateStudentApi({
    student_id: leadId,
    exit_reason: String(exitReason || '').trim(),
    exit_date: ymd,
    exit_notes: String(exitNotes || '').trim(),
    cancel_future_payments: cancelFuturePayments,
  });

  const localPatch = {
    studentStatus: STUDENT_STATUS.INACTIVE,
    exitReason: String(exitReason || '').trim(),
    exitDate: ymd,
  };
  if (mergeStudent) {
    mergeStudent(leadId, localPatch);
  }

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

  if (refreshPaymentStatus) {
    try {
      await refreshPaymentStatus(leadId, academyId);
    } catch (e) {
      console.warn('[deactivateStudent] refreshPaymentStatus:', e?.message || e);
    }
  }

  return {
    tasksCreated,
    templateName,
    paymentsCancelled: apiRes?.payments_cancelled ?? 0,
  };
}

/**
 * Reativa aluno ativo.
 */
export async function reactivateStudent({
  leadId,
  leadName = '',
  academyId,
  userId,
  permCtx,
  updateStudent,
  mergeStudent,
}) {
  const patchFn = mergeStudent || updateStudent;
  if (!patchFn) throw new Error('updateStudent_required');

  if (mergeStudent) {
    mergeStudent(leadId, {
      studentStatus: STUDENT_STATUS.ACTIVE,
      exitReason: '',
      exitDate: '',
    });
  } else {
    await updateStudent(leadId, {
      studentStatus: STUDENT_STATUS.ACTIVE,
      exitReason: '',
      exitDate: '',
    });
  }

  const br = new Date().toLocaleDateString('pt-BR');
  await addLeadEvent({
    academyId,
    leadId,
    type: STUDENT_EVENT_TYPES.REACTIVATED,
    text: `Aluno reativado em ${br}.`,
    createdBy: userId || 'user',
    permissionContext: permCtx,
  });

  try {
    await applyTaskTemplateForTrigger({
      academyId,
      trigger: TASK_TEMPLATE_TRIGGERS.STUDENT_REACTIVATION,
      leadId,
      leadName: String(leadName || '').trim(),
      anchorDate: new Date().toISOString().slice(0, 10),
    });
  } catch (e) {
    console.warn('[reactivateStudent] template student_reactivation:', e?.message || e);
  }
}

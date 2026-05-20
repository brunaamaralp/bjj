import { LEAD_STATUS } from '../store/useLeadStore.js';
import { addLeadEvent } from './leadEvents.js';
import { applyTaskTemplateForTrigger, TASK_TEMPLATE_TRIGGERS } from './applyTaskTemplateClient.js';
import { triggerImmediateAutomation } from './triggerImmediateAutomation.js';
import {
  buildCustomAnswersPatch,
  formatEnrollmentAnswerNote,
  hasCustomAnswerValue,
} from './customLeadQuestions.js';
import { readEnrollmentFollowUpTask, addDaysToYmd } from './enrollmentSettings.js';
import { readControlIdConfig } from '../../lib/controlidSettings.js';
import { syncControlIdStudentBackground } from './controlidApi.js';
import { useTaskStore } from '../store/useTaskStore.js';
import { moveLeadToStudent } from './moveLeadToStudent.js';
import { buildClientDocumentPermissions } from './clientDocumentPermissions.js';
import { useLeadStore } from '../store/useLeadStore.js';

/**
 * Fluxo unificado de matrícula (Pipeline, LeadProfile, etc.).
 * Move o documento de leads → students (mesmo $id).
 */
export async function performEnrollment({
  lead,
  academyId,
  userId,
  permissionContext = {},
  updateLead: _updateLead,
  customQuestions = [],
  customAnswers = {},
  plan = '',
  academySettingsRaw = null,
  waAutomation = null,
  onToast = null,
}) {
  const leadId = String(lead?.id || '').trim();
  if (!leadId) throw new Error('lead_missing');

  await addLeadEvent({
    academyId,
    leadId,
    type: 'converted',
    from: lead.pipelineStage || '',
    to: LEAD_STATUS.CONVERTED,
    createdBy: userId || 'user',
    permissionContext,
  });

  const answersPatch = buildCustomAnswersPatch(customQuestions, customAnswers);
  const mergedCustomAnswers =
    Object.keys(answersPatch).length > 0
      ? { ...(lead.customAnswers && typeof lead.customAnswers === 'object' ? lead.customAnswers : {}), ...answersPatch }
      : undefined;

  const planName = String(plan || '').trim();
  const academyList = useLeadStore.getState().academyList || [];
  const acadDoc = academyList.find((a) => a.id === academyId) || {};
  const teamId = String(acadDoc.teamId || useLeadStore.getState().teamId || '').trim();
  const sessionUserId = String(userId || useLeadStore.getState().userId || '').trim();
  const perms = buildClientDocumentPermissions({ teamId, userId: sessionUserId });

  const student = await moveLeadToStudent({
    leadId,
    lead,
    overrides: {
      plan: planName || lead.plan,
      convertedAt: new Date().toISOString(),
      studentStatus: 'active',
      ...(mergedCustomAnswers ? { customAnswers: mergedCustomAnswers } : {}),
    },
    permissions: perms,
  });

  for (const q of customQuestions || []) {
    const qid = String(q?.id || '').trim();
    if (!qid) continue;
    const value = customAnswers[qid];
    if (!hasCustomAnswerValue(value)) continue;
    const text = formatEnrollmentAnswerNote(q.label, value, q.type);
    if (!text) continue;
    await addLeadEvent({
      academyId,
      leadId,
      type: 'note',
      text: text.slice(0, 1000),
      createdBy: userId || 'user',
      permissionContext,
    });
  }

  if (waAutomation) {
    const { waOutbound, academyRaw } = waAutomation;
    void triggerImmediateAutomation('converted', {
      lead: { ...student, status: LEAD_STATUS.CONVERTED, contact_type: 'student' },
      academyId,
      waOutbound,
      academyRaw,
    }).catch(console.error);
  }

  let toastMsg = '';
  try {
    const applied = await applyTaskTemplateForTrigger({
      academyId,
      trigger: TASK_TEMPLATE_TRIGGERS.ENROLLMENT,
      leadId,
      leadName: String(lead.name || ''),
      anchorDate: new Date().toISOString().slice(0, 10),
    });
    if (applied.created > 0) {
      toastMsg += ` ${applied.created} tarefa${applied.created === 1 ? '' : 's'} de boas-vindas criadas.`;
    }
  } catch (tplErr) {
    console.warn('[performEnrollment] template enrollment:', tplErr?.message || tplErr);
  }

  const followUp = readEnrollmentFollowUpTask(academySettingsRaw);
  if (followUp) {
    try {
      await useTaskStore.getState().createTask({
        title: followUp.title,
        description: '',
        status: 'pending',
        due_date: addDaysToYmd(followUp.days),
        lead_id: leadId,
        lead_name: String(lead.name || ''),
      });
      toastMsg += ' Tarefa de acompanhamento criada.';
    } catch (taskErr) {
      console.warn('[performEnrollment] follow-up task:', taskErr?.message || taskErr);
    }
  }

  const controlIdCfg = readControlIdConfig(academySettingsRaw);
  if (controlIdCfg.enabled) {
    const photoUrl = String(lead.photo_url || lead.photoUrl || '').trim();
    syncControlIdStudentBackground(academyId, leadId, { photoUrl: photoUrl || undefined });
    if (!photoUrl) {
      toastMsg += ' Cadastro na catraca pendente — adicione foto no perfil do aluno.';
    }
  }

  if (toastMsg && onToast) onToast(toastMsg.trim());
  return student;
}

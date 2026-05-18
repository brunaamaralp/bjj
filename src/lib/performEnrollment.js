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
import { useTaskStore } from '../store/useTaskStore.js';

/**
 * Fluxo unificado de matrícula (Pipeline, LeadProfile, etc.).
 *
 * @param {object} opts
 * @param {object} opts.lead
 * @param {string} opts.academyId
 * @param {string} opts.userId
 * @param {object} [opts.permissionContext]
 * @param {function} opts.updateLead
 * @param {Array} [opts.customQuestions]
 * @param {Record<string, unknown>} [opts.customAnswers]
 * @param {unknown} [opts.academySettingsRaw]
 * @param {object} [opts.waAutomation]
 * @param {function} [opts.onToast] — (message: string) => void
 */
export async function performEnrollment({
  lead,
  academyId,
  userId,
  permissionContext = {},
  updateLead,
  customQuestions = [],
  customAnswers = {},
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

  await updateLead(leadId, {
    status: LEAD_STATUS.CONVERTED,
    contact_type: 'student',
    pipelineStage: 'Matriculado',
    convertedAt: new Date().toISOString(),
    studentStatus: 'active',
    ...(mergedCustomAnswers ? { customAnswers: mergedCustomAnswers } : {}),
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
      lead: {
        ...lead,
        status: LEAD_STATUS.CONVERTED,
        contact_type: 'student',
        pipelineStage: 'Matriculado',
      },
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

  if (toastMsg && onToast) onToast(toastMsg.trim());
}

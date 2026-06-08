import { postInboxConversation } from './inboxConversationPost.js';

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

/**
 * Vincula conversa WhatsApp (se existir) ao aluno e remove lead fantasma do funil.
 *
 * @param {object} opts
 * @param {object} opts.lead
 * @param {string} opts.studentId
 * @param {string} opts.academyId
 * @param {(id: string) => Promise<void>} opts.deleteLead
 */
export async function resolvePipelineLeadToStudent({ lead, studentId, academyId, deleteLead }) {
  const phone = normalizePhone(lead?.phone);
  const sid = String(studentId || '').trim();
  const lid = String(lead?.id || '').trim();
  if (!sid || !lid) throw new Error('Dados incompletos para vincular aluno.');

  if (phone && academyId) {
    try {
      await postInboxConversation({
        phone,
        academyId,
        body: { action: 'link_lead', lead_id: sid },
        fallbackError: 'Falha ao associar conversa',
      });
    } catch {
      /* conversa pode não existir — lead ainda deve sair do funil */
    }
  }

  await deleteLead(lid);
  return { studentId: sid };
}

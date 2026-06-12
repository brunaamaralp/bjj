import { postInboxConversation } from './inboxConversationPost.js';

/**
 * Remove vínculo lead/aluno da conversa WhatsApp (após descartar lead fantasma).
 * @param {{ phone: string, academyId: string, markNotLead?: boolean }} opts
 */
export async function unlinkInboxConversationLead({ phone, academyId, markNotLead = false }) {
  const p = String(phone || '').trim();
  const aid = String(academyId || '').trim();
  if (!p || !aid) return;
  try {
    await postInboxConversation({
      phone: p,
      academyId: aid,
      body: { action: markNotLead ? 'mark_not_lead' : 'unlink_lead' },
      fallbackError: markNotLead ? 'Falha ao marcar contato' : 'Falha ao desvincular contato',
    });
  } catch {
    /* conversa pode não existir */
  }
}

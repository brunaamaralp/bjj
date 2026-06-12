import { postInboxConversation } from './inboxConversationPost.js';

/**
 * Limpa descarte e recria lead pendente de triagem para a conversa.
 */
export async function restoreInboxLeadTriage({ phone, academyId }) {
  return postInboxConversation({
    phone,
    academyId,
    body: { action: 'restore_lead_triage' },
    fallbackError: 'Falha ao restaurar triagem',
  });
}

import { postInboxConversation } from './inboxConversationPost.js';

/**
 * Remove vínculo lead/aluno da conversa WhatsApp (após descartar lead fantasma).
 */
export async function unlinkInboxConversationLead({ phone, academyId }) {
  const p = String(phone || '').trim();
  const aid = String(academyId || '').trim();
  if (!p || !aid) return;
  try {
    await postInboxConversation({
      phone: p,
      academyId: aid,
      body: { action: 'unlink_lead' },
      fallbackError: 'Falha ao desvincular contato',
    });
  } catch {
    /* conversa pode não existir */
  }
}

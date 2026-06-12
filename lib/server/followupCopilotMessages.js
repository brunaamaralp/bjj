import { AGENT_HISTORY_WINDOW } from '../constants.js';
import { loadThreadMessagesFromDoc } from './conversationMessages.js';

/**
 * Normaliza mensagens da conversa para o prompt do copilot de retorno.
 * @param {unknown[]} messages
 */
export function mapMessagesForCopilotContext(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistente' : 'cliente',
      content: String(m.content || '').trim(),
      at: String(m.timestamp || m.at || '').trim(),
    }))
    .filter((m) => m.content);
}

/**
 * Últimas N mensagens do doc de conversa (mesma lógica do thread do Inbox).
 * @param {Record<string, unknown> | null | undefined} doc
 * @param {number} [window]
 */
export function resolveConversationMessagesFromDoc(doc, window = AGENT_HISTORY_WINDOW) {
  if (!doc) return [];
  const { slice } = loadThreadMessagesFromDoc(doc, { limit: window });
  return mapMessagesForCopilotContext(slice);
}

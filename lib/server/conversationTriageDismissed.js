import { readAgentState } from './conversationsStore.js';

export const TRIAGE_DISMISSED_STATE_KEY = 'triage_dismissed';

/**
 * Conversa marcada como "não é lead" — não recriar lead automático no próximo inbound.
 * @param {object | null | undefined} conversationDoc
 */
export function isConversationTriageDismissed(conversationDoc) {
  if (!conversationDoc) return false;
  const state = readAgentState(conversationDoc.agent_state);
  return state[TRIAGE_DISMISSED_STATE_KEY] === true;
}

/**
 * @param {object | null | undefined} currentState
 */
export function buildTriageDismissedAgentState(currentState) {
  const base = currentState && typeof currentState === 'object' && !Array.isArray(currentState)
    ? { ...currentState }
    : {};
  return {
    ...base,
    [TRIAGE_DISMISSED_STATE_KEY]: true,
    triage_dismissed_at: new Date().toISOString(),
  };
}

/**
 * Remove flag de descarte para permitir novo lead automático / triagem.
 * @param {object | null | undefined} currentState
 */
export function clearTriageDismissedAgentState(currentState) {
  const base = currentState && typeof currentState === 'object' && !Array.isArray(currentState)
    ? { ...currentState }
    : {};
  delete base[TRIAGE_DISMISSED_STATE_KEY];
  delete base.triage_dismissed_at;
  return base;
}

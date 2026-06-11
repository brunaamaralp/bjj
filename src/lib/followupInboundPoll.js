/** Intervalo de poll inbound quando realtime está ativo (safety net). */
export const INBOUND_POLL_MS_REALTIME = 120_000;

/** Intervalo de poll inbound quando realtime falhou ou não conectou. */
export const INBOUND_POLL_MS_FALLBACK = 45_000;

/**
 * @param {boolean} realtimeOn
 * @param {boolean} [hidden]
 * @returns {number | null} ms entre polls, ou null se aba oculta
 */
export function getInboundPollMs(realtimeOn, hidden = false) {
  if (hidden) return null;
  return realtimeOn ? INBOUND_POLL_MS_REALTIME : INBOUND_POLL_MS_FALLBACK;
}

/** Estados que significam sessão WA ativa para envio pelo app. */
export const WA_CONNECTED_STATUSES = new Set(['connected', 'online']);

/**
 * Estados transitórios — UI não deve exibir banner de desconexão.
 * Inclui `offline` (pausa operacional), distinto de `disconnected`.
 */
export const WA_TRANSIENT_STATUSES = new Set([
  'connecting',
  'syncing',
  'unknown',
  'open',
  'qrcode',
  'scanning',
  'offline',
]);

/** Pausa Zapster (power-off) — bloqueia envio, mas não é desconexão de pareamento. */
export const WA_PAUSED_STATUSES = new Set(['offline']);

/**
 * Consolida status do documento Appwrite (zapster_status) e da API Zapster live.
 * @param {string} academyZapsterStatus
 * @param {string} apiStatus
 * @param {string|null|undefined} instanceId
 */
export function resolveWhatsAppIntegrationStatus(academyZapsterStatus, apiStatus, instanceId) {
  const docSt = String(academyZapsterStatus || '').trim().toLowerCase();
  const apiSt = String(apiStatus || '').trim().toLowerCase();
  const hasInstance = Boolean(String(instanceId || '').trim());

  if (WA_CONNECTED_STATUSES.has(apiSt)) return 'connected';
  if (WA_TRANSIENT_STATUSES.has(apiSt)) return apiSt;
  if (docSt) return docSt;
  if (!hasInstance) return 'disconnected';
  return apiSt || 'disconnected';
}

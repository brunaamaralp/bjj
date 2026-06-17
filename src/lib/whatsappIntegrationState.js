const WA_CONNECTED_STATUSES = new Set(['connected', 'online']);
/** Pareamento / reconexão — não exibir “não conectado” como estado final. */
const WA_TRANSIENT_STATUSES = new Set([
  'connecting',
  'syncing',
  'unknown',
  'open',
  'qrcode',
  'scanning',
]);

/** Estado de conexão Zapster para UI de conversa integrada. */
export function isWhatsAppIntegrationConnected(waStatus, waStatusChecked) {
  if (!waStatusChecked) return false;
  return WA_CONNECTED_STATUSES.has(String(waStatus || '').trim().toLowerCase());
}

/**
 * Exibe aviso de desconexão só quando o status foi verificado e não está conectado
 * nem em estado transitório (reconexão / verificação em andamento).
 */
export function isWhatsAppIntegrationDisconnected(waStatus, waStatusChecked) {
  if (!waStatusChecked) return false;
  const st = String(waStatus || '').trim().toLowerCase();
  if (WA_CONNECTED_STATUSES.has(st)) return false;
  if (WA_TRANSIENT_STATUSES.has(st)) return false;
  return true;
}

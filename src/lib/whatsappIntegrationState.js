/** Estado de conexão Zapster para UI de conversa integrada. */
export function isWhatsAppIntegrationConnected(waStatus, waStatusChecked) {
  return waStatusChecked && String(waStatus || '').trim() === 'connected';
}

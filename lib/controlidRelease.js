export const CONTROLID_RELEASE_REASON_MIN = 3;
export const CONTROLID_RELEASE_REASON_MAX = 500;

export const CONTROLID_RELEASE_REASON_SUGGESTIONS = [
  'Visitante',
  'Entrega',
  'Manutenção',
  'Exceção autorizada',
];

export function normalizeReleaseReason(raw) {
  return String(raw || '').trim();
}

/** @returns {string|null} mensagem de erro ou null se válido */
export function validateReleaseReason(raw) {
  const reason = normalizeReleaseReason(raw);
  if (reason.length < CONTROLID_RELEASE_REASON_MIN) {
    return 'Informe o motivo da liberação (3 a 500 caracteres).';
  }
  if (reason.length > CONTROLID_RELEASE_REASON_MAX) {
    return `Motivo deve ter no máximo ${CONTROLID_RELEASE_REASON_MAX} caracteres.`;
  }
  return null;
}

export function summarizeReleaseReason(reason, maxLen = 60) {
  const s = normalizeReleaseReason(reason);
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 3))}...`;
}

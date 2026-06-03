/** 0 = desconhecido/inválido — na ordenação por data ficam por último dentro do grupo. */
export function parseInboxTimestampMs(value) {
  const s = String(value || '').trim();
  if (!s) return 0;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

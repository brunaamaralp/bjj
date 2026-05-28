/** Tipos de ajuste de estoque (perdas / correções — sem lançamento financeiro). */

export const ADJUSTMENT_TYPE = 'adjustment';

/** referencia_id em movimentos de ajuste (Appwrite exige quantidade >= 0). */
export function adjustmentReferenciaId(quantityChange) {
  const n = Number(quantityChange);
  const sign = Number.isFinite(n) && n < 0 ? 'out' : 'in';
  return `${ADJUSTMENT_TYPE}:${sign}`;
}

/** Sinal do ajuste a partir de referencia_id (`adjustment:in` / `adjustment:out`). */
export function adjustmentReferenciaSign(referencia_id) {
  const ref = String(referencia_id || '');
  if (ref.endsWith(':out')) return -1;
  if (ref.endsWith(':in')) return 1;
  return 0;
}

export const ADJUSTMENT_SUBTYPES = ['avaria', 'furto', 'doacao', 'erro_conta'];

export const ADJUSTMENT_SUBTYPE_LABELS = {
  avaria: 'Produto danificado (avaria)',
  furto: 'Produto desaparecido (furto)',
  doacao: 'Doado ou descartado',
  erro_conta: 'Erro de contagem anterior',
};

export const ADJUSTMENT_SUBTYPE_SHORT = {
  avaria: 'Avaria',
  furto: 'Furto',
  doacao: 'Doação/descarte',
  erro_conta: 'Erro de contagem',
};

/** Ícones lucide-react por subtipo (nome do componente). */
export const ADJUSTMENT_SUBTYPE_ICON = {
  avaria: 'AlertTriangle',
  furto: 'EyeOff',
  doacao: 'Gift',
  erro_conta: 'ClipboardList',
};

export function isAdjustmentSubtype(value) {
  return ADJUSTMENT_SUBTYPES.includes(String(value || '').trim());
}

export function normalizeAdjustmentSubtype(value) {
  const v = String(value || '').trim();
  return isAdjustmentSubtype(v) ? v : '';
}

export function buildAdjustmentMotivo(subtype, note) {
  const label = ADJUSTMENT_SUBTYPE_SHORT[subtype] || subtype;
  const n = String(note || '').trim();
  return n ? `${label}: ${n}` : label;
}

export function formatAdjustToast(before, after) {
  return `Saldo ajustado de ${before} para ${after} unidades`;
}

const CONFIRM_WORDS = /^(sim|s|confirma|confirmo|confirmar|ok|pode|isso|certo|yes|y)$/i;

export function isInventoryAdjustConfirmText(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (CONFIRM_WORDS.test(t)) return true;
  return /\b(sim|confirma)\b/i.test(t) && t.length < 40;
}

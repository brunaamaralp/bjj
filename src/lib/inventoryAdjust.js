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

/** Subtipos em que a retirada do estoque é o caso mais comum. */
export function subtypeSuggestsRemoval(subtype) {
  return subtype === 'avaria' || subtype === 'furto' || subtype === 'doacao';
}

/**
 * Calcula quantity_change para a API a partir da UI (sempre quantidade positiva + direção).
 * @param {{ direction?: 'remove'|'add', quantity?: number, targetQuantity?: number, currentQuantity?: number }} opts
 */
export function quantityChangeFromAdjustment(opts) {
  const current = Number(opts?.currentQuantity);
  const cur = Number.isFinite(current) ? current : 0;

  const targetRaw = opts?.targetQuantity;
  if (targetRaw !== undefined && targetRaw !== null && String(targetRaw).trim() !== '') {
    const target = Math.trunc(Number(String(targetRaw).replace(',', '.')));
    if (!Number.isFinite(target) || target < 0) return null;
    return target - cur;
  }

  const qty = Math.abs(Math.trunc(Number(opts?.quantity)));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return opts?.direction === 'remove' ? -qty : qty;
}

/** Prévia do saldo após o ajuste (null se inválido). */
export function previewBalanceAfterAdjustment(opts) {
  const change = quantityChangeFromAdjustment(opts);
  if (change == null || change === 0) return null;
  const cur = Number(opts?.currentQuantity);
  const before = Number.isFinite(cur) ? cur : 0;
  const after = before + change;
  return { before, after, change };
}

const CONFIRM_WORDS = /^(sim|s|confirma|confirmo|confirmar|ok|pode|isso|certo|yes|y)$/i;

export function isInventoryAdjustConfirmText(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (CONFIRM_WORDS.test(t)) return true;
  return /\b(sim|confirma)\b/i.test(t) && t.length < 40;
}

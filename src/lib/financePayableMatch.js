/**
 * Detecta contas a pagar pendentes que coincidem com um novo lançamento de saída liquidado.
 */
import { PAYABLE_SOURCE } from './payablesAggregate.js';

function normalizeLabel(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function amountsRoughlyMatch(a, b, tolerance = 0.05) {
  const amtA = Math.round(Math.abs(Number(a) || 0) * 100) / 100;
  const amtB = Math.round(Math.abs(Number(b) || 0) * 100) / 100;
  if (amtA < 0.01 || amtB < 0.01) return false;
  if (amtA === amtB) return true;
  const max = Math.max(amtA, amtB);
  return Math.abs(amtA - amtB) / max <= tolerance;
}

export function labelsRoughlyMatch(a, b) {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 3 && right.length >= 3) {
    return left.includes(right) || right.includes(left);
  }
  return false;
}

function matchScore(item, planName) {
  let score = 0;
  if (normalizeLabel(planName) === normalizeLabel(item.vendor_label)) score += 20;
  else if (labelsRoughlyMatch(planName, item.vendor_label)) score += 10;
  if (item.status === 'overdue') score += 8;
  else if (item.status === 'due_soon') score += 4;
  const due = String(item.due_date || '').slice(0, 10);
  if (due) score += 1;
  return score;
}

/**
 * @param {Array} items — itens de payablesAggregate (fetchPayables)
 * @returns {object|null} melhor candidato com tx_id
 */
export function findMatchingPendingPayable(items, { planName, gross, category } = {}) {
  const vendor = String(planName || '').trim();
  const amount = Number(gross);
  if (!vendor || !Number.isFinite(amount) || amount <= 0) return null;

  const candidates = (items || [])
    .filter((item) => item?.source === PAYABLE_SOURCE.LANCAMENTO && item?.tx_id)
    .filter((item) => amountsRoughlyMatch(amount, item.amount))
    .filter((item) => labelsRoughlyMatch(vendor, item.vendor_label))
    .filter((item) => {
      const itemCat = String(item.category || '').trim();
      const formCat = String(category || '').trim();
      if (!itemCat || !formCat) return true;
      return normalizeLabel(itemCat) === normalizeLabel(formCat);
    })
    .sort((a, b) => matchScore(b, vendor) - matchScore(a, vendor));

  return candidates[0] || null;
}

export function formatPayableMatchDescription(item) {
  const vendor = String(item?.vendor_label || 'Conta').trim();
  const amount = Number(item?.amount || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const due = String(item?.due_date || '').slice(0, 10);
  const dueText = due
    ? `, vence em ${due.split('-').reverse().join('/')}`
    : '';
  return `Já existe uma conta a pagar pendente para ${vendor} (${amount}${dueText}). Liquidar essa conta em vez de criar um lançamento duplicado?`;
}

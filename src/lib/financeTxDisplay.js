/**
 * Exibição de FINANCIAL_TX na UI (valores sempre positivos + natureza).
 */

export function txDirection(tx) {
  if (String(tx?.direction || '').toLowerCase() === 'out') return 'out';
  if (String(tx?.type || '').toLowerCase() === 'expense') return 'out';
  return 'in';
}

export function displayGross(tx) {
  return Math.abs(Number(tx?.gross) || 0);
}

export function displayNet(tx) {
  const net = Number(tx?.net);
  if (Number.isFinite(net)) return Math.abs(net);
  return displayGross(tx);
}

export function displayFee(tx) {
  return Math.abs(Number(tx?.fee) || 0);
}

export function formatSignedMoney(value, direction) {
  const n = Math.abs(Number(value) || 0);
  let formatted;
  try {
    formatted = n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    formatted = `R$ ${n.toFixed(2).replace('.', ',')}`;
  }
  if (direction === 'out') return `− ${formatted}`;
  return `+ ${formatted}`;
}

export const NATURE_STYLES = {
  in: { color: '#3B6D11', label: 'Entrada' },
  out: { color: '#A32D2D', label: 'Saída' },
};

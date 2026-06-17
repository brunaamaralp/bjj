import { formatReconTxShortTitle } from './financeReconTxLabel.js';

function txDateYmd(tx) {
  return String(tx.settledAt || tx.settled_at || tx.createdAt || '').slice(0, 10);
}

function parseYmd(s) {
  const raw = String(s || '').trim().slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

function daysBetween(aYmd, bYmd) {
  const a = parseYmd(aYmd);
  const b = parseYmd(bYmd);
  if (!a || !b) return 999;
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000));
}

function amountWithinPercent(a, b, pct = 0.05) {
  const x = Math.abs(Number(a) || 0);
  const y = Math.abs(Number(b) || 0);
  if (x < 0.01) return false;
  return Math.abs(x - y) / x <= pct;
}

export function isOrphanCandidateForItem(tx, selectedItem) {
  if (!selectedItem || !tx) return false;
  const dayDiff = daysBetween(selectedItem.date, txDateYmd(tx));
  if (dayDiff > 3) return false;
  const gross = Math.abs(Number(tx.gross) || 0);
  return amountWithinPercent(selectedItem.amount, gross);
}

function filterBySelectedLine(orphans, selectedItem, showAll) {
  if (!selectedItem || showAll) return orphans || [];
  return (orphans || []).filter((tx) => isOrphanCandidateForItem(tx, selectedItem));
}

function formatDateBr(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return '';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function matchesQuery(tx, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;

  const title = formatReconTxShortTitle(tx).toLowerCase();
  const lead = String(tx.lead_name || '').trim().toLowerCase();
  const category = String(tx.category || '').trim().toLowerCase();
  const plan = String(tx.planName || '').trim().toLowerCase();
  const note = String(tx.note || '').trim().toLowerCase();
  const amount = Number(tx.gross || 0);
  const amountStr = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).toLowerCase();
  const amountPlain = String(amount).replace('.', ',');
  const dateBr = formatDateBr(txDateYmd(tx));

  return (
    title.includes(q) ||
    lead.includes(q) ||
    category.includes(q) ||
    plan.includes(q) ||
    note.includes(q) ||
    amountStr.includes(q) ||
    amountPlain.includes(q) ||
    dateBr.includes(q)
  );
}

function matchesDirection(tx, direction) {
  if (direction !== 'in' && direction !== 'out') return true;
  const dir = tx.direction === 'out' ? 'out' : 'in';
  return dir === direction;
}

/**
 * Filtra lançamentos Nave pendentes na conciliação.
 * @param {object[]} orphans
 * @param {{ selectedItem?: object|null, showAll?: boolean, query?: string, direction?: 'all'|'in'|'out' }} options
 */
export function filterBankReconOrphans(orphans, options = {}) {
  const { selectedItem = null, showAll = false, query = '', direction = 'all' } = options;

  return filterBySelectedLine(orphans, selectedItem, showAll)
    .filter((tx) => matchesDirection(tx, direction))
    .filter((tx) => matchesQuery(tx, query));
}

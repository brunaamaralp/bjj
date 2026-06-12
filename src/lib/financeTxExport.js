import { listFinanceTx } from './financeTxApi.js';
import { downloadCsv } from './reportsExport.js';
import {
  txDirection,
  displayGross,
  displayNet,
  displayFee,
  labelForFinanceTxType,
  NATURE_STYLES,
} from './financeTxDisplay.js';
import { formatPaymentMethod } from './paymentMethodLabels.js';
import { resolveTxBankAccount, UNALLOCATED_BANK_LABEL } from './bankAccountBalances.js';
import { txTemporalIso } from './financeCompetence.js';
import { resolveFinanceCategory, defaultCategoryForTxType } from './financeCategories.js';
import { formatSaleIdShort } from './salesHistory.js';

function formatTxDateStr(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

function formatAmountBr(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return num.toFixed(2).replace('.', ',');
}

function txStatusLabel(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'pending') return 'Pendente';
  if (st === 'settled') return 'Liquidado';
  if (st === 'cancelled') return 'Cancelado';
  return status || '';
}

function txCategoryLabel(tx, accounts) {
  const raw = String(tx.category || '').trim() || defaultCategoryForTxType(tx.type);
  const cat = resolveFinanceCategory(raw, accounts);
  return cat?.label || raw || '';
}

function txDescription(tx) {
  const plan = String(tx.planName || '').trim();
  const note = String(tx.note || '').trim();
  if (plan && note) return `${plan} — ${note}`;
  return plan || note || '';
}

function txTypeLabel(tx) {
  const t = String(tx.type || '').toLowerCase();
  if (t === 'plan') return `Plano${tx.planName ? ` • ${tx.planName}` : ''}`;
  return labelForFinanceTxType(t);
}

/** @param {object} tx @param {{ leadName?: string, accounts?: object[] }} [ctx] */
export function financeTxToCsvRow(tx, ctx = {}) {
  const dir = txDirection(tx);
  const nature = NATURE_STYLES[dir]?.label || (dir === 'out' ? 'Saída' : 'Entrada');
  const bank = String(tx.bankAccount || resolveTxBankAccount(tx) || '').trim();

  return {
    data: formatTxDateStr(txTemporalIso(tx)),
    status: txStatusLabel(tx.status),
    direcao: nature,
    categoria: txCategoryLabel(tx, ctx.accounts),
    descricao: txDescription(tx),
    aluno: ctx.leadName || '',
    valor_bruto: formatAmountBr(displayGross(tx)),
    taxa: formatAmountBr(displayFee(tx)),
    valor_liquido: formatAmountBr(displayNet(tx)),
    metodo: formatPaymentMethod(tx.method, tx.installments),
    conta: bank || '',
    competencia: String(tx.competence_month || '').trim(),
    nota: String(tx.note || '').trim(),
    id_venda: tx.saleId ? formatSaleIdShort(tx.saleId) : '',
    tipo: txTypeLabel(tx),
  };
}

/**
 * @param {object[]} transactions
 * @param {object} filters
 * @param {Map<string, string>} leadNameById
 */
export function applyFinanceTxFilters(
  transactions,
  { statusFilter = 'all', directionFilter = 'all', bankAccountFilter = 'all', search = '' },
  leadNameById = new Map()
) {
  let rows = transactions;
  if (statusFilter !== 'all') {
    rows = rows.filter((tx) => String(tx.status || '').toLowerCase() === statusFilter);
  }
  if (directionFilter !== 'all') {
    rows = rows.filter((tx) => txDirection(tx) === directionFilter);
  }
  if (bankAccountFilter !== 'all') {
    rows = rows.filter((tx) => {
      const label = String(tx.bankAccount || resolveTxBankAccount(tx) || '').trim();
      if (bankAccountFilter === UNALLOCATED_BANK_LABEL || bankAccountFilter === '__unallocated__') {
        return !label;
      }
      return label === bankAccountFilter;
    });
  }
  const q = String(search || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((tx) => {
      const name = (leadNameById.get(tx.lead_id) || '').toLowerCase();
      const cat = String(tx.category || '').toLowerCase();
      const note = String(tx.note || '').toLowerCase();
      const bank = String(tx.bankAccount || resolveTxBankAccount(tx) || '').toLowerCase();
      return name.includes(q) || cat.includes(q) || note.includes(q) || bank.includes(q);
    });
  }
  return rows;
}

export async function fetchAllFinanceTxInPeriod({ academyId, from, to, regime }) {
  const all = [];
  let cursor = null;
  for (;;) {
    const body = await listFinanceTx({
      academyId,
      from,
      to,
      cursor,
      regime,
      limit: 200,
    });
    const items = body.transactions || [];
    all.push(...items);
    if (!body.hasMore || !body.nextCursor) break;
    cursor = body.nextCursor;
  }
  return all;
}

export function exportFinanceTransactionsCsv(csvRows, { from = '', to = '' } = {}) {
  const slug = [from, to].filter(Boolean).join('_') || 'periodo';
  if (!csvRows.length) {
    downloadCsv([{ mensagem: 'Nenhum lançamento no período com os filtros atuais' }], `lancamentos-${slug}-vazio.csv`);
    return;
  }
  downloadCsv(csvRows, `lancamentos-${slug}.csv`);
}

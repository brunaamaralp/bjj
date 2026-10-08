/**
 * Grade consultiva de contas fixas (aba Cadastro em A pagar).
 * Janela: últimos 6 meses + atual + próximos 2.
 */
import { todayYmdLocal, currentYmFinance } from './financeForecastCore.js';
import { competenceMonthFromYmd, dueDateForRecurrenceMonth } from './financeRecurrenceDedup.js';
import { txDirection } from './financeTxDisplay.js';

export const CADASTRO_PAST_MONTHS = 6;
export const CADASTRO_FUTURE_MONTHS = 2;

export const CADASTRO_CELL = {
  PAID: 'paid',
  OPEN: 'open',
  OVERDUE: 'overdue',
  EMPTY: 'empty',
};

export const CADASTRO_CELL_LABELS = {
  [CADASTRO_CELL.PAID]: 'Pago',
  [CADASTRO_CELL.OPEN]: 'Em aberto',
  [CADASTRO_CELL.OVERDUE]: 'Vencido',
  [CADASTRO_CELL.EMPTY]: '—',
};

/** @param {string} ym YYYY-MM @param {number} delta */
export function addMonthsYm(ym, delta) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const base = Number(m[1]) * 12 + (Number(m[2]) - 1) + Number(delta || 0);
  const y = Math.floor(base / 12);
  const mo = (base % 12) + 1;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

/**
 * @param {string} [todayYmd]
 * @returns {string[]} YYYY-MM ascending
 */
export function buildCadastroMonthWindow(todayYmd = todayYmdLocal()) {
  const current = /^\d{4}-\d{2}-\d{2}$/.test(String(todayYmd || '').slice(0, 10))
    ? String(todayYmd).slice(0, 7)
    : currentYmFinance();
  const months = [];
  for (let i = -CADASTRO_PAST_MONTHS; i <= CADASTRO_FUTURE_MONTHS; i += 1) {
    months.push(addMonthsYm(current, i));
  }
  return months.filter(Boolean);
}

export function formatCadastroMonthLabel(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(ym || '');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const idx = Number(m[2]) - 1;
  const label = months[idx] || m[2];
  return `${label}/${String(m[1]).slice(2)}`;
}

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function vendorLabel(tx) {
  return String(tx?.planName || tx?.category || tx?.note || 'Despesa').trim() || 'Despesa';
}

function isActiveTemplate(tx) {
  if (tx?.is_recurrence_template !== true) return false;
  const st = String(tx?.status || '').toLowerCase();
  if (st === 'cancelled' || st === 'canceled') return false;
  const dir = txDirection(tx);
  if (dir !== 'out') return false;
  const type = String(tx?.recurrence_type || '').toLowerCase();
  if (type === 'none' || !type) return false;
  return true;
}

/**
 * @param {object[]} templates
 * @returns {object[]}
 */
export function selectActiveCadastroTemplates(templates = []) {
  const rows = [];
  for (const tx of templates) {
    if (!isActiveTemplate(tx)) continue;
    const id = String(tx.id || tx.$id || '').trim();
    if (!id) continue;
    rows.push({
      template_id: id,
      vendor_label: vendorLabel(tx),
      category: String(tx.category || '').trim(),
      recurrence_day: Number(tx.recurrence_day) || 1,
      amount: roundMoney(Math.abs(Number(tx.gross) || 0)),
      status: 'active',
      statusLabel: 'Ativo',
    });
  }
  rows.sort((a, b) => {
    if (a.recurrence_day !== b.recurrence_day) return a.recurrence_day - b.recurrence_day;
    return a.vendor_label.localeCompare(b.vendor_label, 'pt-BR');
  });
  return rows;
}

function instanceYm(tx) {
  const cm = String(tx?.competence_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(cm)) return cm;
  return competenceMonthFromYmd(tx?.due_date) || competenceMonthFromYmd(tx?.settledAt);
}

/**
 * Indexa instâncias (pending + settled) por templateId → ym → melhor TX.
 * Settled tem prioridade sobre pending no mesmo mês.
 */
export function indexCadastroInstances(instances = []) {
  /** @type {Map<string, Map<string, object>>} */
  const byTemplate = new Map();
  for (const tx of instances) {
    if (tx?.is_recurrence_template === true) continue;
    const tid = String(tx?.recurrence_origin_id || '').trim();
    if (!tid) continue;
    const st = String(tx?.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'canceled') continue;
    if (st !== 'settled' && st !== 'pending') continue;
    const ym = instanceYm(tx);
    if (!ym) continue;
    if (!byTemplate.has(tid)) byTemplate.set(tid, new Map());
    const byYm = byTemplate.get(tid);
    const prev = byYm.get(ym);
    if (!prev) {
      byYm.set(ym, tx);
      continue;
    }
    const prevSt = String(prev.status || '').toLowerCase();
    if (prevSt !== 'settled' && st === 'settled') byYm.set(ym, tx);
  }
  return byTemplate;
}

function classifyCell(tx, todayYmd) {
  if (!tx) return { state: CADASTRO_CELL.EMPTY, label: CADASTRO_CELL_LABELS[CADASTRO_CELL.EMPTY] };
  const st = String(tx.status || '').toLowerCase();
  if (st === 'settled') {
    return {
      state: CADASTRO_CELL.PAID,
      label: CADASTRO_CELL_LABELS[CADASTRO_CELL.PAID],
      amount: roundMoney(Math.abs(Number(tx.gross) || 0)),
      settled_at: tx.settledAt || null,
      due_date: tx.due_date || null,
      tx_id: String(tx.id || tx.$id || '').trim() || undefined,
    };
  }
  const due = String(tx.due_date || '').slice(0, 10);
  const overdue = due && due < todayYmd;
  const state = overdue ? CADASTRO_CELL.OVERDUE : CADASTRO_CELL.OPEN;
  return {
    state,
    label: CADASTRO_CELL_LABELS[state],
    amount: roundMoney(Math.abs(Number(tx.gross) || 0)),
    due_date: due || null,
    tx_id: String(tx.id || tx.$id || '').trim() || undefined,
  };
}

/**
 * @param {{ templates?: object[], instances?: object[], today?: string }} opts
 */
export function buildPayablesCadastroGrid({
  templates = [],
  instances = [],
  today = todayYmdLocal(),
} = {}) {
  const todayYmd = String(today || todayYmdLocal()).slice(0, 10);
  const months = buildCadastroMonthWindow(todayYmd);
  const rows = selectActiveCadastroTemplates(templates);
  const indexed = indexCadastroInstances(instances);

  const gridRows = rows.map((row) => {
    const byYm = indexed.get(row.template_id) || new Map();
    /** @type {Record<string, object>} */
    const cells = {};
    for (const ym of months) {
      cells[ym] = classifyCell(byYm.get(ym), todayYmd);
    }
    return { ...row, cells };
  });

  return {
    months,
    monthLabels: months.map((ym) => ({ ym, label: formatCadastroMonthLabel(ym) })),
    rows: gridRows,
    activeCount: gridRows.length,
  };
}

/** Due civil esperado do template no mês (para tooltips vazios futuros). */
export function expectedDueForCadastroCell(template, ym) {
  const day = Number(template?.recurrence_day) || 1;
  return dueDateForRecurrenceMonth(day, ym);
}

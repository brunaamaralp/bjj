/**
 * Agregação de contas a pagar (saídas pendentes, templates e projeções).
 */
import { txDirection } from './financeTxDisplay.js';
import { projectRecurrenceOccurrences, todayYmdLocal, addDaysYmd } from './financeForecastCore.js';
import {
  dueDateForRecurrenceMonth,
  competenceMonthFromYmd,
  hasAnyPendingInstanceForTemplate,
  hasPendingInstanceForPeriod,
} from './financeRecurrenceDedup.js';

export const PAYABLE_SOURCE = {
  LANCAMENTO: 'lancamento',
  RECORRENCIA: 'recorrencia',
  TEMPLATE: 'template',
};

export const PAYABLE_SOURCE_LABELS = {
  [PAYABLE_SOURCE.LANCAMENTO]: 'Conta pendente',
  [PAYABLE_SOURCE.RECORRENCIA]: 'Recorrente projetada',
  [PAYABLE_SOURCE.TEMPLATE]: 'Conta programada',
};

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function txPayableDueYmd(tx) {
  if (tx?.due_date) return String(tx.due_date).slice(0, 10);
  const cm = String(tx?.competence_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(cm)) return `${cm}-28`;
  return null;
}

export function classifyPayableStatus(dueYmd, todayYmd = todayYmdLocal()) {
  const due = String(dueYmd || '').slice(0, 10);
  const today = String(todayYmd || '').slice(0, 10);
  if (!due) return 'open';
  if (due < today) return 'overdue';
  if (due <= addDaysYmd(today, 7)) return 'due_soon';
  return 'open';
}

function vendorLabel(tx) {
  return String(tx?.planName || tx?.category || tx?.note || 'Despesa').trim() || 'Despesa';
}

function mapPendingItem(tx, todayYmd) {
  const txId = String(tx.id || tx.$id || '').trim();
  const due = txPayableDueYmd(tx);
  const amount = roundMoney(Math.abs(Number(tx.gross) || 0));
  if (amount < 0.01) return null;

  return {
    id: `tx:${txId || due}`,
    source: PAYABLE_SOURCE.LANCAMENTO,
    sourceLabel: PAYABLE_SOURCE_LABELS[PAYABLE_SOURCE.LANCAMENTO],
    vendor_label: vendorLabel(tx),
    category: String(tx.category || '').trim(),
    amount,
    due_date: due,
    status: classifyPayableStatus(due, todayYmd),
    tx_id: txId || undefined,
    template_id: String(tx.recurrence_origin_id || '').trim() || undefined,
    recurrence: tx.recurrence_origin_id
      ? { active: true, type: 'generated', day: null }
      : null,
    linkTab: 'a-pagar',
    linkSection: 'contas-fixas',
  };
}

/** FINANCIAL_TX pendentes de saída. */
export function buildPendingPayableItems(transactions = [], { today = todayYmdLocal() } = {}) {
  const todayYmd = String(today || todayYmdLocal()).slice(0, 10);
  const items = [];
  for (const tx of transactions) {
    const st = String(tx?.status || '').toLowerCase();
    if (st !== 'pending') continue;
    if (tx.is_recurrence_template === true) continue;
    const dir = txDirection(tx);
    const type = String(tx?.type || '').toLowerCase();
    if (dir !== 'out' && type !== 'expense' && type !== 'expense_operational' && type !== 'expense_financial') {
      continue;
    }
    const row = mapPendingItem(tx, todayYmd);
    if (row) items.push(row);
  }
  return items;
}

function nextDueForTemplate(template, todayYmd) {
  const day = Number(template.recurrence_day) || 1;
  const type = String(template.recurrence_type || 'monthly').toLowerCase();
  if (type === 'weekly') {
    const from = todayYmd;
    const to = addDaysYmd(todayYmd, 42);
    const occ = projectRecurrenceOccurrences(
      {
        gross: template.gross,
        recurrence_type: template.recurrence_type,
        recurrence_day: template.recurrence_day,
        base_date: template.due_date || txPayableDueYmd(template) || todayYmd,
        _flow: 'out',
      },
      from,
      to
    );
    return occ[0]?.due_date || null;
  }
  const today = String(todayYmd).slice(0, 10);
  const [y, m] = today.split('-').map(Number);
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(y, m - 1 + i, 1, 12, 0, 0, 0);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const due = dueDateForRecurrenceMonth(day, ym);
    if (due && due >= today) return due;
  }
  return dueDateForRecurrenceMonth(day, today.slice(0, 7));
}

/** Templates recorrentes ativos (contas programadas). */
export function buildTemplatePayableItems(templates = [], { today = todayYmdLocal(), pending = [] } = {}) {
  const todayYmd = String(today || todayYmdLocal()).slice(0, 10);
  const items = [];
  for (const tx of templates) {
    if (tx.is_recurrence_template !== true) continue;
    const dir = txDirection(tx);
    if (dir !== 'out') continue;
    const type = String(tx.recurrence_type || '').toLowerCase();
    if (type === 'none' || !type) continue;

    const templateId = String(tx.id || tx.$id || '').trim();
    if (hasAnyPendingInstanceForTemplate(pending, templateId)) continue;

    const nextDue = nextDueForTemplate(tx, todayYmd);
    const nextCm = competenceMonthFromYmd(nextDue);
    if (nextCm && hasPendingInstanceForPeriod(pending, templateId, nextCm)) continue;

    const amount = roundMoney(Math.abs(Number(tx.gross) || 0));
    if (amount < 0.01) continue;

    items.push({
      id: `template:${templateId}`,
      source: PAYABLE_SOURCE.TEMPLATE,
      sourceLabel: PAYABLE_SOURCE_LABELS[PAYABLE_SOURCE.TEMPLATE],
      vendor_label: vendorLabel(tx),
      category: String(tx.category || '').trim(),
      amount,
      due_date: nextDue,
      status: classifyPayableStatus(nextDue, todayYmd),
      template_id: templateId,
      recurrence: {
        active: true,
        type,
        day: Number(tx.recurrence_day) || 1,
      },
      linkTab: 'a-pagar',
      linkSection: 'contas-fixas',
    });
  }
  return items;
}

/** Projeções futuras sem instância pending (visão / previsão operacional). */
export function buildProjectedPayableItems(
  templates = [],
  fromYmd,
  toYmd,
  pending = [],
  { today = todayYmdLocal() } = {}
) {
  const todayYmd = String(today || todayYmdLocal()).slice(0, 10);
  const items = [];
  for (const tx of templates) {
    if (tx.is_recurrence_template !== true) continue;
    if (txDirection(tx) !== 'out') continue;

    const templateId = String(tx.id || tx.$id || '').trim();
    const occurrences = projectRecurrenceOccurrences(
      {
        gross: tx.gross,
        recurrence_type: tx.recurrence_type,
        recurrence_day: tx.recurrence_day,
        base_date: tx.due_date || txPayableDueYmd(tx) || fromYmd,
        label: vendorLabel(tx),
        category: tx.category,
        _flow: 'out',
      },
      fromYmd,
      toYmd
    );

    for (const occ of occurrences) {
      if (!occ.due_date || occ.due_date < todayYmd) continue;
      const cm = competenceMonthFromYmd(occ.due_date);
      if (cm && hasPendingInstanceForPeriod(pending, templateId, cm)) continue;

      items.push({
        id: `proj:${templateId}:${occ.due_date}`,
        source: PAYABLE_SOURCE.RECORRENCIA,
        sourceLabel: PAYABLE_SOURCE_LABELS[PAYABLE_SOURCE.RECORRENCIA],
        vendor_label: String(occ.label || vendorLabel(tx)).trim(),
        category: String(tx.category || '').trim(),
        amount: roundMoney(occ.amount),
        due_date: occ.due_date,
        status: classifyPayableStatus(occ.due_date, todayYmd),
        template_id: templateId,
        recurrence: {
          active: true,
          type: String(tx.recurrence_type || 'monthly'),
          day: Number(tx.recurrence_day) || 1,
        },
        linkTab: 'a-pagar',
        linkSection: 'contas-fixas',
      });
    }
  }
  return items;
}

export function mergePayableItems(...groups) {
  const rows = groups.flat().filter(Boolean);
  rows.sort((a, b) => {
    const da = String(a.due_date || '9999-99-99');
    const db = String(b.due_date || '9999-99-99');
    if (da !== db) return da.localeCompare(db);
    return String(a.vendor_label || '').localeCompare(String(b.vendor_label || ''), 'pt-BR');
  });
  return rows;
}

/** Summary KPIs: pending + projected, plus templates only when not already covered. */
export function buildPayablesSummaryItems(pending = [], templates = [], projected = []) {
  const rows = mergePayableItems(pending, projected);
  const covered = new Set();
  for (const it of rows) {
    const tid = String(it.template_id || '').trim();
    const due = String(it.due_date || '').slice(0, 10);
    if (tid && due) covered.add(`${tid}|${due}`);
  }
  const extraTemplates = templates.filter((tpl) => {
    const tid = String(tpl.template_id || tpl.tx_id || '').trim();
    const due = String(tpl.due_date || '').slice(0, 10);
    if (!tid || !due) return true;
    return !covered.has(`${tid}|${due}`);
  });
  return mergePayableItems(rows, extraTemplates);
}

export function summarizePayables(items = [], { today = todayYmdLocal() } = {}) {
  void today;
  let totalOpen = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let dueSoonCount = 0;
  let dueSoonAmount = 0;
  let activeTemplates = 0;

  for (const it of items) {
    if (it.source === PAYABLE_SOURCE.TEMPLATE) activeTemplates += 1;
    const amt = roundMoney(it.amount);
    if (it.source === PAYABLE_SOURCE.TEMPLATE) continue;
    totalOpen += amt;
    if (it.status === 'overdue') {
      overdueCount += 1;
      overdueAmount += amt;
    } else if (it.status === 'due_soon') {
      dueSoonCount += 1;
      dueSoonAmount += amt;
    }
  }

  for (const it of items) {
    if (it.source !== PAYABLE_SOURCE.TEMPLATE) continue;
    const amt = roundMoney(it.amount);
    totalOpen += amt;
    if (it.status === 'overdue') {
      overdueCount += 1;
      overdueAmount += amt;
    } else if (it.status === 'due_soon') {
      dueSoonCount += 1;
      dueSoonAmount += amt;
    }
  }

  return {
    totalOpen: roundMoney(totalOpen),
    overdueCount,
    overdueAmount: roundMoney(overdueAmount),
    dueSoonCount,
    dueSoonAmount: roundMoney(dueSoonAmount),
    activeTemplates,
    count: items.length,
  };
}

export function filterPayablesForSection(section, items = []) {
  const s = String(section || '').trim().toLowerCase();
  if (s === 'vencidas') {
    return items.filter((it) => it.status === 'overdue' && it.source !== PAYABLE_SOURCE.TEMPLATE);
  }
  if (s === 'contas-fixas') {
    return items.filter(
      (it) =>
        it.source === PAYABLE_SOURCE.LANCAMENTO ||
        it.source === PAYABLE_SOURCE.TEMPLATE ||
        it.source === PAYABLE_SOURCE.RECORRENCIA
    );
  }
  return items;
}

export function filterPayablesSearch(items = [], search = '') {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    const hay = `${it.vendor_label || ''} ${it.category || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Blocos completos (pendentes, templates, projeções) para filtrar seção no cliente. */
export function buildPayablesCatalog({
  pendingTransactions = [],
  recurrenceTemplates = [],
  fromYmd,
  toYmd,
  today,
}) {
  const todayYmd = String(today || todayYmdLocal()).slice(0, 10);
  const from = String(fromYmd || todayYmd).slice(0, 10);
  const to = String(toYmd || addDaysYmd(todayYmd, 30)).slice(0, 10);

  const pending = buildPendingPayableItems(pendingTransactions, { today: todayYmd });
  const templates = buildTemplatePayableItems(recurrenceTemplates, {
    today: todayYmd,
    pending: pendingTransactions,
  });
  const projected = buildProjectedPayableItems(
    recurrenceTemplates,
    from,
    to,
    pendingTransactions,
    { today: todayYmd }
  );

  const summarySource = buildPayablesSummaryItems(pending, templates, projected);
  const summary = summarizePayables(summarySource, { today: todayYmd });

  return { pending, templates, projected, summary, from, to };
}

export function selectPayablesItems(catalog, section = 'visao') {
  const s = String(section || '').trim().toLowerCase();
  const pending = catalog?.pending || [];
  const templates = catalog?.templates || [];
  const projected = catalog?.projected || [];
  if (s === 'contas-fixas') {
    return mergePayableItems(pending, templates);
  }
  if (s === 'vencidas') {
    return mergePayableItems(pending).filter((it) => it.status === 'overdue');
  }
  return mergePayableItems(pending, projected.slice(0, 24));
}

export function buildPayablesSnapshot({
  pendingTransactions = [],
  recurrenceTemplates = [],
  fromYmd,
  toYmd,
  today,
  section = 'visao',
}) {
  const catalog = buildPayablesCatalog({
    pendingTransactions,
    recurrenceTemplates,
    fromYmd,
    toYmd,
    today,
  });
  const items = selectPayablesItems(catalog, section);
  return { items, summary: catalog.summary, from: catalog.from, to: catalog.to, section };
}

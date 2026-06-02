/** Utilitários para importação em lote de lançamentos do Caixa via planilha. */

import {
  FINANCE_CATEGORIES,
  resolveFinanceCategory,
} from './financeCategories.js';
import { competenceMonthFromIso, parseCompetenceMonth } from './financeCompetence.js';
import { columnMappingFromAi, columnConfidenceFromAi, parseNumberCell } from './productImport.js';

export { columnMappingFromAi, columnConfidenceFromAi };
export const MAX_FINANCE_TX_IMPORT_ROWS = 500;

export const FINANCE_TX_IMPORT_FIELD_OPTIONS = [
  { value: '', label: 'Ignorar' },
  { value: 'date', label: 'Data *' },
  { value: 'amount', label: 'Valor *' },
  { value: 'student_name', label: 'Aluno' },
  { value: 'direction', label: 'Natureza (entrada/saída)' },
  { value: 'category', label: 'Categoria' },
  { value: 'note', label: 'Descrição / nota' },
  { value: 'method', label: 'Forma de pagamento' },
  { value: 'competence_month', label: 'Mês competência (YYYY-MM)' },
];

const FIELD_LABEL = Object.fromEntries(
  FINANCE_TX_IMPORT_FIELD_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

export function financeTxFieldLabel(field) {
  return FIELD_LABEL[field] || field;
}

/** Nome do aluno normalizado para comparação de duplicatas. */
export function normalizeImportStudentName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Chave estável: data civil + valor + aluno. */
export function financeTxDedupKey({ dateIso, amount, studentName }) {
  const ymd = String(dateIso || '').slice(0, 10);
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  const name = normalizeImportStudentName(studentName);
  if (!ymd || amt < 0.01 || !name) return null;
  return `${ymd}|${amt.toFixed(2)}|${name}`;
}

export function paymentDateKeyForDedup(payment) {
  if (payment?.paid_at) return String(payment.paid_at).slice(0, 10);
  if (payment?.paidAt) return String(payment.paidAt).slice(0, 10);
  if (payment?.due_date) return String(payment.due_date).slice(0, 10);
  if (payment?.dueDate) return String(payment.dueDate).slice(0, 10);
  const ref = String(payment?.reference_month || payment?.referenceMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(ref)) return `${ref}-01`;
  return null;
}

function txDateKeyForDedup(tx) {
  if (tx?.settledAt) return String(tx.settledAt).slice(0, 10);
  if (tx?.createdAt) return String(tx.createdAt).slice(0, 10);
  return null;
}

function paymentEligibleForDedup(payment) {
  const status = String(payment?.status || '').toLowerCase();
  return status === 'paid' || status === 'partial';
}

function txEligibleForDedup(tx) {
  const status = String(tx?.status || '').toLowerCase();
  return status !== 'cancelled' && status !== 'canceled';
}

/** Monta chaves de lançamentos/mensalidades já existentes no sistema. */
export function collectExistingFinanceTxDedupKeys({
  transactions = [],
  payments = [],
  studentNameById = {},
}) {
  const keys = new Set();

  for (const tx of transactions) {
    if (!txEligibleForDedup(tx)) continue;
    const leadId = String(tx.lead_id || tx.leadId || '').trim();
    const studentName = studentNameById[leadId] || '';
    const dateIso = txDateKeyForDedup(tx);
    const amount = Math.abs(Number(tx.gross ?? tx.net ?? 0));
    const key = financeTxDedupKey({ dateIso, amount, studentName });
    if (key) keys.add(key);
  }

  for (const payment of payments) {
    if (!paymentEligibleForDedup(payment)) continue;
    const leadId = String(payment.lead_id || payment.leadId || '').trim();
    const studentName = studentNameById[leadId] || '';
    const dateIso = paymentDateKeyForDedup(payment);
    const amount = Number(payment.amount ?? payment.paid_amount ?? payment.paidAmount ?? 0);
    const key = financeTxDedupKey({ dateIso, amount, studentName });
    if (key) keys.add(key);
  }

  return keys;
}

/** Marca duplicatas no preview (sistema ou mesmo arquivo). */
export function markFinanceTxImportDuplicates(rows, existingKeys = new Set()) {
  const sessionKeys = new Set();
  return (rows || []).map((row) => {
    if (row.status !== 'ready') return row;
    const key = financeTxDedupKey({
      dateIso: row.data?.dateIso,
      amount: row.data?.amount,
      studentName: row.data?.studentName,
    });
    if (!key) return row;
    if (existingKeys.has(key)) {
      return {
        ...row,
        status: 'duplicate',
        selected: false,
        duplicateReason: 'existing',
        error: 'Já lançado (mesma data, valor e aluno)',
      };
    }
    if (sessionKeys.has(key)) {
      return {
        ...row,
        status: 'duplicate',
        selected: false,
        duplicateReason: 'file',
        error: 'Duplicado no arquivo (mesma data, valor e aluno)',
      };
    }
    sessionKeys.add(key);
    return row;
  });
}

export function monthsInDateRange(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return [];
  const months = new Set();
  const start = new Date(`${fromYmd}T12:00:00`);
  const end = new Date(`${toYmd}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    months.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return [...months];
}

export function dateRangeFromFinanceTxRows(rows) {
  let from = null;
  let to = null;
  for (const row of rows || []) {
    const ymd = String(row?.data?.dateIso || '').slice(0, 10);
    if (!ymd) continue;
    if (!from || ymd < from) from = ymd;
    if (!to || ymd > to) to = ymd;
  }
  return { from, to };
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseDateYmd(raw) {
  if (raw == null || raw === '') return null;

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + raw * 86400000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
  }

  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (br) {
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

function dateToIso(ymd) {
  if (!ymd) return null;
  return `${ymd}T12:00:00.000Z`;
}

function parseDirectionCell(raw, amount) {
  const s = normalizeHeader(raw);
  if (s) {
    if (['entrada', 'in', 'receita', 'credito', 'crédito', 'recebimento', 'receber'].some((k) => s.includes(k))) {
      return 'in';
    }
    if (['saida', 'saída', 'out', 'despesa', 'debito', 'débito', 'pagamento', 'pagar'].some((k) => s.includes(k))) {
      return 'out';
    }
  }
  if (Number.isFinite(amount) && amount < 0) return 'out';
  if (Number.isFinite(amount) && amount > 0) return 'in';
  return null;
}

function parseMethodCell(raw) {
  const s = normalizeHeader(raw);
  if (!s) return 'pix';
  if (s.includes('pix')) return 'pix';
  if (s.includes('dinheiro') || s.includes('cash') || s.includes('especie')) return 'dinheiro';
  if (s.includes('debito') || s.includes('débito')) return 'cartao_debito';
  if (s.includes('credito') || s.includes('crédito') || s.includes('cartao')) return 'cartao_credito';
  if (s.includes('transfer') || s.includes('ted') || s.includes('doc')) return 'transferencia';
  if (s.includes('boleto')) return 'boleto';
  if (s.includes('link')) return 'link_pagamento';
  return 'outro';
}

function parseCompetenceCell(raw, dateIso) {
  const explicit = parseCompetenceMonth(raw);
  if (explicit) return explicit;
  return competenceMonthFromIso(dateIso);
}

function pickCell(rawRow, columnToField, field) {
  for (const [col, f] of Object.entries(columnToField)) {
    if (f === field) return rawRow[col];
  }
  return undefined;
}

export function rowToFinanceTxData(rawRow, columnToField) {
  const amountRaw = pickCell(rawRow, columnToField, 'amount');
  const amount = parseNumberCell(amountRaw);
  const direction = parseDirectionCell(pickCell(rawRow, columnToField, 'direction'), amount);
  const ymd = parseDateYmd(pickCell(rawRow, columnToField, 'date'));
  const dateIso = dateToIso(ymd);

  const categoryRaw = String(pickCell(rawRow, columnToField, 'category') ?? '').trim();
  let category = categoryRaw;
  if (!category) {
    category =
      direction === 'out'
        ? FINANCE_CATEGORIES.OUTRAS_DESPESAS.label
        : FINANCE_CATEGORIES.OUTROS_RECEITA.label;
  }

  const resolved = resolveFinanceCategory(category);
  if (resolved && direction) {
    const resolvedOut =
      resolved.type === 'expense_operational' ||
      resolved.type === 'expense_financial' ||
      resolved.type === 'stock_purchase' ||
      resolved.type === 'card_fee' ||
      resolved.type === 'expense';
    if (direction === 'in' && resolvedOut) {
      category = FINANCE_CATEGORIES.OUTROS_RECEITA.label;
    } else if (direction === 'out' && !resolvedOut && resolved.type !== 'refund') {
      category = FINANCE_CATEGORIES.OUTRAS_DESPESAS.label;
    } else {
      category = resolved.label;
    }
  } else if (resolved) {
    category = resolved.label;
  }

  const note = String(pickCell(rawRow, columnToField, 'note') ?? '').trim();
  const studentName = String(pickCell(rawRow, columnToField, 'student_name') ?? '').trim();
  const method = parseMethodCell(pickCell(rawRow, columnToField, 'method'));
  const competence_month = parseCompetenceCell(
    pickCell(rawRow, columnToField, 'competence_month'),
    dateIso
  );

  return {
    dateIso,
    amount: amount != null ? Math.abs(amount) : null,
    direction: direction || 'in',
    category,
    note,
    studentName,
    method,
    competence_month,
  };
}

export function classifyFinanceTxRow(data) {
  if (!data?.dateIso) return 'invalid';
  if (!Number.isFinite(data.amount) || data.amount < 0.01) return 'invalid';
  if (!data.category) return 'incomplete';
  return 'ready';
}

export function buildFinanceTxPreviewRows(dataRows, columnToField) {
  return (dataRows || []).map((raw, index) => {
    const data = rowToFinanceTxData(raw, columnToField);
    const status = classifyFinanceTxRow(data);
    return {
      id: `row-${index}`,
      raw,
      data,
      status,
      selected: status === 'ready',
      error: status === 'invalid' ? 'Data ou valor inválido' : '',
    };
  });
}

export function countFinanceTxByStatus(rows) {
  const counts = { ready: 0, incomplete: 0, invalid: 0, duplicate: 0 };
  for (const r of rows || []) {
    if (counts[r.status] != null) counts[r.status] += 1;
  }
  return counts;
}

export function financeTxRowToPayload(data) {
  const cat = resolveFinanceCategory(data.category) || FINANCE_CATEGORIES.OUTROS_RECEITA;
  return {
    type: cat.type,
    category: cat.label,
    gross: data.amount,
    fee: 0,
    method: data.method || 'pix',
    note: data.note || '',
    receive_now: true,
    settledAt: data.dateIso,
    competence_month: data.competence_month || competenceMonthFromIso(data.dateIso),
    origin_type: 'spreadsheet_import',
  };
}

export function downloadFinanceTxImportTemplate() {
  const headers = ['Data', 'Valor Recebido', 'Aluno', 'Natureza', 'Categoria', 'Descrição', 'Forma de pagamento'];
  const sampleRows = [
    ['15/05/2025', '350,00', 'João Silva', 'Entrada', 'Mensalidades', 'Mensalidade João', 'PIX'],
    ['20/05/2025', '-120,00', 'Saída', 'Marketing', 'Anúncio Instagram', 'Cartão de crédito'],
  ];
  const csv = [headers, ...sampleRows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo-lancamentos-caixa-nave.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

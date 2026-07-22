/**
 * Importação CSV de contas a pagar (contas fixas / pendentes).
 */
import { resolveFinanceCategory, FINANCE_CATEGORIES } from './financeCategories.js';
import { encodeAccountCategoryValue } from './financeAccountCategories.js';
import { parseNumberCell } from './productImport.js';

export const MAX_PAYABLES_IMPORT_ROWS = 200;
export const PAYABLES_IMPORT_CONCURRENCY = 5;

export const PAYABLES_IMPORT_HEADERS = [
  'fornecedor',
  'categoria',
  'valor',
  'vencimento',
  'recorrente',
  'dia_recorrencia',
];

const HEADER_ALIASES = {
  fornecedor: ['fornecedor', 'vendor', 'descricao', 'descrição', 'nome'],
  categoria: ['categoria', 'category'],
  valor: ['valor', 'amount', 'value', 'preco', 'preço'],
  vencimento: ['vencimento', 'due_date', 'data', 'data_vencimento'],
  recorrente: ['recorrente', 'repeat', 'mensal', 'fixa'],
  dia_recorrencia: ['dia_recorrencia', 'dia', 'recurrence_day', 'dia_vencimento'],
};

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

export function mapPayablesImportColumns(headers = []) {
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (let i = 0; i < headers.length; i += 1) {
      const h = normalizeHeader(headers[i]);
      if (aliases.includes(h)) {
        map[field] = i;
        break;
      }
    }
  }
  return map;
}

function parseDateCell(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (br) {
    const dd = String(br[1]).padStart(2, '0');
    const mm = String(br[2]).padStart(2, '0');
    return `${br[3]}-${mm}-${dd}`;
  }
  return null;
}

function parseBoolCell(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return ['sim', 's', 'yes', 'y', '1', 'true', 'x'].includes(s);
}

function resolvePayableCategoryPersisted(raw, accounts = null) {
  const cat =
    resolveFinanceCategory(raw, accounts, { direction: 'out' }) || FINANCE_CATEGORIES.OUTRAS_DESPESAS;
  const categoryValue = cat.isAccountCategory
    ? encodeAccountCategoryValue(cat.accountCode)
    : cat.label;
  return { cat, categoryValue };
}

export function buildPayablesImportPreviewRows(rows, columnMap, accounts = null) {
  const preview = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const vendor = String(row[columnMap.fornecedor] ?? '').trim();
    const categoryRaw = String(row[columnMap.categoria] ?? '').trim();
    const amount = parseNumberCell(row[columnMap.valor]);
    const due = parseDateCell(row[columnMap.vencimento]);
    const recurring = columnMap.recorrente != null ? parseBoolCell(row[columnMap.recorrente]) : false;
    const dayRaw = Number(row[columnMap.dia_recorrencia]);
    const recurrenceDay =
      Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 28
        ? Math.floor(dayRaw)
        : due
          ? Number(due.split('-')[2])
          : 10;

    const errors = [];
    if (!vendor) errors.push('Fornecedor obrigatório');
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Valor inválido');
    if (!due) errors.push('Vencimento inválido (use AAAA-MM-DD ou DD/MM/AAAA)');

    const { categoryValue } = resolvePayableCategoryPersisted(categoryRaw, accounts);

    preview.push({
      rowIndex: i + 1,
      vendor,
      category: categoryValue,
      amount,
      due_date: due,
      recurring,
      recurrence_day: recurrenceDay,
      errors,
      valid: errors.length === 0,
    });
  }
  return preview.slice(0, MAX_PAYABLES_IMPORT_ROWS);
}

/** Chave estável para dedupe: fornecedor + vencimento + valor. */
export function payablesImportMatchKey({ vendor, due_date, amount }) {
  const v = String(vendor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const d = String(due_date || '').slice(0, 10);
  const a = Math.round((Number(amount) || 0) * 100) / 100;
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(d) || a < 0.01) return null;
  return `${v}|${d}|${a.toFixed(2)}`;
}

/**
 * Marca duplicatas no arquivo e contra chaves já existentes (contas pendentes).
 */
export function markPayablesImportDuplicates(rows, existingKeys = new Set()) {
  const seenInFile = new Set();
  return rows.map((row) => {
    if (!row.valid) return row;
    const key = payablesImportMatchKey(row);
    if (!key) return row;
    if (seenInFile.has(key)) {
      return {
        ...row,
        valid: false,
        errors: [...row.errors, 'Duplicada no arquivo'],
        duplicate: true,
      };
    }
    if (existingKeys.has(key)) {
      return {
        ...row,
        valid: false,
        errors: [...row.errors, 'Já cadastrada no sistema'],
        duplicate: true,
      };
    }
    seenInFile.add(key);
    return row;
  });
}

export function collectPayablesImportExistingKeys(items = []) {
  const keys = new Set();
  for (const it of items) {
    const key = payablesImportMatchKey({
      vendor: it.vendor_label || it.planName,
      due_date: it.due_date,
      amount: it.amount,
    });
    if (key) keys.add(key);
  }
  return keys;
}

export function payableImportRowToPayload(row, accounts = null) {
  const { cat, categoryValue } = resolvePayableCategoryPersisted(row.category, accounts);
  const payload = {
    direction: 'out',
    type: cat.type,
    category: categoryValue,
    planName: row.vendor,
    gross: row.amount,
    due_date: row.due_date,
    competence_month: String(row.due_date || '').slice(0, 7),
    receive_now: false,
    method: 'pix',
  };
  if (row.recurring) {
    payload.is_recurrence_template = true;
    payload.recurrence_type = 'monthly';
    payload.recurrence_day = row.recurrence_day || Number(String(row.due_date).slice(8, 10)) || 10;
  }
  return payload;
}

export function downloadPayablesImportTemplate() {
  const header = PAYABLES_IMPORT_HEADERS.join(';');
  const sample = 'CPFL;Luz / energia;450,00;2026-06-10;sim;10';
  const blob = new Blob([`${header}\n${sample}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-contas-a-pagar.csv';
  a.click();
  URL.revokeObjectURL(url);
}

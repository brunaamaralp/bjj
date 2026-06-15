/**
 * Campos e normalização de FINANCIAL_TX (Caixa).
 * Mensalidade paga → entrada automática no Caixa; mensalidade pendente não gera lançamento pendente.
 */

import { competenceMonthFromIso, parseCompetenceMonth } from '../../src/lib/financeCompetence.js';
import {
  defaultCategoryForTxType,
  normalizeFinanceCategory,
} from '../../src/lib/financeCategories.js';
import { FINANCE_BANK_NOTE_PREFIX } from '../../src/lib/bankAccountBalances.js';

export const FINANCIAL_TX_MIN = 0.01;
export const FINANCIAL_TX_MAX = 5_000_000;

export const RECURRENCE_TYPES = new Set(['none', 'monthly', 'weekly']);

/** Prefixo na note quando FINANCIAL_TX não tem atributo `category` no Appwrite. */
export const FINANCE_CAT_NOTE_PREFIX = '@cat:';

/** Campos que existem na coleção FINANCIAL_TX legada (finance_tx / vendas). */
export const FINANCIAL_TX_CORE_ATTRS = [
  'academyId',
  'saleId',
  'method',
  'installments',
  'type',
  'planName',
  'gross',
  'fee',
  'net',
  'status',
  'settledAt',
  'note',
];

const OPTIONAL_FINANCIAL_TX_ATTRS = [
  'category',
  'lead_id',
  'competence_month',
  'direction',
  'origin_type',
  'origin_id',
  'created_by',
  'updated_by',
  'updated_at',
  'recurrence_origin_id',
  'recurrence_type',
  'recurrence_day',
  'recurrence_end',
  'is_recurrence_template',
  'reconciled',
  'reconciled_at',
  'reconciled_by',
  'bank_statement_id',
  'bank_account',
];

const FINANCE_TX_METADATA_ATTRS = [
  'created_by',
  'createdBy',
  'updated_by',
  'updatedBy',
  'updated_at',
  'updatedAt',
];

export function financeBankAccountFromDoc(doc) {
  const direct = String(doc?.bank_account ?? doc?.bankAccount ?? '').trim();
  if (direct) return direct.slice(0, 128);
  const note = String(doc?.note || '');
  const match = note.match(/^@bank:([^\n]+)/m);
  if (match) return String(match[1] || '').trim().slice(0, 128);
  return '';
}

export function financeUserNoteFromStored(note) {
  return String(note || '')
    .replace(/^@cat:[^\n]+\n?/, '')
    .replace(/^@bank:[^\n]+\n?/, '')
    .trim();
}

export function financeNoteForStorage(categoryLabel, userNote, bankAccount = '') {
  const cat = String(categoryLabel || '').trim();
  const bank = String(bankAccount || '').trim().slice(0, 128);
  let body = financeUserNoteFromStored(userNote);
  const parts = [];
  if (cat) parts.push(`${FINANCE_CAT_NOTE_PREFIX}${cat}`);
  if (bank) parts.push(`${FINANCE_BANK_NOTE_PREFIX}${bank}`);
  if (!parts.length) return body.slice(0, 2000);
  const prefix = `${parts.join('\n')}\n`;
  const combined = body ? `${prefix}${body}` : prefix.trimEnd();
  return combined.slice(0, 2000);
}

export function financeCategoryLabelFromDoc(doc) {
  const direct = String(doc?.category ?? '').trim();
  if (direct) return normalizeFinanceCategory(direct);
  const note = String(doc?.note || '');
  if (note.startsWith(FINANCE_CAT_NOTE_PREFIX)) {
    const firstLine = note.split('\n')[0];
    return normalizeFinanceCategory(firstLine.slice(FINANCE_CAT_NOTE_PREFIX.length).trim());
  }
  return defaultCategoryForTxType(doc?.type || '');
}

/**
 * Normaliza @cat:/@bank: da note para atributos nativos (idempotente).
 * @returns {object|null} patch para Appwrite ou null se já normalizado
 */
export function financeTxMetadataNormalizationPatch(doc) {
  const note = String(doc?.note || '');
  const hasCatPrefix = /^@cat:/m.test(note);
  const hasBankPrefix = /^@bank:/m.test(note);
  if (!hasCatPrefix && !hasBankPrefix) return null;

  const directCat = String(doc?.category ?? '').trim();
  const directBank = String(doc?.bank_account ?? doc?.bankAccount ?? '').trim();
  const cat = directCat || financeCategoryLabelFromDoc(doc);
  const bank = directBank || financeBankAccountFromDoc(doc);
  const userNote = financeUserNoteFromStored(note);

  const patch = { note: userNote.slice(0, 2000) };
  if (!directCat && cat) patch.category = cat;
  if (!directBank && bank) patch.bank_account = bank;
  return patch;
}

/** Payload gravado no Appwrite: só atributos core + categoria embutida na note. */
export function financeTxDocumentForAppwrite(payload) {
  const category = payload.category;
  const bankAccount = String(payload.bank_account || payload.bankAccount || '').trim();
  const userNote = financeUserNoteFromStored(payload.note);
  const doc = {};
  for (const key of FINANCIAL_TX_CORE_ATTRS) {
    if (payload[key] !== undefined) doc[key] = payload[key];
  }
  if (category || bankAccount) {
    doc.note = financeNoteForStorage(category, userNote, bankAccount);
  } else if (userNote) {
    doc.note = userNote.slice(0, 2000);
  }
  return doc;
}

/** Core + atributos opcionais conhecidos (create/update). */
export function financeTxDocumentWithOptionals(payload) {
  return {
    ...financeTxDocumentForAppwrite(payload),
    ...financeTxOptionalPatchForAppwrite(payload),
  };
}

/** Patch com atributos opcionais do schema (recorrência, etc.), sem metadados de auditoria. */
export function financeTxOptionalPatchForAppwrite(patch) {
  const doc = {};
  for (const key of OPTIONAL_FINANCIAL_TX_ATTRS) {
    if (patch[key] !== undefined) doc[key] = patch[key];
  }
  for (const key of FINANCE_TX_METADATA_ATTRS) delete doc[key];
  return doc;
}

export function omitFinanceTxMetadata(patch) {
  const doc = { ...patch };
  for (const key of FINANCE_TX_METADATA_ATTRS) delete doc[key];
  return doc;
}

/** Retry: mesmo payload mínimo (evita Unknown attribute). */
export function stripUnknownFinanceTxAttrs(payload) {
  return financeTxDocumentForAppwrite(payload);
}

export const VALID_TX_TYPES = new Set([
  'plan',
  'product',
  'expense',
  'expense_operational',
  'expense_financial',
  'card_fee',
  'stock_purchase',
  'other',
  'enrollment',
  'refund',
]);

export function parseFinanceConfig(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

export function isExpenseType(type) {
  const t = String(type || '').toLowerCase();
  return (
    t === 'expense' ||
    t === 'stock_purchase' ||
    t === 'expense_operational' ||
    t === 'expense_financial' ||
    t === 'card_fee'
  );
}

export function isOutflowType(type) {
  return isExpenseType(type);
}

/** Saída = despesa / compra estoque; demais tipos = entrada na UI. */
export function txDirection(doc) {
  if (String(doc?.direction || '').toLowerCase() === 'out') return 'out';
  if (isExpenseType(doc?.type)) return 'out';
  if (String(doc?.type || '').toLowerCase() === 'refund') return 'in';
  return 'in';
}

export function normalizeTxAmounts({ type, gross, fee, net }) {
  const t = String(type || '').toLowerCase();
  const isRefund = t === 'refund';
  const isExpense = isExpenseType(t);
  let g = Math.abs(Number(gross) || 0);
  let f = Math.max(0, Number(fee) || 0);
  if (!Number.isFinite(g) || g < FINANCIAL_TX_MIN) {
    throw new Error('valor_invalido');
  }
  if (g > FINANCIAL_TX_MAX) throw new Error('valor_acima_do_limite');
  if (isExpense) {
    const n = -g;
    return { gross: g, fee: 0, net: n, direction: 'out' };
  }
  if (isRefund) {
    return { gross: g, fee: 0, net: -g, direction: 'in' };
  }
  const n = Math.max(0, g - f);
  return { gross: g, fee: f, net: n, direction: 'in' };
}

export function normalizeRecurrenceType(value) {
  const t = String(value || 'none').toLowerCase();
  return RECURRENCE_TYPES.has(t) ? t : 'none';
}

export function normalizeRecurrenceDay(type, day) {
  const t = normalizeRecurrenceType(type);
  const n = Math.trunc(Number(day) || 1);
  if (t === 'weekly') return Math.min(6, Math.max(0, n));
  if (t === 'monthly') return Math.min(28, Math.max(1, n));
  return 0;
}

export function parseRecurrenceEnd(value) {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

export function applyRecurrenceFields(payload, input = {}, { force = false } = {}) {
  const origin = String(input.recurrence_origin_id || '').trim();
  if (origin) {
    payload.recurrence_origin_id = origin.slice(0, 64);
    return payload;
  }

  const touchesRecurrence =
    force ||
    input.is_recurrence_template === true ||
    input.is_recurrence_template === false ||
    input.repeat_enabled === true ||
    (input.recurrence_type != null && String(input.recurrence_type).trim() !== '');

  if (!touchesRecurrence) return payload;

  const isTemplate = input.is_recurrence_template === true || input.repeat_enabled === true;
  const type = normalizeRecurrenceType(input.recurrence_type);
  if (isTemplate && type !== 'none') {
    payload.is_recurrence_template = true;
    payload.recurrence_type = type;
    payload.recurrence_day = normalizeRecurrenceDay(type, input.recurrence_day);
    const end = parseRecurrenceEnd(input.recurrence_end);
    if (end) payload.recurrence_end = end;
    else if (input.recurrence_end === '' || input.recurrence_end === null) {
      payload.recurrence_end = '';
    }
  } else if (force || input.is_recurrence_template === false) {
    payload.is_recurrence_template = false;
    payload.recurrence_type = 'none';
  }
  return payload;
}

export function resolveCompetenceMonth(input, settledAt) {
  const explicit = parseCompetenceMonth(input?.competence_month);
  if (explicit) return explicit;
  return competenceMonthFromIso(settledAt || input?.settledAt);
}

export function mapFinanceTxDoc(doc) {
  if (!doc) return null;
  const direction = txDirection(doc);
  const gross = Math.abs(Number(doc.gross) || 0);
  const netRaw = Number(doc.net);
  const typeLc = String(doc.type || '').toLowerCase();
  let net;
  if (typeLc === 'refund') {
    net = Number.isFinite(netRaw) && netRaw < 0 ? netRaw : -gross;
  } else if (direction === 'out') {
    net = Number.isFinite(netRaw) ? netRaw : -gross;
  } else {
    net = Number.isFinite(netRaw) ? Math.abs(netRaw) : gross;
  }
  const type = doc.type || '';
  return {
    id: doc.$id,
    saleId: doc.saleId || '',
    lead_id: doc.lead_id || '',
    lead_name: String(doc.lead_name || '').trim(),
    method: doc.method || '',
    installments: Number(doc.installments || 1),
    type,
    category: financeCategoryLabelFromDoc(doc),
    planName: doc.planName || '',
    gross,
    fee: Number(doc.fee) || 0,
    net,
    direction,
    status: doc.status || 'pending',
    createdAt: doc.$createdAt || null,
    settledAt: doc.settledAt || '',
    competence_month:
      doc.competence_month || competenceMonthFromIso(doc.settledAt) || '',
    note: financeUserNoteFromStored(doc.note),
    origin_type: doc.origin_type || doc.originType || '',
    origin_id: doc.origin_id || doc.originId || '',
    created_by: doc.created_by || doc.createdBy || '',
    updated_by: doc.updated_by || doc.updatedBy || '',
    updated_at: doc.updated_at || doc.updatedAt || doc.$updatedAt || null,
    reconciled: doc.reconciled === true,
    reconciled_at: doc.reconciled_at || '',
    reconciled_by: doc.reconciled_by || '',
    bank_statement_id: doc.bank_statement_id || '',
    recurrence_type: normalizeRecurrenceType(doc.recurrence_type),
    recurrence_day: Number(doc.recurrence_day) || 0,
    recurrence_end: doc.recurrence_end || '',
    recurrence_origin_id: doc.recurrence_origin_id || '',
    is_recurrence_template: doc.is_recurrence_template === true,
    bankAccount: financeBankAccountFromDoc(doc),
  };
}

export function buildFinanceTxPayload(input, meta = {}) {
  const now = new Date().toISOString();
  const type = String(input.type || 'other').toLowerCase();
  const { gross, fee, net } = normalizeTxAmounts({
    type,
    gross: input.gross,
    fee: input.fee,
    net: input.net,
  });

  const categoryLabel = normalizeFinanceCategory(
    input.category || defaultCategoryForTxType(type)
  );

  const payload = {
    academyId: String(input.academyId || ''),
    saleId: String(input.saleId || ''),
    lead_id: String(input.lead_id || ''),
    method: String(input.method || 'pix'),
    installments: Math.min(12, Math.max(1, Number(input.installments) || 1)),
    type,
    category: categoryLabel,
    planName: String(input.planName || ''),
    gross,
    fee,
    net,
    status: String(input.status || 'pending'),
    note: financeUserNoteFromStored(input.note).slice(0, 2000),
    origin_type: String(input.origin_type || meta.origin_type || 'manual').slice(0, 64),
    origin_id: String(input.origin_id || meta.origin_id || '').slice(0, 64),
    created_by: String(meta.created_by || input.created_by || 'system').slice(0, 64),
    updated_by: String(meta.updated_by || meta.created_by || 'system').slice(0, 64),
    updated_at: now,
  };

  if (payload.status === 'settled') {
    payload.settledAt = input.settledAt || now;
    const cm = resolveCompetenceMonth(input, payload.settledAt);
    if (cm) payload.competence_month = cm;
  } else {
    payload.settledAt = '';
  }

  applyRecurrenceFields(payload, input);

  const bankAccount = String(input.bank_account || input.bankAccount || '').trim().slice(0, 128);
  if (bankAccount) payload.bank_account = bankAccount;

  return payload;
}

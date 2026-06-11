/**
 * Parser client-side de extrato bancário (OFX / CSV).
 */
import Papa from 'papaparse';

function roundMoney(n) {
  return Math.round(Math.abs(Number(n) || 0) * 100) / 100;
}

function parseYmdFromUnknown(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
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

function parseAmountBr(raw) {
  const s = String(raw || '').trim();
  if (!s) return NaN;
  const neg = s.includes('-') || /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[R$\s.]/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return NaN;
  return neg ? -Math.abs(n) : n;
}

function normalizeRow(date, description, amountRaw) {
  const dateYmd = parseYmdFromUnknown(date);
  const amt = parseAmountBr(amountRaw);
  if (!dateYmd || !Number.isFinite(amt) || Math.abs(amt) < 0.01) return null;
  const direction = amt >= 0 ? 'credit' : 'debit';
  return {
    date: dateYmd,
    description: String(description || '').trim().slice(0, 512) || 'Movimentação',
    amount: roundMoney(amt),
    direction,
  };
}

const DATE_KEYS = ['data', 'date', 'dt', 'data_movimento', 'data lancamento', 'data lançamento'];
const DESC_KEYS = ['descricao', 'descrição', 'description', 'historico', 'histórico', 'memo', 'lancamento'];
const AMOUNT_KEYS = ['valor', 'amount', 'value', 'quantia', 'credito', 'crédito', 'debito', 'débito'];

function pickColumn(headers, candidates) {
  const norm = headers.map((h) => String(h || '').trim().toLowerCase());
  for (const c of candidates) {
    const idx = norm.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

export function parseCsvBankStatement(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { items: [], error: 'arquivo_vazio' };

  const sep = (trimmed.match(/;/g) || []).length > (trimmed.match(/,/g) || []).length ? ';' : ',';
  const parsed = Papa.parse(trimmed, { header: true, skipEmptyLines: true, delimiter: sep });
  if (parsed.errors?.length && !parsed.data?.length) {
    return { items: [], error: 'csv_invalido' };
  }

  const rows = parsed.data || [];
  const headers = parsed.meta?.fields || Object.keys(rows[0] || {});
  const dateCol = pickColumn(headers, DATE_KEYS) || headers[0];
  const descCol = pickColumn(headers, DESC_KEYS) || headers[1];
  const amountCol = pickColumn(headers, AMOUNT_KEYS) || headers[2];

  const items = [];
  for (const row of rows) {
    const item = normalizeRow(row[dateCol], row[descCol], row[amountCol]);
    if (item) items.push(item);
  }
  return { items, mapping: { dateCol, descCol, amountCol, separator: sep } };
}

export function parseOfxBankStatement(text) {
  const raw = String(text || '');
  if (!raw.includes('<STMTTRN>') && !raw.includes('<stmttrn>')) {
    return { items: [], error: 'ofx_invalido' };
  }

  const items = [];
  const blocks = raw.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const chunk = block.split(/<\/STMTTRN>/i)[0] || '';
    const date =
      (chunk.match(/<DTPOSTED>(\d{8})/i) || [])[1] ||
      (chunk.match(/<DTUSER>(\d{8})/i) || [])[1] ||
      '';
    const ymd = date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : null;
    const memo = (chunk.match(/<MEMO>([^<]*)/i) || [])[1] || '';
    const name = (chunk.match(/<NAME>([^<]*)/i) || [])[1] || '';
    const trnAmt = (chunk.match(/<TRNAMT>([^<]*)/i) || [])[1] || '';
    const item = normalizeRow(ymd, `${name} ${memo}`.trim(), trnAmt);
    if (item) items.push(item);
  }
  return { items };
}

export function summarizeParsedItems(items) {
  let credit = 0;
  let debit = 0;
  let creditCount = 0;
  let debitCount = 0;
  let minDate = null;
  let maxDate = null;

  for (const it of items || []) {
    if (it.direction === 'credit') {
      credit += it.amount;
      creditCount += 1;
    } else {
      debit += it.amount;
      debitCount += 1;
    }
    if (!minDate || it.date < minDate) minDate = it.date;
    if (!maxDate || it.date > maxDate) maxDate = it.date;
  }

  return {
    credit: roundMoney(credit),
    debit: roundMoney(debit),
    creditCount,
    debitCount,
    period_start: minDate,
    period_end: maxDate,
  };
}

export function detectAndParseBankFile(fileName, text) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx') || text.includes('<OFX>') || text.includes('<ofx>')) {
    return { format: 'ofx', ...parseOfxBankStatement(text) };
  }
  return { format: 'csv', ...parseCsvBankStatement(text) };
}

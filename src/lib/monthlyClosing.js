/**
 * Fechamento mensal — unifica recebimentos de mensalidades, matrículas, produtos e outros.
 */
import { expectedAmountForStudent, receivedAmountForPayment } from './paymentStatus.js';

export const CLOSING_ORIGINS = ['mensalidade', 'matricula', 'produto', 'outro'];

export const CLOSING_ORIGIN_LABELS = {
  mensalidade: 'Mensalidades',
  matricula: 'Matrículas',
  produto: 'Produtos',
  outro: 'Outros',
};

export const CLOSING_SITUATIONS = ['recebido', 'parcial', 'pendente'];

export const CLOSING_SITUATION_LABELS = {
  recebido: 'Recebido',
  parcial: 'Parcial',
  pendente: 'Pendente',
};

const METHOD_LABELS = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartão_débito: 'Cartão débito',
  cartão_crédito: 'Cartão crédito',
  credito: 'Cartão crédito',
  debito: 'Cartão débito',
  transferência: 'Transferência',
  transferencia: 'Transferência',
};

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function parseReferenceMonth(ym) {
  const s = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  return s;
}

export function monthDateRange(ym) {
  const ref = parseReferenceMonth(ym);
  if (!ref) return { start: null, end: null };
  const [y, m] = ref.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

export function dateInReferenceMonth(isoOrDate, ym) {
  if (!isoOrDate) return false;
  const ref = parseReferenceMonth(ym);
  if (!ref) return false;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 7) === ref;
}

export function isChildStudent(student) {
  const t = String(student?.type || '').toLowerCase();
  return t.includes('crian') || t.includes('infant') || t.includes('juniores');
}

export function studentDisplayNames(student) {
  const name = String(student?.name || '').trim();
  const guardian = isChildStudent(student)
    ? String(student?.parentName || student?.responsavel || '').trim()
    : '';
  return { name: name || '—', guardian };
}

export function formatPaymentMethod(method, account = '', installments = 1) {
  const m = String(method || '').trim();
  const label = METHOD_LABELS[m] || m || '—';
  const acc = String(account || '').trim();
  const creditLike = m === 'credito' || m === 'cartão_crédito';
  const inst = Number(installments) || 1;
  const instSuffix = creditLike && inst > 1 ? ` ${inst}x` : '';
  if (acc) return `${label}${instSuffix} — ${acc}`.trim();
  return `${label}${instSuffix}`.trim();
}

function mapTxTypeToOrigin(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'enrollment' || t === 'matricula' || t === 'matrícula') return 'matricula';
  if (t === 'product' || t === 'sale' || t === 'produto' || t === 'refund') return 'produto';
  if (t === 'plan') return 'mensalidade';
  return 'outro';
}

function mapOriginToTxType(origin) {
  const o = String(origin || '').toLowerCase();
  if (o === 'matricula') return 'enrollment';
  if (o === 'produto') return 'product';
  if (o === 'mensalidade') return 'plan';
  return 'other';
}

function deriveSituation(expected, received, statusHint) {
  const exp = roundMoney(expected);
  const rec = roundMoney(received);
  const hint = String(statusHint || '').toLowerCase();
  if (hint === 'partial' || (rec > 0 && rec < exp - 0.009)) return 'parcial';
  if (hint === 'pending' || (rec < 0.009 && exp > 0.009)) return 'pendente';
  if (rec >= exp - 0.009 && exp > 0) return 'recebido';
  if (rec > 0) return 'recebido';
  return 'pendente';
}

/**
 * @param {object} params
 * @param {Array} params.payments — documentos student_payments do mês
 * @param {Array} params.transactions — linhas FINANCIAL_TX
 * @param {Map<string, object>} params.leadById
 * @param {object} params.financeConfig
 * @param {string} params.referenceMonth — YYYY-MM
 */
export function buildClosingRows({ payments = [], transactions = [], leadById = new Map(), financeConfig = {}, referenceMonth }) {
  const rows = [];
  const linkedTxIds = new Set();
  const saleIdsInTx = new Set();

  for (const p of payments) {
    const st = String(p.status || '').toLowerCase();
    if (st !== 'paid' && st !== 'partial') continue;
    const student = leadById.get(String(p.lead_id || '')) || null;
    const { name, guardian } = studentDisplayNames(student);
    const expected = roundMoney(
      Number.isFinite(Number(p.expected_amount)) && Number(p.expected_amount) > 0
        ? Number(p.expected_amount)
        : expectedAmountForStudent(student, financeConfig, p)
    );
    const received = roundMoney(receivedAmountForPayment(p));
    const pending = Math.max(0, roundMoney(expected - received));
    const txId = String(p.financial_tx_id || '').trim();
    if (txId) linkedTxIds.add(txId);

    const refMonth = String(p.reference_month || '').trim();
    if (refMonth !== referenceMonth) continue;

    const paidAt = p.paid_at || p.$createdAt || `${referenceMonth}-15T12:00:00.000Z`;

    rows.push({
      id: `sp:${p.$id}`,
      sourceKind: 'payment',
      sourceId: p.$id,
      financialTxId: txId || null,
      leadId: String(p.lead_id || ''),
      name,
      guardian,
      description: String(p.plan_name || student?.plan || 'Mensalidade').trim() || 'Mensalidade',
      expected,
      received,
      pending,
      paymentMethod: formatPaymentMethod(p.method, p.account, 1),
      paymentMethodKey: `${p.method || ''}|${p.account || ''}`,
      date: paidAt,
      situation: deriveSituation(expected, received, st),
      origin: 'mensalidade',
      readOnly: true,
    });
  }

  for (const tx of transactions) {
    const st = String(tx.status || '').toLowerCase();
    const type = String(tx.type || '').toLowerCase();
    if (st === 'cancelled' && type !== 'refund') continue;
    if (type === 'expense') continue;
    if (linkedTxIds.has(String(tx.id || ''))) continue;

    const saleId = String(tx.saleId || '').trim();
    if (saleId) saleIdsInTx.add(saleId);

    const dateIso = tx.settledAt || tx.createdAt;
    if (!dateInReferenceMonth(dateIso, referenceMonth)) continue;

    const student = tx.lead_id ? leadById.get(String(tx.lead_id)) : null;
    const { name, guardian } = studentDisplayNames(student);
    const gross = roundMoney(tx.gross);
    const received = st === 'settled' ? roundMoney(tx.net ?? tx.gross) : 0;
    const expected = gross;
    const pending = Math.max(0, roundMoney(expected - received));
    const origin = mapTxTypeToOrigin(type);
    const description =
      String(tx.planName || '').trim() ||
      String(tx.note || '').trim() ||
      CLOSING_ORIGIN_LABELS[origin] ||
      'Recebimento';

    rows.push({
      id: `tx:${tx.id}`,
      sourceKind: 'transaction',
      sourceId: tx.id,
      financialTxId: tx.id,
      saleId: saleId || null,
      leadId: String(tx.lead_id || ''),
      name,
      guardian,
      description,
      expected,
      received,
      pending,
      paymentMethod: formatPaymentMethod(tx.method, '', tx.installments),
      paymentMethodKey: String(tx.method || ''),
      date: dateIso,
      situation: deriveSituation(expected, received, st === 'pending' ? 'pending' : 'paid'),
      origin,
      readOnly: true,
    });
  }

  return { rows, linkedTxIds, saleIdsInTx };
}

export function filterClosingRows(rows, filters = {}) {
  const {
    origins = new Set(CLOSING_ORIGINS),
    situations = new Set(CLOSING_SITUATIONS),
    paymentMethodKey = 'all',
    search = '',
  } = filters;

  const q = String(search || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (origins.size > 0 && !origins.has(row.origin)) return false;
    if (situations.size > 0 && !situations.has(row.situation)) return false;
    if (paymentMethodKey !== 'all' && row.paymentMethodKey !== paymentMethodKey) return false;
    if (q) {
      const hay = `${row.name} ${row.guardian} ${row.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortClosingRows(rows, sortBy = 'date') {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sortBy === 'name') {
      return String(a.name).localeCompare(String(b.name), 'pt-BR');
    }
    if (sortBy === 'expected') return b.expected - a.expected;
    if (sortBy === 'received') return b.received - a.received;
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    return db - da;
  });
  return copy;
}

export function computeClosingTotals(rows) {
  let expected = 0;
  let received = 0;
  let pending = 0;
  const byMethod = {};

  for (const row of rows) {
    expected += row.expected;
    received += row.received;
    pending += row.pending;
    const key = row.paymentMethod || '—';
    if (!byMethod[key]) byMethod[key] = 0;
    byMethod[key] += row.received;
  }

  return {
    expected: roundMoney(expected),
    received: roundMoney(received),
    pending: roundMoney(pending),
    count: rows.length,
    byMethod: Object.entries(byMethod)
      .map(([label, amount]) => ({ label, amount: roundMoney(amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

function fmtMoneyBr(value) {
  const n = roundMoney(value);
  try {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return String(n.toFixed(2)).replace('.', ',');
  }
}

function fmtDateBr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function csvEscape(cell) {
  const s = String(cell ?? '');
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportClosingCsv(rows, { academyName = '', referenceMonth = '' }) {
  const header = [
    'Nome',
    'Responsável',
    'Descrição',
    'Valor Esperado',
    'Valor Recebido',
    'Valor Pendente',
    'Forma de Pagamento',
    'Data',
    'Situação',
    'Origem',
  ];
  const lines = [
    header.join(';'),
    ...rows.map((r) =>
      [
        r.name,
        r.guardian,
        r.description,
        fmtMoneyBr(r.expected),
        fmtMoneyBr(r.received),
        r.pending > 0.009 ? fmtMoneyBr(r.pending) : '',
        r.paymentMethod,
        fmtDateBr(r.date),
        CLOSING_SITUATION_LABELS[r.situation] || r.situation,
        CLOSING_ORIGIN_LABELS[r.origin] || r.origin,
      ]
        .map(csvEscape)
        .join(';')
    ),
  ];
  const body = `\uFEFF${lines.join('\r\n')}`;
  const slugAcademy = String(academyName || 'academia')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '');
  const fileName = `fechamento_${slugAcademy || 'academia'}_${referenceMonth || 'mes'}.csv`;
  return { body, fileName };
}

export { mapOriginToTxType, mapTxTypeToOrigin };

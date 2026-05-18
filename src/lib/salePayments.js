import { paymentLabel } from './salesSettings.js';
import { formatBRL } from './moneyBr.js';

export const MAX_SALE_PAYMENTS = 3;

export const SALE_PAYMENT_FORM_OPTIONS = [
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outro', label: 'Outro' },
];

export const TROCO_FORM_OPTIONS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
];

const FORMA_ALIASES = {
  credito: 'cartao_credito',
  debito: 'cartao_debito',
  cartão_crédito: 'cartao_credito',
  cartão_débito: 'cartao_debito',
};

export function normalizePaymentForma(raw) {
  const k = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return FORMA_ALIASES[k] || k;
}

export function paymentFormLabel(forma) {
  const k = normalizePaymentForma(forma);
  const hit = SALE_PAYMENT_FORM_OPTIONS.find((o) => o.value === k);
  if (hit) return hit.label;
  return paymentLabel(forma);
}

export function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function parsePagamentosJson(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => ({
        forma: normalizePaymentForma(p?.forma),
        valor: roundMoney(p?.valor),
        troco: roundMoney(p?.troco || 0),
        forma_troco: p?.forma_troco ? normalizePaymentForma(p.forma_troco) : '',
      }))
      .filter((p) => p.forma && Number.isFinite(p.valor) && p.valor >= 0);
  } catch {
    return [];
  }
}

/** Troco em centavos para linha de UI (dinheiro). */
export function rowTrocoCents(row) {
  if (normalizePaymentForma(row?.forma) !== 'dinheiro') return 0;
  const valor = Math.max(0, Math.round(Number(row.valorCents) || 0));
  const recebido = Math.max(0, Math.round(Number(row.recebidoCents ?? row.valorCents) || 0));
  return Math.max(0, recebido - valor);
}

export function netPaidCentsFromRows(rows) {
  let sum = 0;
  for (const r of rows || []) {
    sum += Math.max(0, Math.round(Number(r.valorCents) || 0));
    sum -= rowTrocoCents(r);
  }
  return sum;
}

/** Recalcula a 1ª forma quando há 2+ linhas (total = soma valores − trocos). */
export function rebalancePaymentsForTotal(rows, totalCents) {
  if (!rows?.length) return [createEmptyPaymentRow(totalCents)];
  if (rows.length === 1) {
    const r = rows[0];
    return [
      {
        ...r,
        valorCents: totalCents,
        recebidoCents: normalizePaymentForma(r.forma) === 'dinheiro' ? Math.max(r.recebidoCents ?? 0, totalCents) : r.recebidoCents,
      },
    ];
  }
  const next = rows.map((r) => ({ ...r }));
  const restVal = next.slice(1).reduce((s, r) => s + Math.max(0, Math.round(Number(r.valorCents) || 0)), 0);
  const allTroco = next.reduce((s, r) => s + rowTrocoCents(r), 0);
  const v0 = Math.max(0, Math.round(Number(totalCents) || 0) - restVal + allTroco);
  next[0] = { ...next[0], valorCents: v0 };
  return next;
}

export function createEmptyPaymentRow(totalCents = 0) {
  const cents = Math.max(0, Math.round(Number(totalCents) || 0));
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    forma: 'pix',
    valorCents: cents,
    recebidoCents: cents,
    formaTroco: 'pix',
  };
}

export function serializePagamentosForApi(rows) {
  return (rows || []).map((r) => {
    const forma = normalizePaymentForma(r.forma);
    const valor = roundMoney((Number(r.valorCents) || 0) / 100);
    const out = { forma, valor };
    if (forma === 'dinheiro') {
      const troco = roundMoney(rowTrocoCents(r) / 100);
      if (troco > 0) {
        out.troco = troco;
        out.forma_troco = normalizePaymentForma(r.formaTroco || 'pix');
      }
    }
    return out;
  });
}

export function normalizePagamentosInput(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => {
      const forma = normalizePaymentForma(p?.forma);
      const valor = roundMoney(p?.valor);
      if (!forma || !Number.isFinite(valor) || valor < 0) return null;
      const out = { forma, valor };
      const troco = roundMoney(p?.troco || 0);
      if (troco > 0) {
        out.troco = troco;
        out.forma_troco = normalizePaymentForma(p?.forma_troco || 'pix');
      }
      return out;
    })
    .filter(Boolean)
    .slice(0, MAX_SALE_PAYMENTS);
}

export function sumPagamentosNet(pagamentos) {
  return roundMoney(
    (pagamentos || []).reduce((acc, p) => acc + Number(p.valor || 0) - Number(p.troco || 0), 0)
  );
}

export function validatePagamentosAgainstTotal(pagamentos, totalVenda) {
  const total = roundMoney(totalVenda);
  const net = sumPagamentosNet(pagamentos);
  if (Math.abs(net - total) > 0.009) {
    return { ok: false, net, total };
  }
  for (const p of pagamentos) {
    if (p.forma === 'dinheiro' && Number(p.troco) > Number(p.valor)) {
      return { ok: false, reason: 'troco_exceeds_valor' };
    }
  }
  return { ok: true, net, total };
}

export function buildFormaPagamentoResumo(pagamentos) {
  const labels = (pagamentos || []).map((p) => paymentFormLabel(p.forma));
  const uniq = [...new Set(labels)];
  return uniq.join(' + ').slice(0, 128) || '—';
}

export function formatSalePaymentHistoryLabel(sale) {
  const list = parsePagamentosJson(sale?.pagamentos_json);
  if (!list.length) return paymentLabel(sale?.forma_pagamento);

  const trocoLine = list.find((p) => Number(p.troco) > 0);
  if (trocoLine) {
    const trocoLbl = paymentFormLabel(trocoLine.forma_troco || 'pix');
    const others = list
      .filter((p) => p !== trocoLine)
      .map((p) => paymentFormLabel(p.forma));
    const cashLbl = paymentFormLabel('dinheiro');
    if (others.length) return `${others.join(' · ')} · ${cashLbl} + troco ${trocoLbl}`;
    return `${cashLbl} + troco ${trocoLbl}`;
  }
  return list.map((p) => paymentFormLabel(p.forma)).join(' · ');
}

export function buildReceiptPaymentsText(pagamentos, totalVenda) {
  const list = Array.isArray(pagamentos) ? pagamentos : parsePagamentosJson(pagamentos);
  if (!list.length) return '';

  const lines = ['Pagamentos:'];
  for (const p of list) {
    lines.push(`  ${paymentFormLabel(p.forma)}   ${formatBRL(p.valor)}`);
    if (p.forma === 'dinheiro' && Number(p.troco) > 0) {
      const recebido = roundMoney(Number(p.valor) + Number(p.troco));
      lines.push(`    Valor recebido:   ${formatBRL(recebido)}`);
      lines.push(`    Troco (${paymentFormLabel(p.forma_troco || 'pix')}):  − ${formatBRL(p.troco)}`);
    }
  }
  lines.push('');
  lines.push(`Total pago:           ${formatBRL(sumPagamentosNet(list))}`);
  lines.push(`Valor da venda:       ${formatBRL(totalVenda)}`);
  return lines.join('\n');
}

export function paymentsUiValid(rows, totalCents) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  if (!rows?.length) return { ok: false, reason: 'empty' };
  if (rows.length > MAX_SALE_PAYMENTS) return { ok: false, reason: 'max' };

  for (const r of rows) {
    if (!normalizePaymentForma(r.forma)) return { ok: false, reason: 'forma' };
    if (Math.round(Number(r.valorCents) || 0) <= 0) return { ok: false, reason: 'valor' };
    if (normalizePaymentForma(r.forma) === 'dinheiro') {
      const recebido = Math.round(Number(r.recebidoCents ?? r.valorCents) || 0);
      const valor = Math.round(Number(r.valorCents) || 0);
      if (recebido < valor) return { ok: false, reason: 'troco_negativo' };
    }
  }

  const net = netPaidCentsFromRows(rows);
  if (net !== total) return { ok: false, reason: 'sum', net, total, diff: total - net };
  return { ok: true, net, total };
}

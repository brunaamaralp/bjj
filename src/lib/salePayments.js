import { paymentLabel } from './salesSettings.js';
import { formatBRL } from './moneyBr.js';
import { canonicalPaymentMethodKeyFromInput, PAYMENT_METHODS } from './paymentMethods.js';
import { listActivePaymentMethods } from './paymentMethodSettings.js';
import { validateCaptureMethodForSubmit } from './captureMethodPaymentForm.js';

export const MAX_SALE_PAYMENTS = 3;

export const SALE_PAYMENT_FORM_OPTIONS = PAYMENT_METHODS;

export const TROCO_FORM_OPTIONS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
];

/** Formas de pagamento ativas para PDV (canônico). Sem config → todas. */
export function salePaymentFormOptionsForFinance(financeConfig) {
  if (!financeConfig) return SALE_PAYMENT_FORM_OPTIONS;
  return listActivePaymentMethods(financeConfig);
}

/** Opções de troco (PIX/dinheiro) respeitando formas ativas. */
export function trocoFormOptionsForFinance(financeConfig) {
  if (!financeConfig) return TROCO_FORM_OPTIONS;
  const active = new Set(listActivePaymentMethods(financeConfig).map((m) => m.value));
  return TROCO_FORM_OPTIONS.filter((o) => active.has(o.value));
}

export function normalizePaymentForma(raw) {
  return canonicalPaymentMethodKeyFromInput(raw);
}

export function normalizePaymentInstallments(forma, installments) {
  const method = normalizePaymentForma(forma);
  if (method !== 'cartao_credito') return 1;
  return Math.min(12, Math.max(1, Math.trunc(Number(installments) || 1)));
}

export function paymentFormLabel(forma) {
  const k = normalizePaymentForma(forma);
  const hit = SALE_PAYMENT_FORM_OPTIONS.find((o) => o.value === k);
  if (hit) return hit.label;
  return paymentLabel(forma);
}

function paymentFormLabelWithInstallments(pagamento) {
  const base = paymentFormLabel(pagamento?.forma);
  const installments = normalizePaymentInstallments(pagamento?.forma, pagamento?.installments);
  if (normalizePaymentForma(pagamento?.forma) === 'cartao_credito' && installments > 1) {
    return `${base} ${installments}x`;
  }
  return base;
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
        capture_method_id: p?.capture_method_id ? String(p.capture_method_id) : '',
        installments: normalizePaymentInstallments(p?.forma, p?.installments),
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

export function buildQuickPayment(forma, totalCents) {
  const cents = Math.max(0, Math.round(Number(totalCents) || 0));
  const row = {
    ...createEmptyPaymentRow(cents),
    forma: normalizePaymentForma(forma),
  };
  if (row.forma === 'dinheiro') {
    row.recebidoCents = cents;
  }
  return [row];
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
    installments: 1,
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
    const captureId = String(r.capture_method_id || '').trim();
    if (captureId) out.capture_method_id = captureId;
    out.installments = normalizePaymentInstallments(forma, r.installments);
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
      const out = {
        forma,
        valor,
        installments: normalizePaymentInstallments(forma, p?.installments),
      };
      const troco = roundMoney(p?.troco || 0);
      if (troco > 0) {
        out.troco = troco;
        out.forma_troco = normalizePaymentForma(p?.forma_troco || 'pix');
      }
      const captureId = String(p?.capture_method_id || '').trim();
      if (captureId) out.capture_method_id = captureId;
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

/**
 * @param {Array} pagamentos
 * @param {number} totalVenda
 * @param {{ partial?: boolean, deferred?: boolean }} [opts]
 */
export function validatePagamentosAgainstTotal(pagamentos, totalVenda, opts = {}) {
  const total = roundMoney(totalVenda);
  const net = sumPagamentosNet(pagamentos);
  const partial = opts.partial === true;
  const deferred = opts.deferred === true;

  if (!deferred && net <= 0.009) {
    return { ok: false, net, total, reason: 'zero_payment' };
  }

  if (Math.abs(net - total) <= 0.009) {
    // integral
  } else if (partial && net > 0.009 && net < total - 0.009) {
    // entrada parcial
  } else if (deferred && net <= 0.009) {
    // venda a prazo sem pagamento na hora
  } else {
    return { ok: false, net, total, reason: partial ? 'partial_out_of_range' : 'total_mismatch' };
  }

  for (const p of pagamentos) {
    if (p.forma === 'dinheiro' && Number(p.troco) > Number(p.valor)) {
      return { ok: false, reason: 'troco_exceeds_valor' };
    }
  }
  return { ok: true, net, total, partial: partial && net < total - 0.009 };
}

/** Valor já recebido na venda (campo paid_amount ou soma de pagamentos). */
export function deriveSalePaidAmount(saleOrDoc) {
  const raw = saleOrDoc?.paid_amount ?? saleOrDoc?.paidAmount;
  if (raw != null && Number.isFinite(Number(raw))) {
    return roundMoney(Number(raw));
  }
  const list = Array.isArray(saleOrDoc?.pagamentos) && saleOrDoc.pagamentos.length
    ? normalizePagamentosInput(saleOrDoc.pagamentos)
    : parsePagamentosJson(saleOrDoc?.pagamentos_json);
  return roundMoney(sumPagamentosNet(list));
}

/** Contexto para liquidar venda pendente (a prazo) ou saldo de entrada parcial. */
export function resolveSaleLiquidationContext(saleOrDoc) {
  const statusLower = String(saleOrDoc?.status || '').trim().toLowerCase();
  const saleTotal = roundMoney(Number(saleOrDoc?.total) || 0);
  const paidSoFar = deriveSalePaidAmount(saleOrDoc);
  const hasOpenBalance =
    saleTotal > 0.009 && paidSoFar > 0.009 && paidSoFar < saleTotal - 0.009;
  const isPartialSale =
    statusLower === 'parcial' ||
    (hasOpenBalance && statusLower !== 'concluida' && statusLower !== 'cancelada');
  const isPendingDeferred = statusLower === 'pendente' && !hasOpenBalance;
  const balanceDue = isPartialSale
    ? roundMoney(Math.max(0, saleTotal - paidSoFar))
    : isPendingDeferred
      ? saleTotal
      : 0;
  return {
    statusLower,
    saleTotal,
    paidSoFar,
    isPartialSale,
    isPendingDeferred,
    balanceDue,
    hasOpenBalance,
  };
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
      .map((p) => paymentFormLabelWithInstallments(p));
    const cashLbl = paymentFormLabelWithInstallments({ forma: 'dinheiro' });
    if (others.length) return `${others.join(' · ')} · ${cashLbl} + troco ${trocoLbl}`;
    return `${cashLbl} + troco ${trocoLbl}`;
  }
  return list.map((p) => paymentFormLabelWithInstallments(p)).join(' · ');
}

export function buildReceiptPaymentsText(pagamentos, totalVenda) {
  const list = Array.isArray(pagamentos) ? pagamentos : parsePagamentosJson(pagamentos);
  if (!list.length) return '';

  const lines = ['Pagamentos:'];
  for (const p of list) {
    lines.push(`  ${paymentFormLabelWithInstallments(p)}   ${formatBRL(p.valor)}`);
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

export function paymentsUiValid(rows, totalCents, opts = {}) {
  if (opts?.deferred === true) return { ok: true, deferred: true };
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  if (!rows?.length) return { ok: false, reason: 'empty' };
  if (rows.length > MAX_SALE_PAYMENTS) return { ok: false, reason: 'max' };

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!normalizePaymentForma(r.forma)) return { ok: false, reason: 'forma', index: i };
    if (Math.round(Number(r.valorCents) || 0) <= 0) return { ok: false, reason: 'valor', index: i };
    if (normalizePaymentForma(r.forma) === 'dinheiro') {
      const recebido = Math.round(Number(r.recebidoCents ?? r.valorCents) || 0);
      const valor = Math.round(Number(r.valorCents) || 0);
      if (recebido < valor) return { ok: false, reason: 'troco_negativo', index: i };
    }
    if (opts.financeConfig) {
      const captureMsg = validateCaptureMethodForSubmit(
        opts.financeConfig,
        r.forma,
        r.capture_method_id
      );
      if (captureMsg) {
        return { ok: false, reason: 'capture_method', index: i, message: captureMsg };
      }
    }
  }

  const net = netPaidCentsFromRows(rows);
  if (opts?.partial === true) {
    if (net <= 0) return { ok: false, reason: 'zero', net, total };
    if (net >= total) return { ok: false, reason: 'sum_partial_exceeds', net, total, diff: total - net };
    return { ok: true, net, total, partial: true };
  }
  if (Math.abs(net - total) <= 1) return { ok: true, net, total };
  if (net !== total) return { ok: false, reason: 'sum', net, total, diff: total - net };
  return { ok: true, net, total };
}

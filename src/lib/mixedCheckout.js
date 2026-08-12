import { PAYMENT_CATEGORY } from './paymentCategories.js';
import { numberToCents } from './moneyBr.js';
import {
  normalizePaymentForma,
  normalizePaymentInstallments,
  roundMoney,
} from './salePayments.js';
import { splitPagamentosByGrossShares, normalizeLineKind } from './saleLineKind.js';

export const MIXED_CHARGE_KINDS = {
  PLAN: PAYMENT_CATEGORY.PLAN,
  BUNDLE: PAYMENT_CATEGORY.BUNDLE,
  FEE: PAYMENT_CATEGORY.FEE,
};

const CHARGE_LABEL = {
  [PAYMENT_CATEGORY.PLAN]: 'mensalidade',
  [PAYMENT_CATEGORY.BUNDLE]: 'pacote',
  [PAYMENT_CATEGORY.FEE]: 'taxa',
};

function lineGross(line) {
  const qty = Math.max(0, Number(line?.quantidade) || 0);
  const unit = Number(line?.preco_unitario);
  if (!Number.isFinite(unit) || unit < 0) return 0;
  return roundMoney(qty * unit);
}

function chargeAmount(line) {
  const n = Number(line?.amount);
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(n);
}

/** Total do carrinho misto em centavos. */
export function sumMixedCartCents({ productLines = [], chargeLines = [] } = {}) {
  let cents = 0;
  for (const line of productLines) {
    const g = lineGross(line);
    const c = numberToCents(g);
    if (c != null) cents += c;
  }
  for (const line of chargeLines) {
    const g = chargeAmount(line);
    const c = numberToCents(g);
    if (c != null) cents += c;
  }
  return cents;
}

export function productLinesGross(productLines = []) {
  return roundMoney(productLines.reduce((s, line) => s + lineGross(line), 0));
}

export function chargeLinesGross(chargeLines = []) {
  return roundMoney(chargeLines.reduce((s, line) => s + chargeAmount(line), 0));
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string, message: string }}
 */
export function validateMixedCart({
  alunoId = '',
  productLines = [],
  chargeLines = [],
  deferred = false,
} = {}) {
  const hasProducts = (productLines || []).length > 0;
  const hasCharges = (chargeLines || []).length > 0;
  if (!hasProducts && !hasCharges) {
    return { ok: false, reason: 'empty_cart', message: 'Adicione pelo menos um item ou cobrança.' };
  }
  if (hasCharges && !String(alunoId || '').trim()) {
    return {
      ok: false,
      reason: 'aluno_required',
      message: 'Selecione o aluno para incluir mensalidade, pacote ou taxa.',
    };
  }
  if (deferred && hasCharges) {
    return {
      ok: false,
      reason: 'deferred_with_charges',
      message: 'Venda a prazo não pode ser misturada com mensalidade/taxa neste fluxo.',
    };
  }
  for (const line of chargeLines || []) {
    const kind = String(line?.kind || '').trim();
    const amount = chargeAmount(line);
    if (amount <= 0) {
      return { ok: false, reason: 'charge_amount', message: 'Informe o valor da cobrança.' };
    }
    if (kind === PAYMENT_CATEGORY.FEE && !String(line?.note || '').trim()) {
      return {
        ok: false,
        reason: 'fee_note_required',
        message: 'Informe a descrição da taxa.',
      };
    }
    if (kind === PAYMENT_CATEGORY.PLAN && !String(line?.reference_month || '').trim()) {
      return {
        ok: false,
        reason: 'plan_month_required',
        message: 'Informe o mês de referência da mensalidade.',
      };
    }
    if (kind === PAYMENT_CATEGORY.BUNDLE) {
      const months = Number(line?.bundle_months);
      if (!Number.isFinite(months) || months < 1) {
        return {
          ok: false,
          reason: 'bundle_months_required',
          message: 'Informe a quantidade de meses do pacote.',
        };
      }
      if (!String(line?.coverage_start_month || line?.bundle_start_month || '').trim()) {
        return {
          ok: false,
          reason: 'bundle_start_required',
          message: 'Informe o mês inicial da cobertura.',
        };
      }
    }
  }
  for (const line of productLines || []) {
    const unit = Number(line?.preco_unitario);
    if (!Number.isFinite(unit) || unit <= 0) {
      return {
        ok: false,
        reason: 'product_price',
        message: `Informe o preço de "${line?.display_label || 'item'}"`,
      };
    }
  }
  return { ok: true };
}

function pickDominantPayment(pagamentosScaled) {
  let best = null;
  for (const p of pagamentosScaled || []) {
    const net = roundMoney(Number(p?.valor || 0) - Number(p?.troco || 0));
    if (!best || net > best.net) {
      best = { ...p, net };
    }
  }
  return best;
}

/**
 * Aloca pagamentos do checkout entre venda e cada cobrança.
 * @param {Array} pagamentosNorm - lista com forma/valor/installments/…
 * @param {{ saleGross: number, charges: Array<{ id: string, amount: number }> }} shares
 */
export function allocatePaymentsForMixedCheckout(pagamentosNorm, { saleGross = 0, charges = [] } = {}) {
  const saleG = roundMoney(Math.max(0, Number(saleGross) || 0));
  const chargeList = (charges || [])
    .map((c) => ({
      id: String(c.id),
      amount: roundMoney(Math.max(0, Number(c.amount) || 0)),
    }))
    .filter((c) => c.id && c.amount > 0);

  const shareDefs = [];
  if (saleG > 0.009) shareDefs.push({ key: 'sale', gross: saleG });
  for (const c of chargeList) {
    shareDefs.push({ key: `charge:${c.id}`, gross: c.amount });
  }

  const raw = splitPagamentosByGrossShares(pagamentosNorm || [], shareDefs);

  const salePagamentos = (raw.get('sale') || []).map((p) => {
    const src = (pagamentosNorm || []).find((x) => normalizePaymentForma(x.forma) === normalizePaymentForma(p.forma));
    return {
      forma: normalizePaymentForma(p.forma),
      valor: roundMoney(p.valor),
      troco: roundMoney(p.troco || 0),
      forma_troco: p.forma_troco || src?.forma_troco || '',
      installments: normalizePaymentInstallments(p.forma, src?.installments ?? p.installments),
      capture_method_id: src?.capture_method_id || p.capture_method_id || '',
      fee_receiver_id: src?.fee_receiver_id || p.fee_receiver_id || '',
      card_brand: src?.card_brand || p.card_brand || '',
    };
  });

  // Preservar metadados de installments/capture do pagamento original na fatia da venda
  const enrichedSale = (pagamentosNorm || []).length
    ? (salePagamentos.length ? salePagamentos : []).map((sp, idx) => {
        const src = pagamentosNorm[Math.min(idx, pagamentosNorm.length - 1)] || pagamentosNorm[0];
        return {
          ...sp,
          installments: normalizePaymentInstallments(sp.forma, src?.installments),
          capture_method_id: String(src?.capture_method_id || sp.capture_method_id || '').trim(),
          fee_receiver_id: String(src?.fee_receiver_id || sp.fee_receiver_id || '').trim(),
          card_brand: String(src?.card_brand || sp.card_brand || '').trim(),
          forma_troco: sp.forma_troco || src?.forma_troco || '',
        };
      })
    : salePagamentos;

  // Melhor: copiar metadados do pagamento-fonte com mesma forma
  const saleWithMeta = enrichedSale.map((sp) => {
    const src =
      (pagamentosNorm || []).find((x) => normalizePaymentForma(x.forma) === sp.forma) ||
      pagamentosNorm?.[0];
    if (!src) return sp;
    return {
      ...sp,
      installments: normalizePaymentInstallments(sp.forma, src.installments),
      capture_method_id: String(src.capture_method_id || '').trim(),
      fee_receiver_id: String(src.fee_receiver_id || '').trim(),
      card_brand: String(src.card_brand || '').trim(),
    };
  });

  const chargeAllocations = chargeList.map((c) => {
    const scaled = raw.get(`charge:${c.id}`) || [];
    // Anexar metadados dos pagamentos originais por forma
    const scaledWithMeta = scaled.map((p) => {
      const src =
        (pagamentosNorm || []).find((x) => normalizePaymentForma(x.forma) === normalizePaymentForma(p.forma)) ||
        pagamentosNorm?.[0];
      return {
        ...p,
        installments: normalizePaymentInstallments(p.forma, src?.installments),
        capture_method_id: String(src?.capture_method_id || '').trim(),
        fee_receiver_id: String(src?.fee_receiver_id || '').trim(),
        card_brand: String(src?.card_brand || '').trim(),
      };
    });
    const dominant = pickDominantPayment(scaledWithMeta) || pagamentosNorm?.[0] || {};
    const method = normalizePaymentForma(dominant.forma || 'pix');
    return {
      id: c.id,
      amount: c.amount,
      method,
      installments: normalizePaymentInstallments(method, dominant.installments),
      capture_method_id: String(dominant.capture_method_id || '').trim(),
      fee_receiver_id: String(dominant.fee_receiver_id || '').trim(),
      card_brand: String(dominant.card_brand || '').trim(),
      troco: roundMoney(dominant.troco || 0),
      forma_troco: dominant.forma_troco || '',
    };
  });

  return {
    salePagamentos: saleG > 0.009 ? saleWithMeta : [],
    charges: chargeAllocations,
  };
}

export function buildSalePayloadFromMixed({
  alunoId = null,
  productLines = [],
  salePagamentos = [],
  idempotency_key,
  sale_source = 'pdv',
  deferred = false,
  due_date = null,
  cliente_nome = null,
  cliente_telefone = null,
  venda_colaborador = false,
} = {}) {
  const itens = (productLines || []).map((it) => ({
    item_estoque_id: it.product_variant_id || it.item_estoque_id,
    product_variant_id: it.product_variant_id || it.item_estoque_id,
    quantidade: Number(it.quantidade),
    preco_unitario: Number(it.preco_unitario),
    line_kind: normalizeLineKind(it.line_kind),
    expected_quantity:
      it.expected_quantity != null ? Number(it.expected_quantity) : Number(it.disponivel),
  }));

  return {
    aluno_id: alunoId || null,
    pagamentos: deferred ? [] : salePagamentos,
    deferred: Boolean(deferred),
    due_date: deferred ? due_date : null,
    cliente_nome: !alunoId ? cliente_nome : null,
    cliente_telefone: !alunoId ? cliente_telefone : null,
    venda_colaborador: Boolean(venda_colaborador),
    itens,
    idempotency_key,
    sale_source,
  };
}

export function buildStudentPaymentPayloadsFromMixed({
  alunoId,
  academyId,
  userId = '',
  registered_by_name = 'Usuário',
  chargeLines = [],
  chargeAllocations = [],
  defaultAccount = '',
} = {}) {
  const byId = new Map((chargeAllocations || []).map((a) => [String(a.id), a]));
  const out = [];
  for (const line of chargeLines || []) {
    const alloc = byId.get(String(line.id)) || {};
    const kind = String(line.kind || '').trim();
    const amount = chargeAmount(line);
    const method = normalizePaymentForma(alloc.method || line.method || 'pix');
    const data = {
      lead_id: alunoId,
      academy_id: academyId,
      amount,
      paid_amount: amount,
      method,
      account: String(alloc.account || line.account || defaultAccount || '').trim(),
      installments: normalizePaymentInstallments(method, alloc.installments ?? line.installments),
      plan_name: String(line.plan_name || '').trim(),
      status: 'paid',
      payment_category: kind,
      due_date: null,
      paid_at: new Date().toISOString(),
      registered_by: userId || '',
      registered_by_name,
      note: String(line.note || '').trim(),
    };
    if (alloc.capture_method_id) data.capture_method_id = alloc.capture_method_id;
    if (alloc.fee_receiver_id) data.fee_receiver_id = alloc.fee_receiver_id;
    if (alloc.card_brand) data.card_brand = alloc.card_brand;

    if (kind === PAYMENT_CATEGORY.BUNDLE) {
      data.bundle_months = Number(line.bundle_months) || 12;
      data.coverage_start_month = line.coverage_start_month || line.bundle_start_month;
      data.reference_month = data.coverage_start_month;
    } else if (kind === PAYMENT_CATEGORY.PLAN) {
      data.reference_month = line.reference_month;
      data.expected_amount = amount;
    } else {
      data.reference_month = null;
    }
    out.push(data);
  }
  return out;
}

export function summarizeMixedCheckout({ saleGross = 0, chargeLines = [] } = {}) {
  const parts = [];
  const sale = roundMoney(Math.max(0, Number(saleGross) || 0));
  if (sale > 0.009) parts.push({ label: 'venda', amount: sale });
  for (const line of chargeLines || []) {
    const amount = chargeAmount(line);
    if (amount <= 0) continue;
    const label = CHARGE_LABEL[line.kind] || line.kind || 'cobrança';
    parts.push({ label, amount });
  }
  const total = roundMoney(parts.reduce((s, p) => s + p.amount, 0));
  return { total, parts };
}

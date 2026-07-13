import { canonicalPaymentMethodKeyFromInput } from '../../src/lib/paymentMethods.js';

const FORMA_ALIASES = {
  credito: 'cartao_credito',
  debito: 'cartao_debito',
};

/** @deprecated Prefer canonicalPaymentMethodKeyFromInput — mantido para imports legados. */
export function normalizePaymentForma(raw) {
  const key = canonicalPaymentMethodKeyFromInput(raw);
  if (key) return key;
  const k = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return FORMA_ALIASES[k] || k;
}

export function normalizePaymentInstallments(forma, installments) {
  const method = normalizePaymentForma(forma);
  if (method !== 'cartao_credito') return 1;
  return Math.min(12, Math.max(1, Math.trunc(Number(installments) || 1)));
}

export function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

const FORMA_LABELS = {
  pix: 'PIX',
  cartao_credito: 'Cartão',
  cartao_debito: 'Débito',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  outro: 'Outro',
  credito: 'Cartão',
  debito: 'Débito',
};

export function paymentFormLabel(forma) {
  const k = normalizePaymentForma(forma);
  return FORMA_LABELS[k] || forma || '—';
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
    .slice(0, 3);
}

export function sumPagamentosNet(pagamentos) {
  return roundMoney(
    (pagamentos || []).reduce((acc, p) => acc + Number(p.valor || 0) - Number(p.troco || 0), 0)
  );
}

export function validatePagamentosAgainstTotal(pagamentos, totalVenda) {
  return validatePagamentosForSettlement(pagamentos, totalVenda, { allowPartial: false });
}

export function salePaidAmountNet(pagamentosOrJson) {
  const list = Array.isArray(pagamentosOrJson)
    ? pagamentosOrJson
    : parsePagamentosJson(pagamentosOrJson);
  return sumPagamentosNet(list);
}

export function saleRemainingAmount(totalVenda, paidNet = 0) {
  const total = roundMoney(totalVenda);
  const paid = roundMoney(paidNet);
  return roundMoney(Math.max(0, total - paid));
}

export function mergePagamentosLists(existing, incoming) {
  const base = Array.isArray(existing) ? existing : parsePagamentosJson(existing);
  const next = normalizePagamentosInput(incoming);
  return [...base, ...next].slice(0, 30);
}

export function validatePagamentosForSettlement(pagamentos, totalVenda, opts = {}) {
  const total = roundMoney(totalVenda);
  const prior = roundMoney(opts?.alreadyPaid ?? 0);
  const net = sumPagamentosNet(pagamentos);
  for (const p of pagamentos || []) {
    if (p.forma === 'dinheiro' && Number(p.troco) > Number(p.valor)) {
      return { ok: false, reason: 'troco_exceeds_valor', net, total, prior };
    }
  }
  if (opts?.allowPartial === true) {
    if (net <= 0.009) {
      return { ok: false, reason: 'zero_payment', net, total, prior };
    }
    const newPaid = roundMoney(prior + net);
    if (newPaid > total + 0.009) {
      return {
        ok: false,
        reason: 'exceeds_remaining',
        net,
        total,
        prior,
        remaining: saleRemainingAmount(total, prior),
      };
    }
    const isComplete = Math.abs(newPaid - total) <= 0.009;
    return {
      ok: true,
      net,
      total,
      prior,
      newPaid,
      isComplete,
      remaining: saleRemainingAmount(total, newPaid),
    };
  }
  if (Math.abs(net - total) > 0.009) {
    return { ok: false, net, total, prior };
  }
  return { ok: true, net, total, prior, newPaid: net, isComplete: true, remaining: 0 };
}

export function buildFormaPagamentoResumo(pagamentos) {
  const labels = (pagamentos || []).map((p) => paymentFormLabel(p.forma));
  const uniq = [...new Set(labels)];
  return uniq.join(' + ').slice(0, 128) || '—';
}

/** Parse `pagamentos_json` da venda (server-safe, sem deps de src/). */
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
        fee_receiver_id: p?.fee_receiver_id ? String(p.fee_receiver_id) : '',
        card_brand: p?.card_brand ? String(p.card_brand) : '',
        installments: normalizePaymentInstallments(p?.forma, p?.installments),
      }))
      .filter((p) => p.forma && Number.isFinite(p.valor) && p.valor >= 0);
  } catch {
    return [];
  }
}

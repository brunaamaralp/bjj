const FORMA_ALIASES = {
  credito: 'cartao_credito',
  debito: 'cartao_debito',
};

export function normalizePaymentForma(raw) {
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

export function buildFormaPagamentoResumo(pagamentos) {
  const labels = (pagamentos || []).map((p) => paymentFormLabel(p.forma));
  const uniq = [...new Set(labels)];
  return uniq.join(' + ').slice(0, 128) || '—';
}

/** Valor já recebido na venda (campo paid_amount ou soma de pagamentos_json). */
export function deriveSalePaidAmount(saleOrDoc) {
  const raw = saleOrDoc?.paid_amount ?? saleOrDoc?.paidAmount;
  if (raw != null && Number.isFinite(Number(raw))) {
    return roundMoney(Number(raw));
  }
  let list = [];
  if (Array.isArray(saleOrDoc?.pagamentos) && saleOrDoc.pagamentos.length) {
    list = normalizePagamentosInput(saleOrDoc.pagamentos);
  } else if (saleOrDoc?.pagamentos_json) {
    try {
      const parsed =
        typeof saleOrDoc.pagamentos_json === 'string'
          ? JSON.parse(saleOrDoc.pagamentos_json)
          : saleOrDoc.pagamentos_json;
      list = normalizePagamentosInput(parsed);
    } catch {
      list = [];
    }
  }
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

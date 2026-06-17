/**
 * Taxas da operadora (MDR) — custo financeiro, separado do repasse ao aluno (cardFees).
 * MDR incide sobre o valor transacionado (gross cobrado do cliente).
 */
import {
  canonicalPaymentMethodKey,
  usesInstallmentCardFee,
} from './paymentMethods.js';
import { addDaysYmd } from './financeForecastCore.js';

export const ACQUIRER_FEE_POLICIES = new Set(['absorb', 'pass_through']);

export const ACQUIRER_INSTALLMENT_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function normalizeAcquirerFeePolicy(raw) {
  const key = String(raw || 'absorb').trim().toLowerCase();
  return ACQUIRER_FEE_POLICIES.has(key) ? key : 'absorb';
}

/** Base para cálculo do MDR conforme política da academia. */
export function resolveMdrGross({ gross, planBase, policy }) {
  const g = roundMoney(gross);
  if (g < 0.01) return 0;
  if (normalizeAcquirerFeePolicy(policy) !== 'pass_through') return g;
  const base = roundMoney(planBase);
  if (base > 0) return base;
  return g;
}

export function defaultAcquirerFees() {
  return {
    pix: { percent: 0, fixed: 0 },
    debito: { percent: 0, fixed: 0 },
    credito_avista: { percent: 0, fixed: 0 },
    credito_parcelado: Object.fromEntries(ACQUIRER_INSTALLMENT_COUNTS.map((n) => [String(n), 0])),
    antecipacao: { percent: 0, fixed: 0 },
  };
}

export function normalizeAcquirerFees(raw) {
  const base = defaultAcquirerFees();
  const src = raw && typeof raw === 'object' ? raw : {};
  const parcelado = { ...base.credito_parcelado };
  const srcParcelado = src.credito_parcelado || {};
  for (const n of ACQUIRER_INSTALLMENT_COUNTS) {
    const key = String(n);
    const row = srcParcelado[key] ?? srcParcelado[n];
    parcelado[key] = Number(row?.percent ?? row ?? 0) || 0;
  }
  return {
    pix: {
      percent: Number(src.pix?.percent ?? 0) || 0,
      fixed: Number(src.pix?.fixed ?? 0) || 0,
    },
    debito: {
      percent: Number(src.debito?.percent ?? 0) || 0,
      fixed: Number(src.debito?.fixed ?? 0) || 0,
    },
    credito_avista: {
      percent: Number(src.credito_avista?.percent ?? 0) || 0,
      fixed: Number(src.credito_avista?.fixed ?? 0) || 0,
    },
    credito_parcelado: parcelado,
    antecipacao: {
      percent: Number(src.antecipacao?.percent ?? 0) || 0,
      fixed: Number(src.antecipacao?.fixed ?? 0) || 0,
    },
  };
}

export function isAcquirerFeeEligibleMethod(canonical) {
  const key = String(canonical || '').trim().toLowerCase();
  return (
    key === 'pix' ||
    key === 'cartao_credito' ||
    key === 'cartao_debito' ||
    key === 'credito_parcelado'
  );
}

export function acquirerFeePercent(acquirerFees, method, installments = 1) {
  const fees = normalizeAcquirerFees(acquirerFees);
  const key = canonicalPaymentMethodKey(method);
  if (!isAcquirerFeeEligibleMethod(key)) return 0;

  if (usesInstallmentCardFee(key, installments)) {
    const n = Math.max(2, Math.min(12, Math.trunc(Number(installments) || 2)));
    const parcelado = fees.credito_parcelado || {};
    return Number(parcelado[String(n)] ?? parcelado[n] ?? 0) || 0;
  }
  if (key === 'cartao_credito') {
    return Number(fees.credito_avista?.percent ?? 0) || 0;
  }
  if (key === 'cartao_debito') {
    return Number(fees.debito?.percent ?? 0) || 0;
  }
  if (key === 'pix') {
    return Number(fees.pix?.percent ?? 0) || 0;
  }
  return 0;
}

export function acquirerFeeFixed(acquirerFees, method) {
  const fees = normalizeAcquirerFees(acquirerFees);
  const key = canonicalPaymentMethodKey(method);
  if (key === 'pix') return Number(fees.pix?.fixed ?? 0) || 0;
  if (key === 'cartao_debito') return Number(fees.debito?.fixed ?? 0) || 0;
  if (key === 'cartao_credito' || key === 'credito_parcelado') {
    return Number(fees.credito_avista?.fixed ?? 0) || 0;
  }
  return 0;
}

export function hasAcquirerFeesConfigured(acquirerFees) {
  const fees = normalizeAcquirerFees(acquirerFees);
  const checks = [
    fees.pix?.percent,
    fees.debito?.percent,
    fees.credito_avista?.percent,
    fees.antecipacao?.percent,
    ...ACQUIRER_INSTALLMENT_COUNTS.map((n) => fees.credito_parcelado?.[String(n)]),
  ];
  return checks.some((v) => Number(v) > 0);
}

/**
 * @returns {{ gross: number, fee: number, net: number }}
 */
export function computeAcquirerFee({
  gross,
  planBase,
  policy,
  method,
  installments = 1,
  acquirerFees,
}) {
  const g = roundMoney(gross);
  if (g < 0.01) return { gross: 0, fee: 0, net: 0 };

  const mdrGross = resolveMdrGross({ gross: g, planBase, policy });
  const pct = acquirerFeePercent(acquirerFees, method, installments);
  const fixed = acquirerFeeFixed(acquirerFees, method);
  if (!(pct > 0) && !(fixed > 0)) {
    return { gross: g, fee: 0, net: g };
  }

  const fee = roundMoney(mdrGross * (pct / 100) + fixed);
  const net = roundMoney(Math.max(0, g - fee));
  return { gross: g, fee, net };
}

/** Valores para espelho FINANCIAL_TX (fee = MDR apenas). */
export function mirrorAmountsForPayment({
  gross,
  planBase,
  policy,
  method,
  installments = 1,
  acquirerFees,
}) {
  return computeAcquirerFee({
    gross,
    planBase,
    policy,
    method,
    installments,
    acquirerFees,
  });
}

/**
 * Previsão: amount = líquido estimado; amount_gross = valor do cliente.
 */
/** Valores para previsão com fees já resolvidas. */
export function forecastInflowAmountsFromFees(
  gross,
  method,
  installments,
  acquirerFees,
  policy,
  planBase
) {
  const g = roundMoney(gross);
  if (g < 0.01) return { amount: 0, amount_gross: 0 };
  const fees = normalizeAcquirerFees(acquirerFees);
  if (!hasAcquirerFeesConfigured(fees)) {
    return { amount: g, amount_gross: g };
  }
  const { fee, net } = computeAcquirerFee({
    gross: g,
    planBase,
    policy,
    method,
    installments,
    acquirerFees: fees,
  });
  return { amount: net, amount_gross: g, acquirer_fee: fee };
}

/** Taxa de antecipação sobre valor líquido ou bruto informado. */
export function computeAnticipationFee(amount, acquirerFees) {
  const base = roundMoney(amount);
  if (base < 0.01) return 0;
  const fees = normalizeAcquirerFees(acquirerFees);
  const pct = Number(fees.antecipacao?.percent ?? 0) || 0;
  const fixed = Number(fees.antecipacao?.fixed ?? 0) || 0;
  if (!(pct > 0) && !(fixed > 0)) return 0;
  return roundMoney(base * (pct / 100) + fixed);
}

export function enrichInstallmentScheduleWithAcquirerFees(
  schedule = [],
  method,
  installments,
  acquirerFees,
  creditDays = 0
) {
  const totalInstallments = Math.max(1, Math.trunc(Number(installments) || 1));
  const days = Math.max(0, Math.trunc(Number(creditDays) || 0));
  return schedule.map((row) => {
    const gross = roundMoney(row.amount ?? row.gross);
    const { fee, net } = computeAcquirerFee({
      gross,
      method,
      installments: totalInstallments,
      acquirerFees,
    });
    const dueDate = String(row.due_date || '').slice(0, 10);
    const expected_settlement_date =
      days > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
        ? addDaysYmd(dueDate, days)
        : dueDate;
    return {
      ...row,
      amount: gross,
      gross,
      fee,
      net,
      creditDays: days,
      expected_settlement_date,
    };
  });
}

export function acquirerFeesSummary(acquirerFees) {
  const fees = normalizeAcquirerFees(acquirerFees);
  const parts = [];
  if (fees.pix?.percent > 0) parts.push(`PIX ${fees.pix.percent}%`);
  if (fees.debito?.percent > 0) parts.push(`Déb. ${fees.debito.percent}%`);
  if (fees.credito_avista?.percent > 0) parts.push(`Créd. ${fees.credito_avista.percent}%`);
  const parcelHits = ACQUIRER_INSTALLMENT_COUNTS.filter((n) => Number(fees.credito_parcelado?.[String(n)] || 0) > 0);
  if (parcelHits.length) parts.push(`Parcelado (${parcelHits.length} faixas)`);
  if (fees.antecipacao?.percent > 0) parts.push(`Antec. ${fees.antecipacao.percent}%`);
  return parts.length ? parts.join(' · ') : 'Nenhuma taxa configurada';
}

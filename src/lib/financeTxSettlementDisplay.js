/**
 * Exibição e feedback de liquidação bancária (formas de recebimento — Fase 3).
 */
import {
  applyAutoMarkReceivedToPaymentStatus,
  resolveFinancialTxSettlement,
} from './paymentSettlement.js';
import { todayYmdLocal } from './financeForecastCore.js';

export function expectedSettlementYmd(tx) {
  const raw = String(tx?.expected_settlement_at || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function formatYmdBr(ymd) {
  const raw = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '—';
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
}

export function isFutureSettlementYmd(ymd, today = todayYmdLocal()) {
  const raw = String(ymd || '').slice(0, 10);
  return Boolean(raw && raw > today);
}

/** Subtítulo curto para lista/drawer do Caixa. */
export function txSettlementSubtitle(tx, today = todayYmdLocal()) {
  const ymd = expectedSettlementYmd(tx);
  if (!ymd) return null;
  const st = String(tx?.status || '').toLowerCase();
  if (st === 'pending') {
    return `Liquida em ${formatYmdBr(ymd)}`;
  }
  if (st === 'settled' && ymd > today) {
    return `Crédito previsto em ${formatYmdBr(ymd)}`;
  }
  return null;
}

/**
 * Mensagens informativas após registrar pagamento quando a config da forma altera o resultado.
 */
export function buildPaymentSettlementHints({
  financeConfig,
  method,
  requestedStatus = 'paid',
  actualStatus,
  paidAt,
}) {
  const hints = [];
  const requested = String(requestedStatus || 'paid').toLowerCase();
  const actual = String(actualStatus || requestedStatus || '').toLowerCase();

  const effective = applyAutoMarkReceivedToPaymentStatus(requested, method, financeConfig);
  if (
    (effective === 'pending' || actual === 'pending') &&
    (requested === 'paid' || requested === 'partial')
  ) {
    hints.push('A mensalidade permanece pendente na grade (forma sem recebimento automático).');
  }

  const settlement = resolveFinancialTxSettlement({
    financeConfig,
    method,
    paidAt: paidAt || new Date().toISOString(),
  });

  if (settlement.status === 'pending') {
    hints.push(
      `Lançamento no Caixa ficou pendente — liquida em ${formatYmdBr(settlement.forecast_date)}.`
    );
  } else if (settlement.expected_settlement_at && settlement.creditDays > 0) {
    hints.push(`Crédito na conta previsto para ${formatYmdBr(settlement.forecast_date)}.`);
  }

  return hints;
}

export function showPaymentSettlementToasts(toast, opts) {
  for (const message of buildPaymentSettlementHints(opts)) {
    if (typeof toast?.info === 'function') {
      toast.info(message, { duration: 8000 });
    } else if (typeof toast?.show === 'function') {
      toast.show({ type: 'info', message, duration: 8000 });
    }
  }
}

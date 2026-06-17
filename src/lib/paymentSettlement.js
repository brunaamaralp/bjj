/**
 * Liquidação no Caixa vs previsão de fluxo — formas de recebimento (Fase 3).
 */
import { canonicalPaymentMethodKey } from './paymentMethods.js';
import { readPaymentMethodSettings } from './paymentMethodSettings.js';
import { addDaysYmd } from './financeForecastCore.js';
import { findCaptureMethodById, resolveCreditDaysForInstallment } from './captureMethods.js';

/** Dias para cair na conta (por forma; meios de captura refinam na Fase 2+). */
export function resolveCreditDaysFromSettings(financeConfig, method) {
  const key = canonicalPaymentMethodKey(method);
  if (!key) return 0;
  const settings = readPaymentMethodSettings(financeConfig)[key];
  return Math.max(0, Math.trunc(Number(settings?.creditDays) || 0));
}

/** Prazo de crédito: meio de captura (parcela) → forma de recebimento. */
export function resolveCreditDaysFromPayment(
  financeConfig,
  method,
  { captureMethodId = '', installments = 1 } = {}
) {
  const cap = captureMethodId ? findCaptureMethodById(financeConfig, captureMethodId) : null;
  if (cap) {
    const fromCapture = resolveCreditDaysForInstallment(cap, installments);
    if (fromCapture > 0) return fromCapture;
  }
  return resolveCreditDaysFromSettings(financeConfig, method);
}

export function isoEndOfDayUtc(ymd) {
  const raw = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return `${raw}T23:59:59.999Z`;
}

/**
 * Resolve status do lançamento no Caixa e data prevista de crédito bancário.
 * @see docs/superpowers/specs/2026-06-17-formas-recebimento-meios-captura-TECH.md §2.1
 */
export function resolveFinancialTxSettlement({
  financeConfig,
  method,
  paidAt,
  dueDate,
  captureMethodId = '',
  installments = 1,
}) {
  const key = canonicalPaymentMethodKey(method);
  const settings = readPaymentMethodSettings(financeConfig)[key] || {};
  const creditDays = resolveCreditDaysFromPayment(financeConfig, method, {
    captureMethodId,
    installments,
  });
  const autoSettle = settings.autoSettle !== false;
  const paidIso = String(paidAt || new Date().toISOString());
  const paidYmd = paidIso.slice(0, 10);
  const dueYmd = String(dueDate || '').slice(0, 10);
  const forecastYmd =
    creditDays > 0 ? addDaysYmd(paidYmd, creditDays) : dueYmd || paidYmd;

  if (autoSettle) {
    return {
      status: 'settled',
      settledAt: paidIso,
      expected_settlement_at: creditDays > 0 ? isoEndOfDayUtc(forecastYmd) : null,
      forecast_date: forecastYmd,
      creditDays,
      autoSettle: true,
    };
  }

  return {
    status: 'pending',
    settledAt: null,
    expected_settlement_at: isoEndOfDayUtc(forecastYmd),
    forecast_date: forecastYmd,
    creditDays,
    autoSettle: false,
  };
}

/**
 * Aplica `autoMarkReceived` da forma ao status do pagamento do aluno.
 */
export function applyAutoMarkReceivedToPaymentStatus(status, method, financeConfig) {
  const key = canonicalPaymentMethodKey(method);
  const settings = readPaymentMethodSettings(financeConfig)[key];
  const s = String(status || 'pending').toLowerCase();
  if (s === 'awaiting' || s === 'cancelled' || s === 'covered' || s === 'frozen') {
    return s;
  }
  if (settings?.autoMarkReceived === false && (s === 'paid' || s === 'partial')) {
    return 'pending';
  }
  return s;
}

/** Campos de status para espelho no Caixa (vendas, mensalidades, etc.). */
export function financialTxSettlementFields({
  financeConfig,
  method,
  paidAt,
  dueDate = null,
  captureMethodId = '',
  installments = 1,
}) {
  const settlement = resolveFinancialTxSettlement({
    financeConfig,
    method,
    paidAt,
    dueDate,
    captureMethodId,
    installments,
  });
  return {
    status: settlement.status,
    settledAt: settlement.settledAt,
    expected_settlement_at: settlement.expected_settlement_at,
  };
}

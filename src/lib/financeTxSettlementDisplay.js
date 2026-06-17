/**
 * Exibição e feedback de liquidação bancária (formas de recebimento — Fase 3).
 */
import {
  applyAutoMarkReceivedToPaymentStatus,
  resolveFinancialTxSettlement,
} from './paymentSettlement.js';
import { readPaymentMethodSettings } from './paymentMethodSettings.js';
import { canonicalPaymentMethodKey } from './paymentMethods.js';
import { countActiveCaptureMethods } from './captureMethods.js';
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

/**
 * Preview na configuração de formas: simula registro de pagamento "pago" hoje.
 * @returns {{ steps: Array<{ id: string, tone: string, label: string, detail: string }> }}
 */
export function buildPaymentMethodRegistrationPreview(financeConfig, method, opts = {}) {
  const key = canonicalPaymentMethodKey(method) || String(method || '').trim();
  const settings = readPaymentMethodSettings(financeConfig)[key];
  const paidAt = opts.paidAt || `${todayYmdLocal()}T12:00:00.000Z`;

  if (!settings || settings.active === false) {
    return {
      steps: [
        {
          id: 'inactive',
          tone: 'warning',
          label: 'Forma inativa',
          detail: 'Não aparece em mensalidades, vendas nem perfil do aluno.',
        },
      ],
    };
  }

  const gradeStatus = applyAutoMarkReceivedToPaymentStatus('paid', method, financeConfig);
  const settlement = resolveFinancialTxSettlement({ financeConfig, method, paidAt });
  const forecastBr = formatYmdBr(settlement.forecast_date);

  const steps = [
    {
      id: 'grade',
      tone: gradeStatus === 'paid' ? 'success' : 'warning',
      label: gradeStatus === 'paid' ? 'Mensalidade: recebida' : 'Mensalidade: pendente',
      detail:
        gradeStatus === 'paid'
          ? 'O aluno aparece como pago na grade do mês.'
          : 'O pagamento permanece pendente na grade até conferência manual.',
    },
    {
      id: 'caixa',
      tone: settlement.status === 'settled' ? 'success' : 'warning',
      label: settlement.status === 'settled' ? 'Caixa: liquidado' : 'Caixa: pendente',
      detail:
        settlement.status === 'settled'
          ? 'O lançamento entra liquidado na data em que você registra.'
          : `O lançamento fica pendente até ${forecastBr} (ou liquidação manual).`,
    },
  ];

  if (settlement.creditDays > 0) {
    steps.push({
      id: 'bank',
      tone: 'info',
      label: 'Crédito bancário',
      detail: `Previsão de entrada na conta em ${forecastBr} (${settlement.creditDays} dia(s) corridos).`,
    });
  } else if (settlement.status === 'settled') {
    steps.push({
      id: 'forecast',
      tone: 'muted',
      label: 'Previsão de caixa',
      detail: 'Conta na previsão na data do registro.',
    });
  }

  if (['cartao_credito', 'cartao_debito'].includes(key) && countActiveCaptureMethods(financeConfig, key) > 0) {
    steps.push({
      id: 'capture-methods',
      tone: 'muted',
      label: 'Meios de captura',
      detail:
        countActiveCaptureMethods(financeConfig, key) > 1
          ? 'Na hora do pagamento, escolha o meio (maquininha/link). Taxas e prazos podem variar por meio e parcela.'
          : 'Taxas e prazo de crédito podem vir do meio de captura cadastrado, se tiver matriz própria.',
    });
  }

  return { steps };
}

/** Adapta `useUiStore().addToast` para `showPaymentSettlementToasts`. */
export function toastAdapterFromAddToast(addToast) {
  if (typeof addToast !== 'function') return null;
  return {
    info: (message, opts = {}) => addToast({ type: 'info', message, duration: 8000, ...opts }),
    show: (t) => addToast({ duration: 8000, ...t }),
  };
}

export function showPaymentSettlementToasts(toast, opts) {
  for (const message of buildPaymentSettlementHints(opts)) {
    if (typeof toast?.info === 'function') {
      toast.info(message, { duration: 8000 });
    } else if (typeof toast?.show === 'function') {
      toast.show({ type: 'info', message, duration: 8000 });
    } else if (typeof toast === 'function') {
      toast({ type: 'info', message, duration: 8000 });
    }
  }
}

/** Após `createPayment` — usa dados do payload + documento retornado. */
export function notifyPaymentSettlementAfterCreate(doc, data, { financeConfig, toast } = {}) {
  if (!financeConfig || !toast) return;
  showPaymentSettlementToasts(toast, {
    financeConfig,
    method: data?.method,
    requestedStatus: data?.status || 'paid',
    actualStatus: doc?.status,
    paidAt: data?.paid_at || new Date().toISOString(),
  });
}

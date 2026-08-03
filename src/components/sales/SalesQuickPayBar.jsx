import React, { useMemo } from 'react';
import { formatBRLFromCents } from '../../lib/moneyBr';
import {
  buildQuickPayment,
  normalizePaymentForma,
  normalizePaymentInstallments,
} from '../../lib/salePayments';
import { listActivePaymentMethods } from '../../lib/paymentMethodSettings.js';
import {
  needsCaptureMethodSelect,
  whenCaptureMethodChanges,
  whenPaymentMethodChangesWithCapture,
} from '../../lib/captureMethodPaymentForm.js';
import { findCaptureMethodById } from '../../lib/captureMethods.js';
import CaptureMethodSelect from '../finance/CaptureMethodSelect.jsx';
import CardBrandSelect from '../finance/CardBrandSelect.jsx';

const QUICK_FORMS = [
  { forma: 'pix', label: 'PIX' },
  { forma: 'dinheiro', label: 'Dinheiro' },
  { forma: 'cartao_debito', label: 'Débito' },
  { forma: 'cartao_credito', label: 'Crédito' },
];

export default function SalesQuickPayBar({
  totalCents,
  disabled,
  onApply,
  onFocusCashReceived,
  compact = false,
  financeConfig = null,
  payments = null,
  onPaymentsChange = null,
}) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const totalLabel = formatBRLFromCents(total);
  const selectedForma = normalizePaymentForma(payments?.[0]?.forma);

  const quickForms = useMemo(() => {
    if (!financeConfig) return QUICK_FORMS;
    const active = new Set(listActivePaymentMethods(financeConfig).map((m) => m.value));
    return QUICK_FORMS.filter((q) => active.has(q.forma));
  }, [financeConfig]);

  const handleClick = (forma) => {
    let rows = buildQuickPayment(forma, total);
    if (forma === 'cartao_credito' || forma === 'cartao_debito') {
      const defaults = whenPaymentMethodChangesWithCapture(financeConfig, forma);
      rows = rows.map((r, i) => (i === 0 ? { ...r, ...defaults } : r));
    }
    onApply?.(rows);
    if (forma === 'dinheiro') {
      window.setTimeout(() => onFocusCashReceived?.(), 50);
    }
  };

  const row = payments?.[0] || null;
  const showCreditExtras = selectedForma === 'cartao_credito' && row && typeof onPaymentsChange === 'function';
  const installments = normalizePaymentInstallments(row?.forma, row?.installments);
  const capture = row?.capture_method_id
    ? findCaptureMethodById(financeConfig, row.capture_method_id)
    : null;
  const maxInstallments = Math.min(12, Math.max(1, Number(capture?.maxInstallments) || 12));

  const patchRow = (patch) => {
    if (!row || !onPaymentsChange) return;
    onPaymentsChange([{ ...row, ...patch }]);
  };

  return (
    <div className={`sales-quick-pay${compact ? ' sales-quick-pay--compact' : ''}`}>
      <span className="sales-quick-pay__label text-xs text-muted">Pagamento rápido</span>
      <div className="sales-quick-pay__buttons" role="group" aria-label="Pagamento rápido">
        {quickForms.map((q) => {
          const active = selectedForma === q.forma;
          return (
            <button
              key={q.forma}
              type="button"
              className={`btn-outline sales-quick-pay__btn${active ? ' sales-quick-pay__btn--active' : ''}`}
              aria-pressed={active}
              disabled={disabled || total <= 0}
              onClick={() => handleClick(q.forma)}
            >
              <span className="sales-quick-pay__btn-label">{q.label}</span>
              <span className="sales-quick-pay__btn-total">{totalLabel}</span>
            </button>
          );
        })}
      </div>

      {showCreditExtras ? (
        <div className="sales-quick-pay__extras" aria-label="Detalhes do crédito">
          <CaptureMethodSelect
            financeConfig={financeConfig}
            method="cartao_credito"
            value={row.capture_method_id}
            id="sale-quick-capture"
            className="form-input"
            variant="compact"
            disabled={disabled}
            onChange={(captureId) =>
              patchRow({
                ...whenCaptureMethodChanges(financeConfig, captureId, 'cartao_credito'),
                installments: Math.min(
                  Math.max(
                    1,
                    Number(findCaptureMethodById(financeConfig, captureId)?.maxInstallments) || 12
                  ),
                  installments
                ),
              })
            }
          />
          <div className="sales-quick-pay__installments">
            <label className="text-xs sales-payment-row__field-label" htmlFor="sale-quick-installments">
              Parcelas
            </label>
            <select
              id="sale-quick-installments"
              className="form-input"
              disabled={disabled}
              value={String(installments)}
              aria-label="Parcelas"
              onChange={(e) =>
                patchRow({
                  installments: Math.min(maxInstallments, Math.max(1, Number(e.target.value) || 1)),
                  card_brand: '',
                })
              }
            >
              {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {n}x
                </option>
              ))}
            </select>
          </div>
          <CardBrandSelect
            financeConfig={financeConfig}
            method="cartao_credito"
            installments={installments}
            captureMethodId={row.capture_method_id}
            feeReceiverId={row.fee_receiver_id}
            bankAccount={row.conta}
            value={row.card_brand}
            id="sale-quick-brand"
            className="form-input"
            variant="compact"
            disabled={disabled}
            onChange={(brand) => patchRow({ card_brand: brand })}
          />
        </div>
      ) : null}

      {selectedForma === 'cartao_debito' &&
      row &&
      typeof onPaymentsChange === 'function' &&
      needsCaptureMethodSelect(financeConfig, 'cartao_debito') ? (
        <div className="sales-quick-pay__extras">
          <CaptureMethodSelect
            financeConfig={financeConfig}
            method="cartao_debito"
            value={row.capture_method_id}
            id="sale-quick-capture-debit"
            className="form-input"
            variant="compact"
            disabled={disabled}
            onChange={(captureId) =>
              patchRow(whenCaptureMethodChanges(financeConfig, captureId, 'cartao_debito'))
            }
          />
        </div>
      ) : null}
    </div>
  );
}

import React, { useMemo } from 'react';
import { buildPaymentMethodRegistrationPreview } from '../../../lib/financeTxSettlementDisplay.js';

const TONE_CLASS = {
  success: 'finance-payment-methods__preview-step--success',
  warning: 'finance-payment-methods__preview-step--warning',
  info: 'finance-payment-methods__preview-step--info',
  muted: 'finance-payment-methods__preview-step--muted',
};

export default function FinancePaymentMethodPreview({ financeConfig, method }) {
  const preview = useMemo(
    () => buildPaymentMethodRegistrationPreview(financeConfig, method),
    [financeConfig, method]
  );

  if (!preview?.steps?.length) return null;

  return (
    <section
      className="finance-payment-methods__preview"
      aria-labelledby="finance-payment-method-preview-heading"
    >
      <h4 id="finance-payment-method-preview-heading" className="finance-payment-methods__preview-title">
        Se você registrar um pagamento hoje
      </h4>
      <ol className="finance-payment-methods__preview-steps">
        {preview.steps.map((step) => (
          <li
            key={step.id}
            className={`finance-payment-methods__preview-step ${TONE_CLASS[step.tone] || ''}`}
          >
            <span className="finance-payment-methods__preview-label">{step.label}</span>
            <span className="finance-payment-methods__preview-detail text-small text-muted">
              {step.detail}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

import React from 'react';
import StatusBanner from '../shared/StatusBanner.jsx';
import { paidAtCoverageDivergenceMessage } from '../../lib/paymentReceiptDate.js';

/**
 * Aviso quando paid_at e mês de cobertura divergem (impacto no caixa).
 */
export default function PaymentReceiptDateBanner({
  payForm,
  referenceMonth,
  onUseCoverageDate,
  className = '',
}) {
  const message = paidAtCoverageDivergenceMessage(payForm, { referenceMonth });
  if (!message) return null;

  return (
    <StatusBanner
      variant="warning"
      message={message}
      className={className}
      action={
        onUseCoverageDate
          ? { label: 'Usar 1º dia do mês de cobertura', onClick: onUseCoverageDate }
          : undefined
      }
    />
  );
}

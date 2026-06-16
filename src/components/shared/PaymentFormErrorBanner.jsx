import '../../styles/payment-modal-feedback.css';
import React from 'react';

/** Erro de API/submit persistente no topo de modais de pagamento. */
export default function PaymentFormErrorBanner({ message, className = '' }) {
  const text = String(message || '').trim();
  if (!text) return null;
  return (
    <p
      role="alert"
      className={`payment-form-error-banner${className ? ` ${className}` : ''}`}
    >
      {text}
    </p>
  );
}

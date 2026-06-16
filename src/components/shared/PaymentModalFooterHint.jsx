import '../../styles/payment-modal-feedback.css';
import React from 'react';

/**
 * Hint no rodapé de modais de pagamento (botão desabilitado, validação).
 * variant: muted | error
 */
export default function PaymentModalFooterHint({
  children,
  variant = 'muted',
  id,
  className = '',
}) {
  if (children == null || children === '') return null;
  const isError = variant === 'error';
  return (
    <p
      id={id}
      className={`payment-modal-footer-hint${isError ? ' payment-modal-footer-hint--error' : ''}${className ? ` ${className}` : ''}`}
      role={isError ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

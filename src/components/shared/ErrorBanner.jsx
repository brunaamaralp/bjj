import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Banner de erro reutilizável (substitui dashboard-error-banner).
 */
export default function ErrorBanner({
  message,
  onRetry,
  retryLabel = 'Tentar novamente',
  className = '',
}) {
  return (
    <div className={`navi-error-banner${className ? ` ${className}` : ''}`} role="alert">
      <AlertCircle size={18} strokeWidth={2} className="navi-error-banner__icon" aria-hidden />
      <span className="navi-error-banner__message">{message}</span>
      {onRetry ? (
        <button type="button" className="btn-secondary navi-error-banner__retry" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const ICONS = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

/**
 * Banner persistente de status (erro, aviso, info, sucesso).
 */
export default function StatusBanner({
  variant = 'error',
  message,
  children,
  onRetry,
  retryLabel = 'Tentar novamente',
  action,
  className = '',
}) {
  const v = ICONS[variant] ? variant : 'error';
  const Icon = ICONS[v];
  const role = v === 'error' || v === 'warning' ? 'alert' : 'status';

  return (
    <div
      className={`navi-status-banner navi-status-banner--${v}${className ? ` ${className}` : ''}`}
      role={role}
    >
      <Icon size={18} strokeWidth={2} className="navi-status-banner__icon" aria-hidden />
      {children ? (
        <div className="navi-status-banner__message">{children}</div>
      ) : (
        <span className="navi-status-banner__message">{message}</span>
      )}
      {action ? (
        typeof action === 'object' && action.href ? (
          <a href={action.href} className="navi-status-banner__action edit-link">
            {action.label}
          </a>
        ) : typeof action === 'object' && action.onClick ? (
          <button type="button" className="btn-secondary navi-status-banner__action" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null
      ) : null}
      {onRetry ? (
        <button type="button" className="btn-secondary navi-status-banner__retry" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

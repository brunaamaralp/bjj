import '../../styles/async-button.css';
import React from 'react';
import { Loader2 } from 'lucide-react';

const VARIANT_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  danger: 'btn-danger',
  warning: 'btn-warning',
};

/**
 * Botão com estado de carregamento (Loader2 à esquerda do texto).
 */
export default function AsyncButton({
  loading = false,
  onClick,
  children,
  variant = 'primary',
  size,
  className = '',
  disabled,
  type = 'button',
  ...rest
}) {
  const btnClass = [VARIANT_CLASS[variant] || VARIANT_CLASS.primary, size === 'sm' ? 'btn-sm' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={btnClass}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="navi-async-btn__inner">
          <Loader2 size={16} className="navi-async-btn__spin" aria-hidden />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

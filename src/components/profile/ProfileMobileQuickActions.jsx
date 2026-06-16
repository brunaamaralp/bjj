import React from 'react';

/**
 * Faixa horizontal de ações no painel mobile (perfil lead/aluno com painel aberto).
 */
export default function ProfileMobileQuickActions({ actions = [], className = '' }) {
  const visible = actions.filter(Boolean);
  if (!visible.length) return null;

  return (
    <div
      className={`profile-mobile-quick-actions${className ? ` ${className}` : ''}`}
      role="toolbar"
      aria-label="Ações rápidas"
    >
      {visible.map(({ key, label, icon: Icon, onClick, disabled }) => (
        <button
          key={key}
          type="button"
          className="profile-mobile-quick-actions__btn"
          onClick={onClick}
          disabled={disabled}
        >
          {Icon ? <Icon size={14} strokeWidth={2} aria-hidden /> : null}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

import React from 'react';

/**
 * Checkbox opt-in para notificar a equipe ao salvar nota de perfil.
 */
export default function NotifyTeamCheckbox({
  id = 'notify-team-note',
  checked = false,
  onChange,
  disabled = false,
}) {
  return (
    <div className="notify-team-checkbox">
      <label htmlFor={id} className="notify-team-checkbox__label">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(checked)}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span>Notificar equipe</span>
      </label>
      <p className="notify-team-checkbox__hint text-small text-muted">
        Use para informações que outras pessoas da equipe precisam ver.
      </p>
      <style>{`
        .notify-team-checkbox { margin-top: 8px; }
        .notify-team-checkbox__label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-heading, var(--text));
          cursor: pointer;
        }
        .notify-team-checkbox__label input {
          width: 16px;
          height: 16px;
          accent-color: var(--color-primary, var(--petroleo));
          cursor: pointer;
        }
        .notify-team-checkbox__hint {
          margin: 4px 0 0 24px;
          line-height: 1.35;
        }
      `}</style>
    </div>
  );
}

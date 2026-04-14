import React from 'react';
import { useUiStore } from '../store/useUiStore';

export default function NaviToasts() {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);
  const pauseToast = useUiStore((s) => s.pauseToast);
  const resumeToast = useUiStore((s) => s.resumeToast);

  if (!toasts?.length) return null;

  return (
    <div className="navi-toast-container">
      {toasts.map((t) => {
        const type = t.type || 'info';
        const durationMs = typeof t.durationMs === 'number' ? t.durationMs : 4000;
        const persistent = Boolean(t.persistent);
        return (
          <div
            key={t.id}
            className={`navi-toast ${type}${t.removing ? ' removing' : ''}`}
            role="status"
            onMouseEnter={() => pauseToast(t.id)}
            onMouseLeave={() => resumeToast(t.id)}
          >
            <span className="navi-toast-message">{t.message}</span>
            {t.secondaryAction && (
              <button
                type="button"
                className="navi-toast-action"
                onClick={(e) => {
                  e.stopPropagation();
                  try {
                    t.secondaryAction.onClick();
                  } catch {
                    void 0;
                  }
                  removeToast(t.id);
                }}
                style={{
                  marginRight: 6,
                  padding: '4px 10px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {t.secondaryAction.label}
              </button>
            )}
            {t.action && (
              <button
                type="button"
                className="navi-toast-action"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const ret = t.action.onClick();
                    const awaited = ret && typeof ret.then === 'function' ? await ret : ret;
                    if (awaited === false) return;
                  } catch {
                    return;
                  }
                  removeToast(t.id);
                }}
                style={{
                  marginRight: 6,
                  padding: '4px 10px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: `1px solid ${t.actionDanger ? 'var(--danger)' : 'currentColor'}`,
                  borderRadius: 8,
                  background: 'transparent',
                  color: t.actionDanger ? 'var(--danger)' : 'inherit',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="navi-toast-close"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(t.id);
              }}
              aria-label="Fechar notificação"
            >
              ×
            </button>
            {!t.removing && !persistent && durationMs > 0 && (
              <span
                className="navi-toast-progress"
                style={{ animationDuration: `${durationMs}ms` }}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

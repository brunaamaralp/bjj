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
        return (
          <div
            key={t.id}
            className={`navi-toast ${type}${t.removing ? ' removing' : ''}`}
            role="status"
            onMouseEnter={() => pauseToast(t.id)}
            onMouseLeave={() => resumeToast(t.id)}
          >
            <span className="navi-toast-message">{t.message}</span>
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
            {!t.removing && (
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

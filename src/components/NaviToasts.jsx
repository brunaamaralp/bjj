import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useUiStore } from '../store/useUiStore';

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export default function NaviToasts() {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);
  const pauseToast = useUiStore((s) => s.pauseToast);
  const resumeToast = useUiStore((s) => s.resumeToast);

  if (!toasts?.length) return null;

  return (
    <div className="navi-toast-container" aria-live="polite">
      {toasts.map((t) => {
        const type = t.type || 'info';
        const durationMs = typeof t.durationMs === 'number' ? t.durationMs : 4000;
        const persistent = Boolean(t.persistent);
        const Icon = TOAST_ICONS[type] || Info;
        const isError = type === 'error';

        return (
          <div
            key={t.id}
            className={`navi-toast ${type}${t.removing ? ' removing' : ''}`}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            onMouseEnter={() => pauseToast(t.id)}
            onMouseLeave={() => resumeToast(t.id)}
          >
            <Icon size={18} strokeWidth={2} className="navi-toast-icon" aria-hidden />
            <span className="navi-toast-message">{t.message}</span>
            {t.secondaryAction && (
              <button
                type="button"
                className="navi-toast-action navi-toast-action--secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  try {
                    t.secondaryAction.onClick();
                  } catch {
                    void 0;
                  }
                  removeToast(t.id);
                }}
              >
                {t.secondaryAction.label}
              </button>
            )}
            {t.action && (
              <button
                type="button"
                className={`navi-toast-action${t.actionDanger ? ' navi-toast-action--danger' : ''}`}
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

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Painel lateral para wizard, editor e teste do agente (padrão drawer do app).
 */
export default function AgentIASidePanel({ open, title, subtitle, onClose, children, wide = false }) {
    useEffect(() => {
        if (!open || typeof document === 'undefined') return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    useEffect(() => {
        if (!open || !onClose) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <>
            <div className="agent-ia-sheet-backdrop" role="presentation" onMouseDown={onClose} />
            <aside
                className={['agent-ia-sheet-panel', wide ? 'agent-ia-sheet-panel--wide' : ''].filter(Boolean).join(' ')}
                role="dialog"
                aria-modal="true"
                aria-labelledby="agent-ia-sheet-title"
            >
                <header className="agent-ia-sheet-header">
                    <div className="agent-ia-sheet-header__text">
                        <h2 id="agent-ia-sheet-title" className="agent-ia-sheet-heading">
                            {title}
                        </h2>
                        {subtitle ? <p className="agent-ia-sheet-subtitle">{subtitle}</p> : null}
                    </div>
                    <button type="button" className="agent-ia-sheet-close" onClick={onClose} aria-label="Fechar">
                        <X size={18} strokeWidth={2} aria-hidden />
                    </button>
                </header>
                <div className="agent-ia-sheet-body">{children}</div>
            </aside>
        </>,
        document.body
    );
}

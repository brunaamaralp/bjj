import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { useModalA11y } from '../../hooks/useModalA11y.js';

export default function SalesVariantPicker({ parent, onSelect, onClose }) {
  useModalA11y({ isOpen: Boolean(parent), onClose });

  if (!parent || typeof document === 'undefined') return null;

  const variants = (parent.variants || []).slice().sort((a, b) => {
    const la = String(a.Tamanho || a.size || a.sku || '').trim();
    const lb = String(b.Tamanho || b.size || b.sku || '').trim();
    return la.localeCompare(lb, 'pt-BR', { numeric: true });
  });

  return createPortal(
    <div className="navi-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="card navi-modal-dialog sales-variant-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Escolher variante"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sales-variant-picker__head">
          <div>
            <h4 className="navi-section-heading sales-variant-picker__title">{parent.nome}</h4>
            <p className="text-small text-muted sales-variant-picker__subtitle">
              Escolha tamanho ou cor
            </p>
          </div>
          <button type="button" className="btn-action-ghost" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="sales-variant-picker__chips" role="list">
          {variants.length === 0 ? (
            <p className="text-small text-muted">Nenhuma variante cadastrada para este produto.</p>
          ) : (
            variants.map((v) => {
              const label = [v.Tamanho || v.size, v.color].filter(Boolean).join(' / ') || 'Único';
              const out = !v.canAdd;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="listitem"
                  className={`sales-variant-picker__chip${out ? ' sales-variant-picker__chip--out' : ''}`}
                  disabled={out}
                  onClick={() => !out && onSelect(v)}
                >
                  <span className="sales-variant-picker__chip-label">{label}</span>
                  <span className="sales-variant-picker__chip-meta text-small text-muted">
                    {out ? 'Esgotado' : `Disp. ${v.current_quantity}`}
                    {v.sale_price != null ? ` · ${formatBRL(v.sale_price)}` : ''}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

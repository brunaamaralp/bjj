import React from 'react';
import { X } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { useModalA11y } from '../../hooks/useModalA11y.js';

export default function SalesVariantPicker({ parent, onSelect, onClose }) {
  useModalA11y({ isOpen: Boolean(parent), onClose });

  if (!parent) return null;
  const variants = (parent.variants || []).filter((v) => v.canAdd);

  return (
    <div className="navi-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="card navi-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Escolher variante"
        style={{ maxWidth: 420, padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center gap-2" style={{ marginBottom: 12 }}>
          <div>
            <h4 className="navi-section-heading" style={{ margin: 0 }}>{parent.nome}</h4>
            <p className="text-small text-muted" style={{ margin: '4px 0 0' }}>
              Escolha tamanho ou cor
            </p>
          </div>
          <button type="button" className="btn-action-ghost" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="sales-variant-picker__chips" role="list">
          {variants.length === 0 ? (
            <p className="text-small text-muted">Nenhuma variante com estoque disponível.</p>
          ) : (
            variants.map((v) => {
              const label = [v.Tamanho || v.size, v.color].filter(Boolean).join(' / ') || 'Único';
              return (
                <button
                  key={v.id}
                  type="button"
                  role="listitem"
                  className="sales-variant-picker__chip"
                  onClick={() => onSelect(v)}
                >
                  <span className="sales-variant-picker__chip-label">{label}</span>
                  <span className="sales-variant-picker__chip-meta text-small text-muted">
                    Disp. {v.current_quantity}
                    {v.sale_price != null ? ` · ${formatBRL(v.sale_price)}` : ''}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
          .sales-variant-picker__chips { display: flex; flex-wrap: wrap; gap: 8px; }
          .sales-variant-picker__chip {
            display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
            padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border);
            background: var(--surface); cursor: pointer; min-width: 72px;
          }
          .sales-variant-picker__chip:hover { border-color: var(--accent); background: var(--accent-light); }
          .sales-variant-picker__chip-label { font-weight: 700; font-size: 14px; }
        `,
      }} />
    </div>
  );
}

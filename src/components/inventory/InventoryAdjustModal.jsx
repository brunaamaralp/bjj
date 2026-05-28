import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, EyeOff, Gift, ClipboardList } from 'lucide-react';
import {
  ADJUSTMENT_SUBTYPES,
  ADJUSTMENT_SUBTYPE_LABELS,
  ADJUSTMENT_SUBTYPE_ICON,
} from '../../lib/inventoryAdjust';
import { variantInventoryLabel } from '../../lib/stockInventory';
import { useModalA11y } from '../../hooks/useModalA11y.js';

const SUBTYPE_ICONS = {
  AlertTriangle,
  EyeOff,
  Gift,
  ClipboardList,
};

function SubtypeIcon({ subtype, size = 14 }) {
  const name = ADJUSTMENT_SUBTYPE_ICON[subtype] || 'AlertTriangle';
  const Icon = SUBTYPE_ICONS[name] || AlertTriangle;
  return <Icon size={size} aria-hidden />;
}

export default function InventoryAdjustModal({ open, item, loading, onClose, onSubmit }) {
  const [subtype, setSubtype] = useState('avaria');
  const [quantidade, setQuantidade] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSubtype('avaria');
      setQuantidade('');
      setNote('');
      setError('');
    }
  }, [open, item?.id]);

  const requestClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  useModalA11y({ isOpen: open && Boolean(item), onClose: requestClose });

  if (!open || !item || typeof document === 'undefined') return null;

  const label =
    item.display_label ||
    (item.parent_nome || item.nome
      ? `${item.parent_nome || item.nome}${variantInventoryLabel(item) !== 'Único' ? ` · ${variantInventoryLabel(item)}` : ''}`
      : item.nome);

  const handleSubmit = (e) => {
    e.preventDefault();
    const qty = Number(String(quantidade).replace(',', '.'));
    if (!Number.isFinite(qty) || qty === 0) {
      setError('Informe uma quantidade válida (diferente de zero)');
      return;
    }
    setError('');
    onSubmit({
      variant_id: item.id,
      quantity_change: qty,
      subtype,
      note: note.trim(),
    });
  };

  return createPortal(
    <div className="navi-modal-overlay" role="presentation" onClick={requestClose}>
      <div
        className="card navi-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-adjust-title"
        style={{ maxWidth: 420, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center gap-2" style={{ marginBottom: 12 }}>
          <h3 id="inventory-adjust-title" className="navi-section-heading" style={{ margin: 0 }}>
            Ajustar saldo
          </h3>
          <button type="button" className="btn-outline btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <p className="text-small text-muted" style={{ margin: '0 0 12px' }}>
          {label}
          {item.current_quantity != null ? (
            <span> — saldo atual: <strong>{item.current_quantity}</strong></span>
          ) : null}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="adjust-subtype">O que aconteceu?</label>
            <select
              id="adjust-subtype"
              className="form-input"
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
              required
            >
              {ADJUSTMENT_SUBTYPES.map((key) => (
                <option key={key} value={key}>
                  {ADJUSTMENT_SUBTYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="adjust-qty">Quantidade</label>
            <input
              id="adjust-qty"
              type="number"
              className="form-input"
              value={quantidade}
              onChange={(e) => {
                setError('');
                setQuantidade(e.target.value);
              }}
              placeholder="Ex.: -2 para perda, +1 para correção"
              required
              autoFocus
            />
            {error ? <p className="field-error">{error}</p> : null}
            <p className="text-xs text-muted" style={{ marginTop: 4 }}>
              Use valor negativo para reduzir o saldo e positivo para aumentar.
            </p>
          </div>
          <div className="form-group">
            <label htmlFor="adjust-note">Observação (opcional)</label>
            <input
              id="adjust-note"
              type="text"
              className="form-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-action-primary" disabled={loading}>
              {loading ? 'Registrando…' : 'Registrar ajuste'}
            </button>
          </div>
        </form>
        <ul className="inventory-adjust-subtype-hints text-xs text-muted" style={{ marginTop: 14, paddingLeft: 0, listStyle: 'none' }}>
          {ADJUSTMENT_SUBTYPES.map((key) => (
            <li key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <SubtypeIcon subtype={key} size={12} />
              {ADJUSTMENT_SUBTYPE_LABELS[key]}
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}

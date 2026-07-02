import React, { useCallback, useMemo, useState } from 'react';
import { Minus, Plus, ArrowRight } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import {
  ADJUSTMENT_SUBTYPES,
  ADJUSTMENT_SUBTYPE_LABELS,
  previewBalanceAfterAdjustment,
  quantityChangeFromAdjustment,
  subtypeSuggestsRemoval,
} from '../../lib/inventoryAdjust';
import { variantInventoryLabel } from '../../lib/stockInventory';
import FieldError from '../shared/FieldError.jsx';

function InventoryAdjustModalForm({ open, item, loading, onClose, onSubmit }) {
  const currentQty = Number(item?.current_quantity);
  const saldoAtual = Number.isFinite(currentQty) ? currentQty : 0;

  const [subtype, setSubtype] = useState('avaria');
  const [inputMode, setInputMode] = useState('units');
  const [direction, setDirection] = useState('remove');
  const [quantidade, setQuantidade] = useState('1');
  const [saldoCorreto, setSaldoCorreto] = useState(() => String(saldoAtual));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = loading || submitting;

  const requestClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const previewOpts = useMemo(() => {
    if (inputMode === 'target') {
      return {
        currentQuantity: saldoAtual,
        targetQuantity: saldoCorreto,
      };
    }
    return {
      currentQuantity: saldoAtual,
      direction,
      quantity: quantidade,
    };
  }, [inputMode, saldoAtual, saldoCorreto, direction, quantidade]);

  const preview = useMemo(() => previewBalanceAfterAdjustment(previewOpts), [previewOpts]);

  const runSubmit = useCallback(async () => {
    if (!item?.id) return;

    const quantity_change = quantityChangeFromAdjustment(
      inputMode === 'target'
        ? { currentQuantity: saldoAtual, targetQuantity: saldoCorreto }
        : { currentQuantity: saldoAtual, direction, quantity: quantidade }
    );

    if (quantity_change == null || quantity_change === 0) {
      setError(
        inputMode === 'target'
          ? 'Informe o saldo correto (diferente do atual)'
          : 'Informe quantas unidades deseja ajustar'
      );
      return;
    }

    const after = saldoAtual + quantity_change;
    if (after < 0) {
      setError(`Saldo insuficiente: há ${saldoAtual} unidade(s) em estoque`);
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await onSubmit({
        variant_id: item.id,
        quantity_change,
        subtype,
        note: note.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    direction,
    inputMode,
    item?.id,
    note,
    onSubmit,
    quantidade,
    saldoAtual,
    saldoCorreto,
    subtype,
  ]);

  const handleSubmit = (e) => {
    e.preventDefault();
    void runSubmit();
  };

  if (!item) return null;

  const label =
    item.display_label ||
    (item.parent_nome || item.nome
      ? `${item.parent_nome || item.nome}${variantInventoryLabel(item) !== 'Único' ? ` · ${variantInventoryLabel(item)}` : ''}`
      : item.nome);

  const handleSubtypeChange = (next) => {
    setSubtype(next);
    setError('');
    if (subtypeSuggestsRemoval(next)) setDirection('remove');
  };

  const submitLabel = (() => {
    if (!preview || preview.change === 0) return 'Registrar ajuste';
    const n = Math.abs(preview.change);
    const unit = n === 1 ? 'unidade' : 'unidades';
    if (preview.change < 0) return `Remover ${n} ${unit}`;
    return `Adicionar ${n} ${unit}`;
  })();

  return (
    <ModalShell
      open={open && Boolean(item)}
      title="Ajustar saldo"
      onClose={requestClose}
      closeOnOverlay={!busy}
      closeOnEsc={!busy}
      overlayCloseSuppressMs={400}
      maxWidth={420}
      className="navi-modal-overlay--form"
      dialogClassName="inventory-adjust-dialog"
      ariaLabelledBy="inventory-adjust-title"
      footer={
        <div className="flex gap-2 justify-end inventory-adjust-form__actions" style={{ width: '100%' }}>
          <button type="button" className="btn-outline" onClick={requestClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn-action-primary${preview?.change < 0 ? ' inventory-adjust-submit--remove' : ''}`}
            disabled={busy || !preview || preview.change === 0}
            onClick={() => void runSubmit()}
          >
            {busy ? 'Registrando…' : submitLabel}
          </button>
        </div>
      }
    >
        <p className="text-small text-muted inventory-adjust-dialog__product">{label}</p>
        <p className="inventory-adjust-dialog__balance" aria-live="polite">
          Saldo atual: <strong>{saldoAtual}</strong>
          {preview && preview.change !== 0 ? (
            <>
              <ArrowRight size={14} className="inventory-adjust-dialog__arrow" aria-hidden />
              <span>
                ficará <strong>{preview.after}</strong>
              </span>
            </>
          ) : null}
        </p>

        <form
          id="inventory-adjust-form"
          onSubmit={handleSubmit}
          className="inventory-adjust-form"
          noValidate
        >
          <div className="form-group">
            <label htmlFor="adjust-subtype">O que aconteceu?</label>
            <select
              id="adjust-subtype"
              className="form-input"
              value={subtype}
              onChange={(e) => handleSubtypeChange(e.target.value)}
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
            <span className="inventory-adjust-form__label" id="adjust-input-mode-label">
              Como deseja informar?
            </span>
            <div
              className="inventory-adjust-mode"
              role="tablist"
              aria-labelledby="adjust-input-mode-label"
            >
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === 'units'}
                className={`inventory-adjust-mode__btn${inputMode === 'units' ? ' is-active' : ''}`}
                onClick={() => {
                  setInputMode('units');
                  setError('');
                }}
              >
                Quantidade
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === 'target'}
                className={`inventory-adjust-mode__btn${inputMode === 'target' ? ' is-active' : ''}`}
                onClick={() => {
                  setInputMode('target');
                  setError('');
                }}
              >
                Saldo correto
              </button>
            </div>
          </div>

          {inputMode === 'units' ? (
            <>
              <div className="form-group">
                <span className="inventory-adjust-form__label" id="adjust-direction-label">
                  Ajuste
                </span>
                <div
                  className="inventory-adjust-direction"
                  role="group"
                  aria-labelledby="adjust-direction-label"
                >
                  <button
                    type="button"
                    className={`inventory-adjust-direction__btn${direction === 'remove' ? ' is-active' : ''}`}
                    aria-pressed={direction === 'remove'}
                    onClick={() => {
                      setDirection('remove');
                      setError('');
                    }}
                  >
                    <Minus size={16} aria-hidden />
                    Remover
                  </button>
                  <button
                    type="button"
                    className={`inventory-adjust-direction__btn${direction === 'add' ? ' is-active' : ''}`}
                    aria-pressed={direction === 'add'}
                    onClick={() => {
                      setDirection('add');
                      setError('');
                    }}
                  >
                    <Plus size={16} aria-hidden />
                    Adicionar
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="adjust-qty">
                  {direction === 'remove' ? 'Quantas unidades saem?' : 'Quantas unidades entram?'}
                </label>
                <input
                  id="adjust-qty"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  className="form-input"
                  value={quantidade}
                  onChange={(e) => {
                    setError('');
                    setQuantidade(e.target.value);
                  }}
                  required
                  autoFocus
                />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label htmlFor="adjust-target">Quantas unidades há agora?</label>
              <input
                id="adjust-target"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                className="form-input"
                value={saldoCorreto}
                onChange={(e) => {
                  setError('');
                  setSaldoCorreto(e.target.value);
                }}
                required
                autoFocus
              />
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                Útil após contagem física — o sistema calcula a diferença em relação ao saldo atual.
              </p>
            </div>
          )}

          {error ? <FieldError>{error}</FieldError> : null}

          <div className="form-group">
            <label htmlFor="adjust-note">Observação (opcional)</label>
            <input
              id="adjust-note"
              type="text"
              className="form-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Ex.: quebrou na queda, conferência de sexta"
            />
          </div>

        </form>
    </ModalShell>
  );
}

export default function InventoryAdjustModal({ open, item, loading, onClose, onSubmit }) {
  if (!open || !item) return null;
  return (
    <InventoryAdjustModalForm
      key={`${item.id}-${item.current_quantity}`}
      open={open}
      item={item}
      loading={loading}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

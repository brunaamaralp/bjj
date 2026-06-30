import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ModalShell from '../shared/ModalShell.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import FieldError from '../shared/FieldError.jsx';
import {
  STOCK_ENTRY_CORRECTION_MODES,
  stockEntryCorrectionError,
} from '../../lib/stockEntryCorrection.js';
import { useModalA11y } from '../../hooks/useModalA11y.js';

function formatMoveDate(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

export default function StockEntryCorrectionWizard(props) {
  const { open, move } = props;
  if (!open || !move) return null;
  const moveKey = String(move.id || move.$id || '').trim() || 'move';
  return <StockEntryCorrectionForm key={moveKey} {...props} />;
}

function StockEntryCorrectionForm({
  open,
  move,
  modulesFinance,
  canCorrect,
  loading,
  onClose,
  onSubmit,
}) {
  const storedQty = useMemo(() => {
    const q = Math.abs(Math.trunc(Number(move?.quantidade) || 0));
    return Number.isFinite(q) ? q : 0;
  }, [move]);

  const [mode, setMode] = useState(() => (modulesFinance ? 'finance_only' : 'quantity_only'));
  const [newPurchasePrice, setNewPurchasePrice] = useState(() =>
    move.purchase_price != null && Number(move.purchase_price) > 0 ? String(move.purchase_price) : ''
  );
  const [paymentMethod, setPaymentMethod] = useState(
    () => String(move.payment_method || 'pix').trim() || 'pix'
  );
  const [newQuantity, setNewQuantity] = useState(() => String(storedQty || ''));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  useModalA11y({ isOpen: open, onClose: requestClose, lockScroll: true });

  const quantityDelta = useMemo(() => {
    const target = Math.trunc(Number(String(newQuantity).replace(',', '.')));
    if (!Number.isFinite(target) || target < 0) return null;
    return target - storedQty;
  }, [newQuantity, storedQty]);

  const availableModes = useMemo(
    () =>
      STOCK_ENTRY_CORRECTION_MODES.filter((m) => {
        if (!modulesFinance && (m.id === 'finance_only' || m.id === 'both')) return false;
        return true;
      }),
    [modulesFinance]
  );

  const validate = () => {
    if (!canCorrect) {
      setError(stockEntryCorrectionError('forbidden'));
      return false;
    }
    if (mode === 'finance_only' || mode === 'both') {
      const price = Number(String(newPurchasePrice).replace(',', '.'));
      const hasLinked =
        Boolean(move?.financial_tx_id) &&
        String(move?.financial_tx_status || '').toLowerCase() === 'settled';
      const hasPrice = Number.isFinite(price) && price > 0;
      if (!hasPrice && !hasLinked) {
        setError(stockEntryCorrectionError('finance_correction_required'));
        return false;
      }
    }
    if (mode === 'quantity_only' || mode === 'both') {
      const target = Math.trunc(Number(String(newQuantity).replace(',', '.')));
      if (!Number.isFinite(target) || target < 0) {
        setError(stockEntryCorrectionError('invalid_quantity'));
        return false;
      }
      if (target === storedQty) {
        setError('A quantidade informada é igual à da entrada original.');
        return false;
      }
    }
    setError('');
    return true;
  };

  const handleConfirm = () => {
    if (!validate()) return;
    setConfirmOpen(true);
  };

  const runCorrection = async () => {
    const payload = {
      move_id: move.id,
      correction: mode,
      note: note.trim() || undefined,
    };
    if (mode === 'finance_only' || mode === 'both') {
      const price = Number(String(newPurchasePrice).replace(',', '.'));
      if (Number.isFinite(price) && price > 0) {
        payload.new_purchase_price = price;
        payload.new_payment_method = paymentMethod;
      }
    }
    if (mode === 'quantity_only' || mode === 'both') {
      payload.new_quantity = Math.trunc(Number(String(newQuantity).replace(',', '.')));
    }
    await onSubmit(payload);
    setConfirmOpen(false);
  };

  if (!open || !move) return null;

  const txCancelled = String(move.financial_tx_status || '').toLowerCase() === 'cancelled';
  const confirmDescription =
    mode === 'finance_only'
      ? 'A despesa liquidada no Caixa será estornada. Se informou um novo valor, uma nova despesa será criada.'
      : mode === 'quantity_only'
        ? 'O saldo em estoque será ajustado. A despesa no Caixa não será alterada.'
        : 'O Caixa será estornado/relançado e o saldo em estoque ajustado em sequência.';

  return (
    <>
      <ModalShell
        open
        title="Corrigir entrada"
        onClose={requestClose}
        closeOnOverlay={!loading}
        closeOnEsc={!loading && !confirmOpen}
        maxWidth={480}
        className="navi-modal-overlay--form"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={requestClose} disabled={loading}>
              Cancelar
            </button>
            <button type="button" className="btn-action-primary" onClick={handleConfirm} disabled={loading || !canCorrect}>
              {loading ? 'Corrigindo…' : 'Continuar'}
            </button>
          </>
        }
      >
        {!canCorrect ? (
          <p className="text-small text-warning mb-2" role="status">
            Apenas titular ou administrador pode corrigir entradas com valor no Caixa.
          </p>
        ) : null}

        <div className="stock-entry-correction-summary card" style={{ padding: 12, marginBottom: 12 }}>
          <p className="text-small mb-1">
            <strong>{move.item_label || 'Item'}</strong>
          </p>
          <p className="text-xs text-muted mb-0">
            {formatMoveDate(move.created_at)} · Entrada de {storedQty} un.
            {modulesFinance && move.purchase_price > 0 ? ` · ${formatMoney(move.purchase_price)}` : ''}
          </p>
          {move.financial_tx_id ? (
            <p className="text-xs mt-2 mb-0">
              <Link
                to={`/financeiro?tab=movimentacoes&tx=${encodeURIComponent(move.financial_tx_id)}`}
                className="task-drawer-link"
              >
                Ver despesa no Caixa
              </Link>
              {txCancelled ? ' · estornada' : ''}
            </p>
          ) : null}
        </div>

        <fieldset className="stock-entry-correction-modes" disabled={loading || !canCorrect}>
          <legend className="text-small font-medium mb-2">O que está errado?</legend>
          <div className="stock-entry-correction-modes__grid">
            {availableModes.map((m) => (
              <label
                key={m.id}
                className={`stock-entry-correction-mode${mode === m.id ? ' stock-entry-correction-mode--active' : ''}`}
              >
                <input
                  type="radio"
                  name="correction_mode"
                  value={m.id}
                  checked={mode === m.id}
                  onChange={() => setMode(m.id)}
                />
                <span className="stock-entry-correction-mode__label">{m.label}</span>
                <span className="stock-entry-correction-mode__desc text-xs text-muted">{m.description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {(mode === 'finance_only' || mode === 'both') && modulesFinance ? (
          <div className="card mt-3" style={{ padding: 12, border: '1px dashed var(--border-light)' }}>
            <p className="text-xs text-muted mb-2">Valor no Caixa</p>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 140px', margin: 0 }}>
                <label>Valor total correto (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-input"
                  value={newPurchasePrice}
                  onChange={(e) => setNewPurchasePrice(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px', margin: 0 }}>
                <label>Forma de pagamento</label>
                <select
                  className="form-input"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="pix">PIX</option>
                  <option value="debito">Débito</option>
                  <option value="credito_avista">Crédito à vista</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted mt-2 mb-0">
              Deixe em branco para apenas estornar a despesa anterior, sem novo lançamento.
            </p>
          </div>
        ) : null}

        {(mode === 'quantity_only' || mode === 'both') ? (
          <div className="form-group mt-3">
            <label>Quantidade correta da entrada</label>
            <input
              type="number"
              min={0}
              className="form-input"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
            />
            {quantityDelta != null && quantityDelta !== 0 ? (
              <p className="text-xs text-muted mt-1 mb-0">
                Ajuste no saldo: {quantityDelta > 0 ? `+${quantityDelta}` : quantityDelta} un.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="form-group mt-2">
          <label>Observação (opcional)</label>
          <input
            className="form-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo da correção"
          />
        </div>

        {error ? <FieldError className="mt-2">{error}</FieldError> : null}
      </ModalShell>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar correção"
        description={confirmDescription}
        confirmLabel={loading ? 'Corrigindo…' : 'Corrigir entrada'}
        loading={loading}
        onClose={() => {
          if (!loading) setConfirmOpen(false);
        }}
        onConfirm={() => void runCorrection()}
      />
    </>
  );
}

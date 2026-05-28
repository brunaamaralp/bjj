import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import FieldError from '../shared/FieldError.jsx';

export default function InventoryEntryModal({
  open,
  item,
  loading,
  modulesFinance,
  onClose,
  onSubmit,
}) {
  const [quantidade, setQuantidade] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setQuantidade(1);
      setPurchasePrice('');
      setPaymentMethod('pix');
      setError('');
    }
  }, [open, item?.id]);

  const requestClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  useModalA11y({ isOpen: open && Boolean(item), onClose: requestClose });

  if (!open || !item || typeof document === 'undefined') return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const qty = Number(quantidade);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Informe uma quantidade válida maior que zero');
      return;
    }
    setError('');
    const payload = {
      item_estoque_id: item.id,
      tipo: 'entrada',
      quantidade: qty,
    };
    if (purchasePrice !== '' && modulesFinance) {
      const price = Number(purchasePrice);
      if (Number.isFinite(price) && price > 0) {
        payload.purchase_price = price;
        payload.payment_method = paymentMethod;
      }
    }
    onSubmit(payload);
  };

  const label = item.Tamanho ? `${item.nome} · ${item.Tamanho}` : item.nome;

  return createPortal(
    <div className="navi-modal-overlay" role="presentation" onClick={requestClose}>
      <div
        className="card navi-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-entry-title"
        style={{ maxWidth: 420, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center gap-2" style={{ marginBottom: 12 }}>
          <h3 id="inventory-entry-title" className="navi-section-heading" style={{ margin: 0 }}>
            Registrar entrada
          </h3>
          <button type="button" className="btn-outline btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <p className="text-small text-muted" style={{ margin: '0 0 12px' }}>{label}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Quantidade</label>
            <input
              type="number"
              min={1}
              className="form-input"
              value={quantidade}
              onChange={(e) => {
                setError('');
                setQuantidade(e.target.value);
              }}
              autoFocus
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </div>
          {modulesFinance ? (
            <div className="card mt-2" style={{ padding: 12, border: '1px dashed var(--border-light)' }}>
              <p className="text-xs text-muted mb-2">Opcional: registrar compra no Caixa</p>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1 1 140px', margin: 0 }}>
                  <label>Valor total pago (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    className="form-input"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
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
            </div>
          ) : null}
          <div className="flex gap-2 justify-end mt-3">
            <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-secondary" disabled={loading}>
              {loading ? 'Registrando…' : 'Registrar entrada'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

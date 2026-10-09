import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import {
  DEFAULT_PRODUCT_DISCOUNT_PCT,
  computeProductDebitAmount,
} from '../../../lib/professorCompensation.js';
import { buildLessonStaffPickerOptions } from '../../../lib/staffRoster.js';

function formatMoneyBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function productLabel(p) {
  return String(p?.nome || p?.name || p?.display_label || p?.id || '').trim() || 'Produto';
}

/**
 * Modal de retirada de produto para professor (débito no fechamento).
 * Parent executa a API via `onSubmit(payload)` — payload pronto para `inventoryMove`.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   staffOptions?: { id: string, nome: string }[],
 *   teamMembers?: { id: string, nome: string }[],
 *   roster?: object[],
 *   products?: { id: string, product_id?: string, nome?: string, sale_price?: number, current_quantity?: number }[],
 *   discountPct?: number,
 *   initialStaffRef?: string,
 *   initialProductId?: string,
 *   loading?: boolean,
 *   onSubmit: (payload: object) => Promise<unknown>,
 * }} props
 */
export default function ProfessorProductWithdrawModal({
  open,
  onClose,
  staffOptions,
  teamMembers = [],
  roster = [],
  products = [],
  discountPct = DEFAULT_PRODUCT_DISCOUNT_PCT,
  initialStaffRef = '',
  initialProductId = '',
  loading = false,
  onSubmit,
}) {
  const [staffRef, setStaffRef] = useState('');
  const [productId, setProductId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const options = useMemo(() => {
    if (Array.isArray(staffOptions) && staffOptions.length) return staffOptions;
    return buildLessonStaffPickerOptions({ teamMembers, roster });
  }, [staffOptions, teamMembers, roster]);

  const productList = useMemo(
    () => (Array.isArray(products) ? products.filter((p) => p?.id) : []),
    [products]
  );

  useEffect(() => {
    if (!open) return;
    setStaffRef(String(initialStaffRef || '').trim());
    setProductId(String(initialProductId || '').trim());
    setQuantidade('1');
    setError('');
    setSubmitting(false);
  }, [open, initialStaffRef, initialProductId]);

  const selectedProduct = useMemo(
    () => productList.find((p) => String(p.id) === String(productId)) || null,
    [productList, productId]
  );

  const qty = Math.max(0, Math.trunc(Number(quantidade) || 0));
  const unitPrice = Number(selectedProduct?.sale_price ?? selectedProduct?.unit_price ?? 0);
  const pct = Number.isFinite(Number(discountPct)) ? Number(discountPct) : DEFAULT_PRODUCT_DISCOUNT_PCT;
  const debitAmount = computeProductDebitAmount({ unitPrice, qty, discountPct: pct });

  const busy = loading || submitting;

  const requestClose = useCallback(() => {
    if (busy) return;
    onClose?.();
  }, [busy, onClose]);

  const runSubmit = useCallback(async () => {
    if (!onSubmit) return;
    const staff = options.find((o) => o.id === staffRef);
    if (!staffRef || !staff) {
      setError('Selecione o professor/instrutor');
      return;
    }
    if (!selectedProduct) {
      setError('Selecione o produto');
      return;
    }
    if (qty < 1) {
      setError('Informe uma quantidade válida');
      return;
    }
    const available = Number(selectedProduct.current_quantity);
    if (Number.isFinite(available) && qty > available) {
      setError(`Saldo insuficiente: há ${available} unidade(s)`);
      return;
    }

    const staffName = staff.nome;
    const unit = Number.isFinite(unitPrice) ? unitPrice : 0;
    const payload = {
      item_estoque_id: selectedProduct.id,
      tipo: 'saida_professor',
      quantidade: qty,
      referencia_id: staffRef,
      motivo: `Retirada professor: ${staffName || staffRef}`,
      movement_kind: 'professor',
      product_id: selectedProduct.product_id || selectedProduct.id,
      unit_price: unit,
      line_total: debitAmount,
      source: 'professor_withdraw',
      notes: JSON.stringify({ discount_pct: pct, staff_name: staffName }),
    };

    setError('');
    setSubmitting(true);
    try {
      await onSubmit(payload);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Não foi possível registrar a retirada');
    } finally {
      setSubmitting(false);
    }
  }, [
    debitAmount,
    onClose,
    onSubmit,
    options,
    pct,
    qty,
    selectedProduct,
    staffRef,
    unitPrice,
  ]);

  const handleSubmit = (e) => {
    e.preventDefault();
    void runSubmit();
  };

  return (
    <ModalShell
      open={open}
      title="Retirada para professor"
      onClose={requestClose}
      closeOnOverlay={!busy}
      closeOnEsc={!busy}
      overlayCloseSuppressMs={400}
      maxWidth={440}
      className="navi-modal-overlay--form"
      dialogClassName="professor-withdraw-dialog"
      ariaLabelledBy="professor-withdraw-title"
      footer={
        <div className="flex gap-2 justify-end" style={{ width: '100%' }}>
          <button type="button" className="btn-outline" onClick={requestClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-action-primary"
            disabled={busy || !staffRef || !productId || qty < 1}
            onClick={() => void runSubmit()}
          >
            {busy ? 'Registrando…' : 'Registrar retirada'}
          </button>
        </div>
      }
    >
      <form id="professor-withdraw-form" onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="prof-withdraw-staff">Professor / instrutor</label>
          <select
            id="prof-withdraw-staff"
            className="form-input"
            value={staffRef}
            onChange={(e) => {
              setError('');
              setStaffRef(e.target.value);
            }}
            required
            disabled={busy}
          >
            <option value="">Selecione…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="prof-withdraw-product">Produto</label>
          <select
            id="prof-withdraw-product"
            className="form-input"
            value={productId}
            onChange={(e) => {
              setError('');
              setProductId(e.target.value);
            }}
            required
            disabled={busy}
          >
            <option value="">Selecione…</option>
            {productList.map((p) => (
              <option key={p.id} value={p.id}>
                {productLabel(p)}
                {Number.isFinite(Number(p.sale_price))
                  ? ` · ${formatMoneyBRL(p.sale_price)}`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="prof-withdraw-qty">Quantidade</label>
          <input
            id="prof-withdraw-qty"
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
            disabled={busy}
          />
        </div>

        {selectedProduct && qty >= 1 ? (
          <p className="text-small text-muted" aria-live="polite">
            Débito previsto ({pct}% desc.):{' '}
            <strong>{formatMoneyBRL(debitAmount)}</strong>
            {Number.isFinite(unitPrice) && unitPrice > 0
              ? ` — ${formatMoneyBRL(unitPrice)} × ${qty}`
              : null}
          </p>
        ) : null}

        {error ? <FieldError>{error}</FieldError> : null}
      </form>
    </ModalShell>
  );
}

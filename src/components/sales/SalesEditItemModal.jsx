import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import SalesCatalogPicker from './SalesCatalogPicker';
import SalesVariantPicker from './SalesVariantPicker';
import { useSalesCatalog } from '../../hooks/useSalesCatalog';
import { useLeadStore } from '../../store/useLeadStore';
import { useSalesStore } from '../../store/useSalesStore';
import { useUiStore } from '../../store/useUiStore';
import { readSalesSettings } from '../../lib/salesSettings';
import {
  defaultLineKindForParent,
  parentNeedsVariantPicker,
  suggestUnitPrice,
} from '../../lib/salesCatalog';
import { normalizeLineKind } from '../../lib/saleLineKind';
import { formatBRL } from '../../lib/moneyBr';
import { friendlySaleError } from '../../lib/errorMessages.js';

function buildNovoItem(product, parent, lineKind, lockPriceEdit) {
  const kind = normalizeLineKind(lineKind);
  const { price } = suggestUnitPrice(product, { lineKind: kind, parent });
  const unit =
    lockPriceEdit && price != null ? price : (price ?? (Number(product.sale_price) || 0));
  return {
    item_estoque_id: product.id,
    preco_unitario: unit,
    line_kind: kind,
  };
}

export default function SalesEditItemModal({
  open,
  sale,
  saleItem,
  onClose,
  onSuccess,
}) {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = useMemo(() => {
    if (!academyId) return null;
    return (academyList || []).find((x) => x.id === academyId) || null;
  }, [academyList, academyId]);
  const salesSettings = useMemo(() => readSalesSettings(academyDoc?.settings), [academyDoc]);

  const { products, loading: catalogLoading, error: catalogError } = useSalesCatalog(academyId);
  const updateSaleItem = useSalesStore((s) => s.updateSaleItem);
  const updating = useSalesStore((s) => s.updating);
  const addToast = useUiStore((s) => s.addToast);

  const [variantPickerParent, setVariantPickerParent] = useState(null);
  const [variantPickerLineKind, setVariantPickerLineKind] = useState('sale');
  const [pendingPick, setPendingPick] = useState(null);
  const [localError, setLocalError] = useState('');
  const [newQty, setNewQty] = useState(() => Math.max(1, Math.trunc(Number(saleItem?.quantidade) || 1)));

  useEffect(() => {
    setNewQty(Math.max(1, Math.trunc(Number(saleItem?.quantidade) || 1)));
  }, [saleItem?.id, saleItem?.quantidade]);

  const lineKind = normalizeLineKind(saleItem?.line_kind || 'sale');
  const oldQty = Math.max(1, Math.trunc(Number(saleItem?.quantidade) || 1));

  const maxQty = useMemo(() => {
    if (!pendingPick) return oldQty;
    const avail = Number(
      pendingPick.product?.disponivel ?? pendingPick.product?.disponivel_for_line ?? 0
    );
    if (!Number.isFinite(avail) || avail < 0) return Math.max(oldQty, newQty);
    return Math.max(1, Math.trunc(avail) + oldQty);
  }, [pendingPick, oldQty, newQty]);

  const resetPicker = useCallback(() => {
    setVariantPickerParent(null);
    setPendingPick(null);
    setLocalError('');
    setNewQty(Math.max(1, Math.trunc(Number(saleItem?.quantidade) || 1)));
  }, [saleItem?.quantidade, saleItem?.id]);

  const handleClose = useCallback(() => {
    resetPicker();
    onClose?.();
  }, [onClose, resetPicker]);

  const confirmPick = useCallback(
    (product, parent, kind) => {
      const novo = buildNovoItem(product, parent, kind, salesSettings.lockPriceEdit);
      if (!novo.preco_unitario || novo.preco_unitario <= 0) {
        addToast({
          type: 'error',
          message: 'Preço não cadastrado para este produto.',
        });
        return;
      }
      setPendingPick({
        product,
        parent,
        lineKind: kind,
        novo,
        label: parent
          ? `${parent.nome || parent.display_label} · ${product.Tamanho || product.size || ''}`.trim()
          : product.display_label || product.nome,
      });
      setVariantPickerParent(null);
    },
    [addToast, salesSettings.lockPriceEdit]
  );

  const handleCatalogPick = useCallback(
    (parent, pickLineKind) => {
      setLocalError('');
      const kind = normalizeLineKind(pickLineKind || defaultLineKindForParent(parent));
      if (parentNeedsVariantPicker(parent)) {
        setVariantPickerLineKind(kind);
        setVariantPickerParent(parent);
        return;
      }
      const variant = parent._singleVariant || parent.variants?.[0];
      if (!variant) {
        setLocalError('Produto sem variante disponível.');
        return;
      }
      confirmPick(
        { ...variant, image_url: variant.image_url || parent.image_url || '' },
        parent,
        kind
      );
    },
    [confirmPick]
  );

  const handleVariantSelect = useCallback(
    (variant) => {
      if (!variantPickerParent) return;
      confirmPick(
        { ...variant, image_url: variant.image_url || variantPickerParent.image_url || '' },
        variantPickerParent,
        variantPickerLineKind
      );
    },
    [confirmPick, variantPickerLineKind, variantPickerParent]
  );

  const handleConfirm = async () => {
    if (!pendingPick || !sale?.id || !saleItem?.id) return;
    const qty = Math.max(1, Math.min(maxQty, Math.trunc(Number(newQty) || 1)));
    if (qty < 1) {
      setLocalError('Informe uma quantidade válida.');
      return;
    }
    setLocalError('');
    const result = await updateSaleItem({
      venda_id: sale.id,
      sale_item_id: saleItem.id,
      novo_item: {
        ...pendingPick.novo,
        quantidade: qty,
      },
      motivo: 'troca_produto',
    });
    if (!result?.ok) {
      const msg = friendlySaleError(useSalesStore.getState().error) || 'Não foi possível trocar o produto.';
      setLocalError(msg);
      addToast({ type: 'error', message: msg });
      return;
    }
    addToast({ type: 'success', message: 'Produto trocado com sucesso.' });
    onSuccess?.(result);
    handleClose();
  };

  const oldSubtotal = useMemo(
    () => roundSubtotal(saleItem?.preco_unitario, saleItem?.quantidade),
    [saleItem]
  );
  const newSubtotal = useMemo(() => {
    if (!pendingPick) return 0;
    const qty = Math.max(1, Math.min(maxQty, Math.trunc(Number(newQty) || 1)));
    return roundSubtotal(pendingPick.novo.preco_unitario, qty);
  }, [pendingPick, newQty, maxQty]);

  if (!open || !sale || !saleItem) return null;

  if (variantPickerParent) {
    return (
      <SalesVariantPicker
        parent={variantPickerParent}
        lineKind={variantPickerLineKind}
        onSelect={handleVariantSelect}
        onClose={() => setVariantPickerParent(null)}
      />
    );
  }

  return (
    <ModalShell
      open
      title="Trocar produto"
      onClose={handleClose}
      maxWidth={720}
      className="sales-modal-backdrop navi-modal-overlay--form navi-modal-overlay--stacked"
      dialogClassName="sales-modal card sales-modal--wide sales-edit-item-modal"
    >
      <p className="text-small text-muted sales-edit-item-modal__intro">
        Substitua o item da venda <strong>{sale.id_short || sale.id}</strong>. O estoque do produto
        anterior volta e o novo produto é baixado automaticamente.
      </p>

      <div className="sales-edit-item-modal__current card card--subtle">
        <span className="text-xs text-muted">Item atual</span>
        <strong>{saleItem.display_label}</strong>
        <span className="text-small">
          {saleItem.quantidade} × {formatBRL(saleItem.preco_unitario)} = {formatBRL(oldSubtotal)}
        </span>
      </div>

      {pendingPick ? (
        <div className="sales-edit-item-modal__pending mt-3">
          <div className="sales-edit-item-modal__swap">
            <div className="sales-edit-item-modal__swap-col">
              <span className="text-xs text-muted">De</span>
              <span>{saleItem.display_label}</span>
            </div>
            <ArrowLeftRight size={18} aria-hidden className="sales-edit-item-modal__swap-icon" />
            <div className="sales-edit-item-modal__swap-col">
              <span className="text-xs text-muted">Para</span>
              <strong>{pendingPick.label}</strong>
              <div className="flex items-center gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
                <label className="text-small" htmlFor="sales-edit-item-qty">
                  Qtd
                </label>
                <input
                  id="sales-edit-item-qty"
                  type="number"
                  className="form-input"
                  style={{ width: 72 }}
                  min={1}
                  max={maxQty}
                  step={1}
                  value={newQty}
                  disabled={updating}
                  onChange={(e) => setNewQty(e.target.value)}
                />
                <span className="text-small text-muted">máx. {maxQty}</span>
              </div>
              <span className="text-small">
                {Math.max(1, Math.min(maxQty, Math.trunc(Number(newQty) || 1)))} ×{' '}
                {formatBRL(pendingPick.novo.preco_unitario)} = {formatBRL(newSubtotal)}
              </span>
            </div>
          </div>
          {Math.abs(newSubtotal - oldSubtotal) >= 0.01 ? (
            <p className="text-small sales-edit-item-modal__delta mt-2">
              Diferença no total da venda:{' '}
              <strong>{formatBRL(newSubtotal - oldSubtotal)}</strong>
              {newSubtotal > oldSubtotal
                ? ' (será registrado ajuste no Caixa)'
                : ' (será registrado estorno parcial no Caixa)'}
            </p>
          ) : null}
          <div className="sales-edit-item-modal__actions mt-3">
            <button type="button" className="btn-outline" disabled={updating} onClick={resetPicker}>
              Escolher outro
            </button>
            <button type="button" className="btn-primary" disabled={updating} onClick={() => void handleConfirm()}>
              {updating ? 'Salvando…' : 'Confirmar troca'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h4 className="navi-section-heading sales-modal__section-title mt-4">Novo produto</h4>
          {catalogError ? (
            <p className="text-small text-danger" role="alert">
              Não foi possível carregar o catálogo.
            </p>
          ) : null}
          <SalesCatalogPicker
            products={products}
            loading={catalogLoading}
            onPick={(parent, pickKind) => handleCatalogPick(parent, lineKind || pickKind)}
          />
        </>
      )}

      {localError ? (
        <p className="sales-edit-item-modal__error mt-3" role="alert">
          {localError}
        </p>
      ) : null}
    </ModalShell>
  );
}

function roundSubtotal(unit, qty) {
  const u = Number(unit) || 0;
  const q = Number(qty) || 1;
  return Math.round(u * q * 100) / 100;
}

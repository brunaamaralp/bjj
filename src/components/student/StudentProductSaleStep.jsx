import '../../styles/sales.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useSalesCatalog } from '../../hooks/useSalesCatalog';
import {
  suggestUnitPrice,
  cartVariantOptionsForLineKind,
  catalogLineAvailability,
  variantCanAddForLineKind,
  parentNeedsVariantPicker,
  variantOptionLabel,
  defaultLineKindForParent,
  patchCartLineFromCatalog,
} from '../../lib/salesCatalog';
import { normalizeLineKind } from '../../lib/saleLineKind';
import { readSalesSettings } from '../../lib/salesSettings';
import { formatBRL } from '../../lib/moneyBr';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { DateInput } from '../DateInput';
import SalesCatalogPicker from '../sales/SalesCatalogPicker';
import SalesVariantPicker from '../sales/SalesVariantPicker';
import SalesCart from '../sales/SalesCart';
import SalesPaymentBlock from '../sales/SalesPaymentBlock';
import SalesQuickPayBar from '../sales/SalesQuickPayBar';
import SalesCheckoutStickyBar from '../sales/SalesCheckoutStickyBar';
import SalePaymentModeSelector, { STUDENT_SALE_PAYMENT_MODES } from '../sales/SalePaymentModeSelector';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import useMatchMobile from '../../hooks/useMatchMobile';
import {
  createEmptyPaymentRow,
  serializePagamentosForApi,
  paymentsUiValid,
  rebalancePaymentsForTotal,
  buildQuickPayment,
  netPaidCentsFromRows,
} from '../../lib/salePayments';
import { friendlySaleError } from '../../lib/errorMessages.js';
import { getSaleFooterHint, isStudentProductSaleDirty } from '../../lib/saleModalDirty.js';

export const STUDENT_PRODUCT_SALE_FORM_ID = 'student-product-sale-form';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function createSaleIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sale-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export default function StudentProductSaleStep({
  student,
  onBack,
  onComplete,
  formId = STUDENT_PRODUCT_SALE_FORM_ID,
  hideSubmitButton = false,
  onVariantPickerChange,
  onDirtyChange,
  onSubmitStateChange,
  onNavigateAway,
}) {
  const academyId = useLeadStore((s) => s.academyId);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const addToast = useUiStore((s) => s.addToast);
  const createSale = useSalesStore((s) => s.createSale);
  const creating = useSalesStore((s) => s.creating);
  const { products, loading: catalogLoading, reload: reloadCatalog } = useSalesCatalog(academyId);

  const studentId = String(student?.id || student?.$id || '').trim();
  const studentName = String(student?.name || 'Aluno').trim();

  const [salesSettings, setSalesSettings] = useState(() => readSalesSettings(null));
  const [cart, setCart] = useState([]);
  const [payments, setPayments] = useState(() => [createEmptyPaymentRow(0)]);
  const [localError, setLocalError] = useState('');
  const [flashProductId, setFlashProductId] = useState(null);
  const [variantPickerParent, setVariantPickerParent] = useState(null);
  const [variantPickerLineKind, setVariantPickerLineKind] = useState('sale');
  const [receiveLater, setReceiveLater] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [manualPaymentOpen, setManualPaymentOpen] = useState(true);
  const [priceTouched, setPriceTouched] = useState({});
  const [mobilePanel, setMobilePanel] = useState('catalog');
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  const isMobileCheckout = useMatchMobile(900);
  const paymentMode = receiveLater ? 'deferred' : 'integral';

  const idempotencyKeyRef = useRef('');

  useEffect(() => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createSaleIdempotencyKey();
    }
  }, []);

  const resetSaleSession = useCallback(() => {
    idempotencyKeyRef.current = createSaleIdempotencyKey();
    setCart([]);
    setPayments([createEmptyPaymentRow(0)]);
    setReceiveLater(false);
    setDueDate('');
    setLocalError('');
    setVariantPickerParent(null);
    setMobilePanel('catalog');
  }, []);

  useEffect(() => {
    if (!academyId) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setSalesSettings(readSalesSettings(doc.settings));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  useEffect(() => {
    if (!products?.length) return;
    setCart((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        if (!line.parent_id) return line;
        const parent = products.find((p) => String(p.id) === String(line.parent_id));
        if (!parent) return line;
        const patch = patchCartLineFromCatalog(line, parent);
        if (!patch) return line;
        const enrichedOptions = cartVariantOptionsForLineKind(
          parent,
          normalizeLineKind(line.line_kind)
        );
        const fullPatch = {
          ...patch,
          variant_options: enrichedOptions ?? patch.variant_options,
        };
        if (
          fullPatch.variant_options === line.variant_options &&
          fullPatch.disponivel === line.disponivel &&
          fullPatch.expected_quantity === line.expected_quantity
        ) {
          return line;
        }
        changed = true;
        return { ...line, ...fullPatch };
      });
      return changed ? next : prev;
    });
  }, [products]);

  const totalCart = useMemo(
    () => cart.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.preco_unitario || 0), 0),
    [cart]
  );

  const totalFinalCents = useMemo(() => Math.max(0, Math.round(round2(totalCart) * 100)), [totalCart]);

  const paymentValid = useMemo(
    () => paymentsUiValid(payments, totalFinalCents, { deferred: receiveLater, financeConfig }),
    [payments, totalFinalCents, receiveLater, financeConfig]
  );

  const missingPriceLabel = useMemo(() => {
    const bad = cart.find((line) => !line.preco_unitario || Number(line.preco_unitario) <= 0);
    if (!bad) return null;
    return String(bad.display_label || bad.nome || 'item').trim() || 'item';
  }, [cart]);

  const paymentDiffCents = useMemo(() => {
    if (receiveLater) return null;
    const net = netPaidCentsFromRows(payments);
    return Math.max(0, totalFinalCents - net);
  }, [payments, totalFinalCents, receiveLater]);

  const submitFooterHint = useMemo(() => {
    if (creating) return null;
    if (localError) return null;
    const canSubmit =
      cart.length > 0 &&
      !missingPriceLabel &&
      (receiveLater ? Boolean(String(dueDate || '').trim()) : paymentValid.ok);
    if (canSubmit) return null;
    return getSaleFooterHint({
      cartLength: cart.length,
      paymentValid,
      receiveLater,
      dueDate,
      missingPriceLabel,
      paymentDiffCents: !paymentValid.ok && !receiveLater ? paymentDiffCents : null,
      busy: creating,
    });
  }, [
    cart.length,
    creating,
    localError,
    missingPriceLabel,
    paymentValid,
    receiveLater,
    dueDate,
    paymentDiffCents,
  ]);

  const totalMasked = useMemo(() => formatBRL(round2(totalCart)), [totalCart]);

  const cartCount = useMemo(
    () => cart.reduce((n, it) => n + Number(it.quantidade || 0), 0),
    [cart]
  );

  const saleDirty = useMemo(() => isStudentProductSaleDirty(cart), [cart]);

  useEffect(() => {
    onVariantPickerChange?.(!!variantPickerParent);
  }, [variantPickerParent, onVariantPickerChange]);

  useEffect(() => {
    onDirtyChange?.(saleDirty);
  }, [saleDirty, onDirtyChange]);

  useEffect(() => {
    if (!onSubmitStateChange) return;
    const canSubmit =
      cart.length > 0 &&
      !creating &&
      !missingPriceLabel &&
      (receiveLater ? Boolean(String(dueDate || '').trim()) : paymentValid.ok);
    const footerError = localError ? friendlySaleError(localError) : null;
    onSubmitStateChange({
      canSubmit,
      busy: creating,
      label: creating ? 'Registrando…' : 'Confirmar venda',
      footerHint: canSubmit || footerError ? null : submitFooterHint,
      footerError,
    });
  }, [
    cart.length,
    creating,
    receiveLater,
    paymentValid,
    missingPriceLabel,
    dueDate,
    localError,
    submitFooterHint,
    onSubmitStateChange,
  ]);

  useEffect(() => {
    setPayments((prev) => {
      if (prev.length === 1) {
        const nextRow = { ...prev[0], valorCents: totalFinalCents, recebidoCents: totalFinalCents };
        if (
          prev[0].valorCents === nextRow.valorCents &&
          prev[0].recebidoCents === nextRow.recebidoCents
        ) {
          return prev;
        }
        return [nextRow];
      }
      return rebalancePaymentsForTotal(prev, totalFinalCents);
    });
  }, [totalFinalCents]);

  const focusCashReceived = useCallback(() => {
    setManualPaymentOpen(true);
    window.setTimeout(() => {
      const el = document.querySelector('.student-product-sale .sales-payment-row__cash input');
      el?.focus();
    }, 60);
  }, []);

  const applyQuickPay = useCallback((rows) => {
    setReceiveLater(false);
    setPayments(rows);
    setManualPaymentOpen(true);
  }, []);

  const handlePaymentModeChange = useCallback((mode) => {
    const deferred = mode === 'deferred';
    setReceiveLater(deferred);
    setLocalError('');
    if (deferred) {
      setPayments([]);
      setManualPaymentOpen(false);
    } else {
      setManualPaymentOpen(true);
    }
  }, []);

  const handlePriceBlur = useCallback((idx) => {
    setPriceTouched((prev) => ({ ...prev, [idx]: true }));
  }, []);

  const buildCartLine = useCallback((product, parent = null, lineKind = 'sale') => {
    const kind = normalizeLineKind(lineKind);
    const { price } = suggestUnitPrice(product, { collaborator: false, lineKind: kind, parent });
    const unit = price != null ? price : null;
    const multi = parent && (parent.variants || []).length > 1;
    const avail = parent
      ? catalogLineAvailability(product, parent, kind)
      : catalogLineAvailability(product, { type: product.type || kind }, kind);
    return {
      line_kind: kind,
      item_estoque_id: product.id,
      product_variant_id: product.id,
      display_label: multi ? parent.nome || parent.display_label : product.display_label,
      variacao: variantOptionLabel(product),
      image_url: product.image_url || parent?.image_url || '',
      parent_id: parent?.id || product.product_id || null,
      variant_options: cartVariantOptionsForLineKind(parent, kind),
      quantidade: 1,
      preco_unitario: unit,
      sale_price: product.sale_price,
      cost_price: product.cost_price,
      disponivel: avail,
      expected_quantity: avail,
    };
  }, []);

  const pickProduct = useCallback(
    (product, parentId = null, parent = null, lineKind = 'sale') => {
      setLocalError('');
      const kind = normalizeLineKind(lineKind);
      const avail = parent
        ? catalogLineAvailability(product, parent, kind)
        : catalogLineAvailability(product, { type: product.type || kind }, kind);
      const { price, warning } = suggestUnitPrice(product, {
        collaborator: false,
        lineKind: kind,
        parent,
      });
      if (warning) addToast({ type: 'warning', message: warning });
      if (salesSettings.lockPriceEdit && price == null) {
        addToast({
          type: 'error',
          message: 'Preço não cadastrado. Defina no cadastro de produtos.',
        });
        return;
      }

      const stockId = product.id;
      const idx = cart.findIndex(
        (c) =>
          (c.product_variant_id === stockId || c.item_estoque_id === stockId) &&
          normalizeLineKind(c.line_kind) === kind
      );
      if (idx >= 0) {
        setCart((prev) => {
          const next = [...prev];
          const newQ = Number(next[idx].quantidade) + 1;
          if (avail > 0 && newQ > avail) {
            addToast({ type: 'error', message: 'Quantidade acima do estoque disponível' });
            return prev;
          }
          next[idx] = {
            ...next[idx],
            quantidade: newQ,
            expected_quantity: avail,
            disponivel: avail,
          };
          return next;
        });
      } else {
        setCart((prev) => [...prev, buildCartLine(product, parent, kind)]);
      }

      const flashId = parentId || stockId;
      setFlashProductId(flashId);
      window.setTimeout(() => setFlashProductId(null), 420);

      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
        setMobilePanel('cart');
      }
    },
    [salesSettings.lockPriceEdit, addToast, buildCartLine, cart]
  );

  const handleCatalogPick = useCallback(
    (parent, lineKind = 'sale') => {
      const kind = normalizeLineKind(lineKind || defaultLineKindForParent(parent));
      if (parentNeedsVariantPicker(parent)) {
        setVariantPickerLineKind(kind);
        setVariantPickerParent(parent);
        return;
      }
      const variant = parent._singleVariant || parent.variants?.[0];
      if (variant) {
        pickProduct(
          { ...variant, image_url: variant.image_url || parent.image_url || '' },
          parent.id,
          parent,
          kind
        );
      }
    },
    [pickProduct]
  );

  const changeCartVariant = useCallback(
    (idx, variantId) => {
      setCart((prev) => {
        const line = prev[idx];
        if (!line?.variant_options?.length) return prev;

        const variant = line.variant_options.find((v) => String(v.id) === String(variantId));
        if (!variant || String(variant.id) === String(line.item_estoque_id)) return prev;

        const lineKind = normalizeLineKind(line.line_kind);
        const dupIdx = prev.findIndex(
          (c, i) =>
            i !== idx &&
            String(c.item_estoque_id) === String(variant.id) &&
            normalizeLineKind(c.line_kind) === lineKind
        );
        if (dupIdx >= 0) {
          addToast({ type: 'warning', message: 'Este tamanho já está no carrinho nesta modalidade' });
          return prev;
        }

        const parent = products.find((p) => String(p.id) === String(line.parent_id));
        const canAdd =
          variant.canAdd_for_line ??
          (parent ? variantCanAddForLineKind(variant, parent, lineKind) : variant.canAdd);
        if (!canAdd) {
          addToast({ type: 'error', message: 'Tamanho esgotado' });
          return prev;
        }

        const avail =
          variant.disponivel_for_line ??
          (parent ? catalogLineAvailability(variant, parent, lineKind) : variant.current_quantity);

        const { price, warning } = suggestUnitPrice(variant, {
          collaborator: false,
          lineKind,
          parent,
        });
        if (warning) addToast({ type: 'warning', message: warning });

        const next = [...prev];
        const maxQty = avail > 0 ? Math.min(Number(line.quantidade), avail) : Number(line.quantidade);

        next[idx] = {
          ...line,
          item_estoque_id: variant.id,
          product_variant_id: variant.id,
          variacao: variantOptionLabel(variant),
          image_url: variant.image_url || line.image_url || '',
          preco_unitario: price != null ? price : line.preco_unitario,
          sale_price: variant.sale_price,
          cost_price: variant.cost_price,
          disponivel: avail,
          expected_quantity: avail,
          quantidade: Math.max(1, maxQty),
          variant_options: parent ? cartVariantOptionsForLineKind(parent, lineKind) : line.variant_options,
        };
        return next;
      });
    },
    [addToast, products]
  );

  const updateCartQty = useCallback(
    (idx, val) => {
      const q = Math.max(1, parseInt(String(val || '').replace(/\D/g, ''), 10) || 1);
      setCart((prev) => {
        const line = prev[idx];
        if (line?.disponivel > 0 && q > line.disponivel) {
          addToast({ type: 'error', message: 'Quantidade acima do estoque disponível' });
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], quantidade: q };
        return next;
      });
    },
    [addToast]
  );

  const updateCartPrice = useCallback((idx, cents) => {
    setPriceTouched((prev) => ({ ...prev, [idx]: true }));
    setCart((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], preco_unitario: cents > 0 ? cents / 100 : null };
      return next;
    });
  }, []);

  const removeFromCart = useCallback((idx) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const cartLineLabel = (it) => {
    const base = it.display_label || 'Produto';
    return it.variacao && it.variant_options?.length > 1 ? `${base} · ${it.variacao}` : base;
  };

  const focusCartPanel = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      setMobilePanel('cart');
    }
  }, []);

  const submitSale = async (e) => {
    e?.preventDefault?.();
    setLocalError('');
    if (!studentId) {
      setLocalError('Aluno inválido para esta venda.');
      return;
    }
    if (cart.length === 0) {
      setLocalError('Adicione pelo menos um produto');
      focusCartPanel();
      return;
    }
    if (receiveLater) {
      if (!String(dueDate || '').trim()) {
        setLocalError('Informe a data de vencimento.');
        focusCartPanel();
        return;
      }
    } else if (!paymentValid.ok) {
      setLocalError('Ajuste os valores de pagamento para fechar o total da venda.');
      focusCartPanel();
      return;
    }
    for (const it of cart) {
      const unit = Number(it.preco_unitario);
      if (!Number.isFinite(unit) || unit <= 0) {
        setLocalError(`Informe o preço de "${cartLineLabel(it)}"`);
        focusCartPanel();
        return;
      }
      if (salesSettings.lockPriceEdit && unit <= 0) {
        setLocalError(`Preço obrigatório para "${cartLineLabel(it)}"`);
        focusCartPanel();
        return;
      }
    }

    const itens = cart.map((it) => ({
      item_estoque_id: it.product_variant_id || it.item_estoque_id,
      product_variant_id: it.product_variant_id || it.item_estoque_id,
      quantidade: Number(it.quantidade),
      preco_unitario: round2(Number(it.preco_unitario)),
      line_kind: normalizeLineKind(it.line_kind),
      expected_quantity:
        it.expected_quantity != null ? Number(it.expected_quantity) : Number(it.disponivel),
    }));

    const pagamentos = receiveLater ? [] : serializePagamentosForApi(payments);

    const salePayload = {
      aluno_id: studentId,
      itens,
      idempotency_key: idempotencyKeyRef.current,
    };
    if (receiveLater) {
      salePayload.deferred = true;
      salePayload.due_date = String(dueDate).slice(0, 10);
      salePayload.pagamentos = [];
    } else {
      salePayload.pagamentos = pagamentos;
    }

    await createSale(salePayload);

    const st = useSalesStore.getState();
    if (st.error === 'no_stock' || st.error === 'stock_stale') {
      addToast({
        type: 'warning',
        message: 'Estoque insuficiente — o catálogo foi atualizado. Revise os itens.',
      });
      void reloadCatalog();
      return;
    }
    if (st.error) {
      addToast({
        type: 'error',
        message:
          friendlySaleError(st.error, { detail: st.errorDetail }) ||
          'Não foi possível registrar a venda.',
      });
      return;
    }

    addToast({
      type: 'success',
      message: receiveLater ? 'Venda registrada — pagamento pendente.' : 'Venda registrada.',
    });
    resetSaleSession();
    onComplete?.();
  };

  const requestBack = useCallback(() => {
    if (saleDirty) {
      setShowBackConfirm(true);
      return;
    }
    onBack?.();
  }, [saleDirty, onBack]);

  return (
    <div className="student-product-sale">
      <button type="button" className="btn-ghost student-product-sale__back" onClick={requestBack}>
        ← Voltar aos tipos
      </button>
      <p className="student-product-sale__context">
        Venda para <strong>{studentName}</strong>
      </p>

      {localError ? (
        <StatusBanner variant="error" message={localError} className="student-product-sale__error" />
      ) : null}

      <form id={formId} className="student-product-sale__form" onSubmit={(e) => void submitSale(e)}>
        <div className="sales-mobile-tabs" role="tablist" aria-label="Catálogo e carrinho">
          <button
            type="button"
            role="tab"
            aria-selected={mobilePanel === 'catalog'}
            className={`sales-mobile-tab${mobilePanel === 'catalog' ? ' sales-mobile-tab--active' : ''}`}
            onClick={() => setMobilePanel('catalog')}
          >
            Catálogo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobilePanel === 'cart'}
            className={`sales-mobile-tab${mobilePanel === 'cart' ? ' sales-mobile-tab--active' : ''}`}
            onClick={() => setMobilePanel('cart')}
          >
            Carrinho
            {cartCount > 0 ? <span className="sales-mobile-tab__badge">{cartCount}</span> : null}
          </button>
        </div>

        <div className="sales-layout student-product-sale__layout">
          <div
            className={`sales-layout__catalog sales-panel${
              mobilePanel === 'catalog' ? ' sales-panel--active' : ''
            }`}
          >
            <SalesCatalogPicker
              products={products}
              loading={catalogLoading}
              onPick={handleCatalogPick}
              flashProductId={flashProductId}
              onNavigateAway={onNavigateAway}
            />
          </div>

          <aside
            className={`sales-layout__checkout sales-panel${
              mobilePanel === 'cart' ? ' sales-panel--active' : ''
            }`}
          >
            <div className="sales-checkout card student-product-sale__checkout">
              {cart.length > 0 ? (
                <SalesCart
                  cart={cart}
                  lockPriceEdit={salesSettings.lockPriceEdit}
                  onQtyChange={updateCartQty}
                  onPriceChange={updateCartPrice}
                  onVariantChange={changeCartVariant}
                  onRemove={removeFromCart}
                  subtotalMasked={totalMasked}
                  descGeralMasked={formatBRL(0)}
                  totalMasked={totalMasked}
                  inlineValidate
                  priceTouched={priceTouched}
                  onPriceBlur={handlePriceBlur}
                  showPriceErrorsLive
                />
              ) : (
                <p className="text-small text-muted student-product-sale__empty-cart">
                  Adicione produtos pelo catálogo.
                </p>
              )}

              <SalePaymentModeSelector
                value={paymentMode}
                onChange={handlePaymentModeChange}
                disabled={creating || cart.length === 0}
                modes={STUDENT_SALE_PAYMENT_MODES}
              />

              {!receiveLater ? (
                <>
                  <SalesQuickPayBar
                    totalCents={totalFinalCents}
                    disabled={creating || cart.length === 0}
                    onApply={applyQuickPay}
                    onFocusCashReceived={focusCashReceived}
                    compact
                    financeConfig={financeConfig}
                  />
                  <button
                    type="button"
                    className="btn-ghost sales-manual-pay-toggle"
                    onClick={() => setManualPaymentOpen((v) => !v)}
                    disabled={cart.length === 0}
                  >
                    {manualPaymentOpen ? 'Ocultar pagamento manual' : 'Pagamento manual'}
                  </button>
                  {manualPaymentOpen ? (
                    <SalesPaymentBlock
                      totalCents={totalFinalCents}
                      payments={payments}
                      onChange={setPayments}
                      disabled={creating || cart.length === 0}
                      inlineValidate
                      financeConfig={financeConfig}
                    />
                  ) : null}
                </>
              ) : (
                <div className="form-group sales-checkout__field">
                  <label htmlFor="student-product-sale-due">
                    Data de vencimento <span className="sales-field-required">*</span>
                  </label>
                  <DateInput
                    id="student-product-sale-due"
                    type="date"
                    value={dueDate}
                    disabled={creating || cart.length === 0}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </div>
              )}

              {!hideSubmitButton ? (
                <>
                  {submitFooterHint ? (
                    <p className="sales-checkout__hint sales-submit-btn--desktop-only" role="status">
                      {submitFooterHint}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className="btn-primary sales-submit-btn sales-submit-btn--desktop-only"
                    disabled={
                      creating ||
                      cart.length === 0 ||
                      Boolean(missingPriceLabel) ||
                      (receiveLater ? !String(dueDate || '').trim() : !paymentValid.ok)
                    }
                  >
                    {creating ? 'Registrando…' : 'Confirmar venda'}
                  </button>
                  <SalesCheckoutStickyBar
                    visible={isMobileCheckout && mobilePanel === 'cart'}
                    totalLabel={totalMasked}
                    submitLabel="Confirmar venda"
                    submitDisabled={
                      creating ||
                      cart.length === 0 ||
                      Boolean(missingPriceLabel) ||
                      (receiveLater ? !String(dueDate || '').trim() : !paymentValid.ok)
                    }
                    hint={submitFooterHint}
                    creating={creating}
                  />
                </>
              ) : null}
            </div>
          </aside>
        </div>
      </form>

      {variantPickerParent ? (
        <SalesVariantPicker
          parent={variantPickerParent}
          lineKind={variantPickerLineKind}
          onClose={() => setVariantPickerParent(null)}
          onSelect={(variant) => {
            setVariantPickerParent(null);
            pickProduct(
              { ...variant, image_url: variant.image_url || variantPickerParent.image_url || '' },
              variantPickerParent.id,
              variantPickerParent,
              variantPickerLineKind
            );
          }}
        />
      ) : null}

      <ConfirmDialog
        open={showBackConfirm}
        title="Descartar venda?"
        description="Os produtos no carrinho serão perdidos."
        confirmLabel="Descartar"
        confirmVariant="danger"
        onConfirm={() => {
          setShowBackConfirm(false);
          onBack?.();
        }}
        onClose={() => setShowBackConfirm(false)}
      />
    </div>
  );
}

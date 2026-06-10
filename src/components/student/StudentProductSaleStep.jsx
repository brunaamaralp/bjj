import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useSalesCatalog } from '../../hooks/useSalesCatalog';
import {
  suggestUnitPrice,
  cartVariantOptions,
  parentNeedsVariantPicker,
  variantOptionLabel,
} from '../../lib/salesCatalog';
import { readSalesSettings } from '../../lib/salesSettings';
import { formatBRL } from '../../lib/moneyBr';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { DateInput } from '../DateInput';
import SalesCatalogPicker from '../sales/SalesCatalogPicker';
import SalesVariantPicker from '../sales/SalesVariantPicker';
import SalesCart from '../sales/SalesCart';
import SalesPaymentBlock from '../sales/SalesPaymentBlock';
import {
  createEmptyPaymentRow,
  serializePagamentosForApi,
  paymentsUiValid,
  rebalancePaymentsForTotal,
} from '../../lib/salePayments';
import { friendlySaleError } from '../../lib/errorMessages.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export default function StudentProductSaleStep({ student, onBack, onComplete }) {
  const academyId = useLeadStore((s) => s.academyId);
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
  const [receiveLater, setReceiveLater] = useState(false);
  const [dueDate, setDueDate] = useState('');

  const idempotencyKeyRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `sale-${Math.random().toString(36).slice(2)}-${Date.now()}`
  );

  const resetSaleSession = useCallback(() => {
    idempotencyKeyRef.current =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sale-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    setCart([]);
    setPayments([createEmptyPaymentRow(0)]);
    setReceiveLater(false);
    setDueDate('');
    setLocalError('');
    setVariantPickerParent(null);
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
        const variant_options = cartVariantOptions(parent);
        const variant = (parent.variants || []).find(
          (v) => String(v.id) === String(line.item_estoque_id)
        );
        const patch = {
          variant_options,
          disponivel: variant?.current_quantity ?? line.disponivel,
          expected_quantity: variant?.current_quantity ?? line.expected_quantity,
        };
        if (
          patch.variant_options === line.variant_options &&
          patch.disponivel === line.disponivel &&
          patch.expected_quantity === line.expected_quantity
        ) {
          return line;
        }
        changed = true;
        return { ...line, ...patch };
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
    () => paymentsUiValid(payments, totalFinalCents, { deferred: receiveLater }),
    [payments, totalFinalCents, receiveLater]
  );

  const totalMasked = useMemo(() => formatBRL(round2(totalCart)), [totalCart]);

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

  const buildCartLine = useCallback((product, parent = null) => {
    const { price } = suggestUnitPrice(product, { collaborator: false });
    const unit = price != null ? price : null;
    const multi = cartVariantOptions(parent);
    return {
      item_estoque_id: product.id,
      product_variant_id: product.id,
      display_label: multi ? parent.nome || parent.display_label : product.display_label,
      variacao: variantOptionLabel(product),
      image_url: product.image_url || parent?.image_url || '',
      parent_id: parent?.id || product.product_id || null,
      variant_options: cartVariantOptions(parent),
      quantidade: 1,
      preco_unitario: unit,
      sale_price: product.sale_price,
      cost_price: product.cost_price,
      disponivel: product.current_quantity,
      expected_quantity: product.current_quantity,
    };
  }, []);

  const pickProduct = useCallback(
    (product, parentId = null, parent = null) => {
      setLocalError('');
      const { price, warning } = suggestUnitPrice(product, { collaborator: false });
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
        (c) => c.product_variant_id === stockId || c.item_estoque_id === stockId
      );
      if (idx >= 0) {
        setCart((prev) => {
          const next = [...prev];
          const newQ = Number(next[idx].quantidade) + 1;
          if (product.current_quantity > 0 && newQ > product.current_quantity) {
            addToast({ type: 'error', message: 'Quantidade acima do estoque disponível' });
            return prev;
          }
          next[idx] = {
            ...next[idx],
            quantidade: newQ,
            expected_quantity: product.current_quantity,
          };
          return next;
        });
      } else {
        setCart((prev) => [...prev, buildCartLine(product, parent)]);
      }

      const flashId = parentId || stockId;
      setFlashProductId(flashId);
      window.setTimeout(() => setFlashProductId(null), 420);
    },
    [salesSettings.lockPriceEdit, addToast, buildCartLine, cart]
  );

  const handleCatalogPick = useCallback(
    (parent) => {
      if (parentNeedsVariantPicker(parent)) {
        setVariantPickerParent(parent);
        return;
      }
      const variant = parent._singleVariant || parent.variants?.[0];
      if (variant) {
        pickProduct(
          { ...variant, image_url: variant.image_url || parent.image_url || '' },
          parent.id,
          parent
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

        const dupIdx = prev.findIndex(
          (c, i) => i !== idx && String(c.item_estoque_id) === String(variant.id)
        );
        if (dupIdx >= 0) {
          addToast({ type: 'warning', message: 'Este tamanho já está no carrinho' });
          return prev;
        }

        if (!variant.canAdd) {
          addToast({ type: 'error', message: 'Tamanho esgotado' });
          return prev;
        }

        const { price, warning } = suggestUnitPrice(variant, { collaborator: false });
        if (warning) addToast({ type: 'warning', message: warning });

        const next = [...prev];
        const maxQty =
          variant.current_quantity > 0
            ? Math.min(Number(line.quantidade), variant.current_quantity)
            : Number(line.quantidade);

        next[idx] = {
          ...line,
          item_estoque_id: variant.id,
          product_variant_id: variant.id,
          variacao: variantOptionLabel(variant),
          image_url: variant.image_url || line.image_url || '',
          preco_unitario: price != null ? price : line.preco_unitario,
          sale_price: variant.sale_price,
          cost_price: variant.cost_price,
          disponivel: variant.current_quantity,
          expected_quantity: variant.current_quantity,
          quantidade: Math.max(1, maxQty),
        };
        return next;
      });
    },
    [addToast]
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

  const submitSale = async () => {
    setLocalError('');
    if (!studentId) {
      setLocalError('Aluno inválido para esta venda.');
      return;
    }
    if (cart.length === 0) {
      setLocalError('Adicione pelo menos um produto');
      return;
    }
    if (receiveLater) {
      if (!String(dueDate || '').trim()) {
        setLocalError('Informe a data de vencimento.');
        return;
      }
    } else if (!paymentValid.ok) {
      setLocalError('Ajuste os valores de pagamento para fechar o total da venda.');
      return;
    }
    for (const it of cart) {
      const unit = Number(it.preco_unitario);
      if (!Number.isFinite(unit) || unit <= 0) {
        setLocalError(`Informe o preço de "${cartLineLabel(it)}"`);
        return;
      }
      if (salesSettings.lockPriceEdit && unit <= 0) {
        setLocalError(`Preço obrigatório para "${cartLineLabel(it)}"`);
        return;
      }
    }

    const itens = cart.map((it) => ({
      item_estoque_id: it.product_variant_id || it.item_estoque_id,
      product_variant_id: it.product_variant_id || it.item_estoque_id,
      quantidade: Number(it.quantidade),
      preco_unitario: round2(Number(it.preco_unitario)),
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

  return (
    <div className="student-product-sale" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 13 }} onClick={onBack}>
        ← Voltar aos tipos
      </button>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
        Venda para <strong>{studentName}</strong>
      </p>
      {localError ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }} role="alert">
          {localError}
        </p>
      ) : null}
      <SalesCatalogPicker
        products={products}
        loading={catalogLoading}
        onPick={handleCatalogPick}
        flashProductId={flashProductId}
      />
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
        />
      ) : null}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
          cursor: creating ? 'default' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={receiveLater}
          disabled={creating || cart.length === 0}
          onChange={(e) => {
            setReceiveLater(e.target.checked);
            setLocalError('');
          }}
        />
        Receber depois
      </label>
      {receiveLater ? (
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Data de vencimento <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <DateInput
            type="date"
            value={dueDate}
            disabled={creating || cart.length === 0}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>
      ) : (
        <SalesPaymentBlock
          totalCents={totalFinalCents}
          payments={payments}
          onChange={setPayments}
          disabled={creating || cart.length === 0}
        />
      )}
      <button
        type="button"
        className="btn-primary"
        disabled={creating || cart.length === 0}
        style={{ width: '100%' }}
        onClick={() => void submitSale()}
      >
        {creating ? 'Registrando…' : 'Confirmar venda'}
      </button>

      {variantPickerParent ? (
        <SalesVariantPicker
          parent={variantPickerParent}
          onClose={() => setVariantPickerParent(null)}
          onSelect={(variant) => {
            setVariantPickerParent(null);
            pickProduct(
              { ...variant, image_url: variant.image_url || variantPickerParent.image_url || '' },
              variantPickerParent.id,
              variantPickerParent
            );
          }}
        />
      ) : null}
    </div>
  );
}

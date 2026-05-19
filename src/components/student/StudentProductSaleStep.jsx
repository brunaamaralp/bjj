import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useSalesCatalog } from '../../hooks/useSalesCatalog';
import { suggestUnitPrice } from '../../lib/salesCatalog';
import { readSalesSettings } from '../../lib/salesSettings';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import SalesCatalogPicker from '../sales/SalesCatalogPicker';
import SalesPaymentBlock from '../sales/SalesPaymentBlock';
import SalesReceiptPanel from '../sales/SalesReceiptPanel';
import {
  createEmptyPaymentRow,
  serializePagamentosForApi,
  paymentsUiValid,
  buildFormaPagamentoResumo,
  rebalancePaymentsForTotal,
} from '../../lib/salePayments';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export default function StudentProductSaleStep({ student, onBack, onComplete }) {
  const academyId = useLeadStore((s) => s.academyId);
  const addToast = useUiStore((s) => s.addToast);
  const { createSale, creating } = useSalesStore();
  const { products, loading: catalogLoading } = useSalesCatalog(academyId);

  const [salesSettings, setSalesSettings] = useState(() => readSalesSettings(null));
  const [academyName, setAcademyName] = useState('');
  const [cart, setCart] = useState([]);
  const [payments, setPayments] = useState(() => [createEmptyPaymentRow(0)]);
  const [receipt, setReceipt] = useState(null);
  const [localError, setLocalError] = useState('');
  const [flashProductId, setFlashProductId] = useState(null);

  const idempotencyKeyRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `sale-${Math.random().toString(36).slice(2)}-${Date.now()}`
  );

  useEffect(() => {
    if (!academyId) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setAcademyName(String(doc.name || '').trim());
        setSalesSettings(readSalesSettings(doc.settings));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const totalCart = useMemo(
    () => cart.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.preco_unitario || 0), 0),
    [cart]
  );

  const totalFinalCents = useMemo(() => Math.max(0, Math.round(round2(totalCart) * 100)), [totalCart]);

  const paymentValid = useMemo(
    () => paymentsUiValid(payments, totalFinalCents),
    [payments, totalFinalCents]
  );

  useEffect(() => {
    setPayments((prev) => {
      if (prev.length === 1) {
        return [{ ...prev[0], valorCents: totalFinalCents, recebidoCents: totalFinalCents }];
      }
      return rebalancePaymentsForTotal(prev, totalFinalCents);
    });
  }, [totalFinalCents]);

  const pickProduct = useCallback(
    (product) => {
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
      const unit = price != null ? price : null;
      const idx = cart.findIndex((c) => c.item_estoque_id === product.id);
      if (idx >= 0) {
        const next = [...cart];
        const newQ = Number(next[idx].quantidade) + 1;
        if (product.current_quantity > 0 && newQ > product.current_quantity) {
          addToast({ type: 'error', message: 'Quantidade acima do estoque disponível' });
          return;
        }
        next[idx] = { ...next[idx], quantidade: newQ };
        setCart(next);
      } else {
        setCart((prev) => [
          ...prev,
          {
            item_estoque_id: product.id,
            display_label: product.display_label,
            quantidade: 1,
            preco_unitario: unit,
            sale_price: product.sale_price,
            cost_price: product.cost_price,
            disponivel: product.current_quantity,
          },
        ]);
      }
      setFlashProductId(product.id);
      window.setTimeout(() => setFlashProductId(null), 420);
    },
    [cart, salesSettings.lockPriceEdit, addToast]
  );

  const submitSale = async () => {
    setLocalError('');
    if (cart.length === 0) {
      setLocalError('Adicione pelo menos um produto');
      return;
    }
    if (!paymentValid.ok) {
      setLocalError('Ajuste os valores de pagamento para fechar o total da venda.');
      return;
    }
    for (const it of cart) {
      const unit = Number(it.preco_unitario);
      if (!Number.isFinite(unit) || unit <= 0) {
        setLocalError(`Informe o preço de "${it.display_label}"`);
        return;
      }
    }

    const itens = cart.map((it) => ({
      item_estoque_id: it.item_estoque_id,
      quantidade: Number(it.quantidade),
      preco_unitario: round2(Number(it.preco_unitario)),
    }));

    const pagamentos = serializePagamentosForApi(payments);
    const now = new Date();

    await createSale({
      aluno_id: student.id,
      pagamentos,
      itens,
      idempotency_key: idempotencyKeyRef.current,
    });

    const st = useSalesStore.getState();
    if (st.error) {
      addToast({ type: 'error', message: 'Não foi possível registrar a venda.' });
      return;
    }

    addToast({ type: 'success', message: 'Venda registrada.' });
    const vendaId = st.lastSale?.venda_id || '';
    const totalFinal = round2(totalCart);
    setReceipt({
      vendaId,
      date: now.toLocaleDateString('pt-BR'),
      time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      canal: 'presencial',
      clientName: student.name || 'Aluno',
      forma: buildFormaPagamentoResumo(pagamentos),
      pagamentos,
      trocoWarnings: Array.isArray(st.lastSale?.troco_warnings) ? st.lastSale.troco_warnings : [],
      items: cart.map((it) => ({
        display_label: it.display_label,
        quantidade: Number(it.quantidade),
        preco_unitario: round2(Number(it.preco_unitario)),
        subtotal: round2(Number(it.quantidade) * Number(it.preco_unitario)),
      })),
      total: totalFinal,
    });
  };

  if (receipt) {
    return (
      <div>
        <SalesReceiptPanel
          receipt={receipt}
          settings={salesSettings}
          academyName={academyName}
          onCopy={() => {}}
        />
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', marginTop: 16 }}
          onClick={() => onComplete?.(receipt)}
        >
          Concluir
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 13 }} onClick={onBack}>
        ← Voltar aos tipos
      </button>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
        Venda para <strong>{student.name}</strong>
      </p>
      {localError ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }} role="alert">
          {localError}
        </p>
      ) : null}
      <SalesCatalogPicker
        products={products}
        loading={catalogLoading}
        onPick={pickProduct}
        flashProductId={flashProductId}
      />
      {cart.length > 0 ? (
        <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, padding: 10 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Carrinho</p>
          {cart.map((it) => (
            <div
              key={it.item_estoque_id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                padding: '4px 0',
              }}
            >
              <span>
                {it.display_label} × {it.quantidade}
              </span>
              <span>
                {round2(it.quantidade * it.preco_unitario).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <SalesPaymentBlock
        totalCents={totalFinalCents}
        payments={payments}
        onChange={setPayments}
        disabled={creating || cart.length === 0}
      />
      <button
        type="button"
        className="btn-primary"
        disabled={creating || cart.length === 0}
        style={{ width: '100%' }}
        onClick={() => void submitSale()}
      >
        {creating ? 'Registrando…' : 'Confirmar venda'}
      </button>
    </div>
  );
}

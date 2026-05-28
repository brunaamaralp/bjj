import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { ShoppingCart, X } from 'lucide-react';
import { databases, DB_ID, STUDENTS_COL, ACADEMIES_COL } from '../../lib/appwrite';
import { Query } from 'appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useSalesCatalog } from '../../hooks/useSalesCatalog';
import { suggestUnitPrice } from '../../lib/salesCatalog';
import { readSalesSettings } from '../../lib/salesSettings';
import { parseMaskToCents, formatBRLFromCents } from '../../lib/moneyBr';
import { maskPhone } from '../../lib/masks.js';
import SalesCatalogPicker from './SalesCatalogPicker';
import SalesVariantPicker from './SalesVariantPicker';
import SalesCart from './SalesCart';
import SalesReceiptPanel from './SalesReceiptPanel';
import SalesPaymentBlock from './SalesPaymentBlock';
import Hint from '../shared/Hint.jsx';
import {
  createEmptyPaymentRow,
  serializePagamentosForApi,
  paymentsUiValid,
  buildFormaPagamentoResumo,
  rebalancePaymentsForTotal,
  normalizePaymentForma,
} from '../../lib/salePayments';
import { NL_SALE_PREFILL_EVENT } from '../../lib/nlCorrect.js';
import { friendlySaleError } from '../../lib/errorMessages.js';

export default function SalesNewSaleTab({ modalMode = false, onSaleComplete }) {
  const createSale = useSalesStore((s) => s.createSale);
  const creating = useSalesStore((s) => s.creating);
  const lastSale = useSalesStore((s) => s.lastSale);
  const error = useSalesStore((s) => s.error);
  const academyId = useLeadStore((s) => s.academyId);
  const addToast = useUiStore((s) => s.addToast);
  const { products, loading: catalogLoading, reload: reloadCatalog, error: catalogError } =
    useSalesCatalog(academyId);

  const [salesSettings, setSalesSettings] = useState(() => readSalesSettings(null));
  const [academyName, setAcademyName] = useState('');

  const [alunoId, setAlunoId] = useState('');
  const [alunoSearchText, setAlunoSearchText] = useState('');
  const [alunoSuggestions, setAlunoSuggestions] = useState([]);
  const [alunoBusy, setAlunoBusy] = useState(false);
  const [alunoNomeSel, setAlunoNomeSel] = useState('');
  const [alunoPhoneSel, setAlunoPhoneSel] = useState('');

  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');

  const [vendaColaborador, setVendaColaborador] = useState(false);
  const [payments, setPayments] = useState(() => [createEmptyPaymentRow(0)]);

  const [cart, setCart] = useState([]);
  const [localError, setLocalError] = useState('');
  const [flashProductId, setFlashProductId] = useState(null);
  const [variantPickerParent, setVariantPickerParent] = useState(null);
  const [mobilePanel, setMobilePanel] = useState('catalog');

  const [descGeralTipo, setDescGeralTipo] = useState('valor');
  const [descGeralCents, setDescGeralCents] = useState(0);
  const [descGeralPct, setDescGeralPct] = useState(0);

  const [receipt, setReceipt] = useState(null);

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
  }, []);

  const round2 = (n) => Math.round(Number(n) * 100) / 100;

  useEffect(() => {
    const onNlPrefill = (ev) => {
      const d = ev?.detail || {};
      setLocalError('');
      setReceipt(null);
      setAlunoId(String(d.aluno_id || '').trim());
      setAlunoNomeSel(String(d.aluno_nome || '').trim());
      setAlunoSearchText(String(d.aluno_nome || d.customer_name || '').trim());
      setClienteNome(d.aluno_id ? '' : String(d.customer_name || '').trim());
      setClienteTelefone(String(d.customer_phone || '').trim());

      const product = (products || []).find((p) => String(p.id) === String(d.stock_item_id || '').trim());
      const qty = Math.max(1, Math.trunc(Number(d.quantity) || 1));
      const unit = Number(d.unit_price);
      if (product && Number.isFinite(unit) && unit > 0) {
        setCart([
          {
            item_estoque_id: product.id,
            display_label: product.display_label,
            variacao: product.Tamanho || '',
            quantidade: qty,
            preco_unitario: unit,
            sale_price: product.sale_price,
            cost_price: product.cost_price,
            disponivel: product.current_quantity,
            expected_quantity: product.current_quantity,
          },
        ]);
        const totalCents = Math.round(unit * qty * 100);
        const forma = normalizePaymentForma(d.payment_form || 'pix');
        setPayments([
          {
            ...createEmptyPaymentRow(totalCents),
            forma,
            recebidoCents: forma === 'dinheiro' ? totalCents : totalCents,
          },
        ]);
        setMobilePanel('catalog');
      }
    };
    window.addEventListener(NL_SALE_PREFILL_EVENT, onNlPrefill);
    return () => window.removeEventListener(NL_SALE_PREFILL_EVENT, onNlPrefill);
  }, [products]);

  useEffect(() => {
    if (!academyId || !ACADEMIES_COL || !DB_ID) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setAcademyName(String(doc.name || '').trim());
        setSalesSettings(readSalesSettings(doc.settings));
      } catch (e) {
        console.error('[Sales] academy load', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  useEffect(() => {
    if (!vendaColaborador) return;
    setCart((prev) => {
      const warnings = [];
      const next = prev.map((line) => {
        const { price, warning } = suggestUnitPrice(
          { sale_price: line.sale_price, cost_price: line.cost_price },
          { collaborator: true }
        );
        if (warning) warnings.push(`${line.display_label}: ${warning}`);
        return { ...line, preco_unitario: price != null ? price : line.preco_unitario };
      });
      if (warnings.length) {
        addToast({ type: 'warning', message: warnings[0] });
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendaColaborador]);

  useEffect(() => {
    if (vendaColaborador) return;
    setCart((prev) =>
      prev.map((line) => {
        const { price } = suggestUnitPrice(
          { sale_price: line.sale_price, cost_price: line.cost_price },
          { collaborator: false }
        );
        if (line.sale_price != null) {
          return { ...line, preco_unitario: line.sale_price };
        }
        if (price != null) return { ...line, preco_unitario: price };
        return line;
      })
    );
  }, [vendaColaborador]);

  const totalCart = useMemo(
    () => cart.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.preco_unitario || 0), 0),
    [cart]
  );

  const descontoGeralValor = useMemo(() => {
    if (totalCart <= 0) return 0;
    if (descGeralTipo === 'percent') {
      const pct = Math.max(0, Math.min(100, Number(descGeralPct) || 0));
      return round2(totalCart * pct / 100);
    }
    return Math.min((Number(descGeralCents) || 0) / 100, totalCart);
  }, [descGeralTipo, descGeralCents, descGeralPct, totalCart]);

  const fatorGeral = useMemo(() => {
    if (totalCart <= 0) return 1;
    const rest = totalCart - descontoGeralValor;
    return rest > 0 ? rest / totalCart : 0;
  }, [descontoGeralValor, totalCart]);

  const totalFinalCents = useMemo(
    () => Math.max(0, Math.round(round2(totalCart * fatorGeral) * 100)),
    [totalCart, fatorGeral]
  );

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

  const totalMasked = useMemo(() => {
    const val = round2(totalCart * fatorGeral);
    try {
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${val.toFixed(2)}`.replace('.', ',');
    }
  }, [totalCart, fatorGeral]);

  const subtotalMasked = useMemo(() => {
    try {
      return totalCart.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${totalCart.toFixed(2)}`.replace('.', ',');
    }
  }, [totalCart]);

  const descGeralMaskedOut = useMemo(() => {
    const v = round2(totalCart - totalCart * fatorGeral);
    try {
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${v.toFixed(2)}`.replace('.', ',');
    }
  }, [totalCart, fatorGeral]);

  const descGeralMasked = useMemo(() => formatBRLFromCents(descGeralCents), [descGeralCents]);

  const pickProduct = useCallback(
    (product) => {
      setLocalError('');
      const { price, warning } = suggestUnitPrice(product, { collaborator: vendaColaborador });
      if (warning) addToast({ type: 'warning', message: warning });
      if (salesSettings.lockPriceEdit && price == null) {
        addToast({
          type: 'error',
          message: 'Preço não cadastrado. Defina no cadastro de produtos ou desbloqueie a edição em Configurações → Vendas.',
        });
        return;
      }

      const unit = price != null ? price : null;
      const stockId = product.id;
      const idx = cart.findIndex(
        (c) => c.product_variant_id === stockId || c.item_estoque_id === stockId
      );
      if (idx >= 0) {
        const next = [...cart];
        const newQ = Number(next[idx].quantidade) + 1;
        if (product.current_quantity > 0 && newQ > product.current_quantity) {
          addToast({ type: 'error', message: 'Quantidade acima do estoque disponível' });
          return;
        }
        next[idx] = {
          ...next[idx],
          quantidade: newQ,
          expected_quantity: product.current_quantity,
        };
        setCart(next);
      } else {
        setCart((prev) => [
          ...prev,
          {
            item_estoque_id: stockId,
            product_variant_id: stockId,
            display_label: product.display_label,
            variacao: product.Tamanho || product.size || '',
            quantidade: 1,
            preco_unitario: unit,
            sale_price: product.sale_price,
            cost_price: product.cost_price,
            disponivel: product.current_quantity,
            expected_quantity: product.current_quantity,
          },
        ]);
      }

      setFlashProductId(stockId);
      window.setTimeout(() => setFlashProductId(null), 420);
    },
    [cart, vendaColaborador, salesSettings.lockPriceEdit, addToast]
  );

  const handleCatalogPick = useCallback(
    (parent) => {
      if (parent._singleVariant) {
        pickProduct(parent._singleVariant);
        return;
      }
      if ((parent.variants || []).length > 1) {
        setVariantPickerParent(parent);
        return;
      }
      const only = parent.variants?.[0];
      if (only) pickProduct(only);
    },
    [pickProduct]
  );

  const updateCartQty = (idx, val) => {
    const q = Math.max(1, parseInt(String(val || '').replace(/\D/g, ''), 10) || 1);
    const line = cart[idx];
    if (line?.disponivel > 0 && q > line.disponivel) {
      addToast({ type: 'error', message: 'Quantidade acima do estoque disponível' });
      return;
    }
    const next = [...cart];
    next[idx] = { ...next[idx], quantidade: q };
    setCart(next);
  };

  const updateCartPrice = (idx, cents) => {
    const next = [...cart];
    next[idx] = { ...next[idx], preco_unitario: cents > 0 ? cents / 100 : null };
    setCart(next);
  };

  const removeFromCart = (idx) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      const t = String(alunoSearchText || '').trim();
      if (!academyId || t.length < 2 || !DB_ID || !STUDENTS_COL) {
        if (active) setAlunoSuggestions([]);
        return;
      }
      setAlunoBusy(true);
      try {
        let docs = [];
        try {
          const res = await databases.listDocuments(DB_ID, STUDENTS_COL, [
            Query.equal('academyId', academyId),
            Query.search('name', t),
            Query.limit(8),
          ]);
          docs = res.documents;
        } catch {
          try {
            const res2 = await databases.listDocuments(DB_ID, STUDENTS_COL, [
              Query.equal('academyId', academyId),
              Query.search('phone', t),
              Query.limit(8),
            ]);
            docs = res2.documents;
          } catch {
            docs = [];
          }
        }
        if (!active) return;
        setAlunoSuggestions(
          docs.map((d) => ({
            id: d.$id,
            nome: d.name || d.$id,
            phone: d.phone || '',
          }))
        );
      } finally {
        if (active) setAlunoBusy(false);
      }
    };
    const h = setTimeout(run, 300);
    return () => {
      active = false;
      clearTimeout(h);
    };
  }, [alunoSearchText, academyId]);

  const chooseAluno = (s) => {
    setAlunoId(s.id);
    setAlunoNomeSel(`${s.nome}${s.phone ? ` • ${s.phone}` : ''}`);
    setAlunoPhoneSel(String(s.phone || '').trim());
    setClienteNome('');
    setClienteTelefone('');
    setAlunoSuggestions([]);
    setAlunoSearchText('');
  };

  const clearAluno = () => {
    setAlunoId('');
    setAlunoNomeSel('');
    setAlunoPhoneSel('');
    setAlunoSearchText('');
  };

  const clientDisplayName = alunoNomeSel || clienteNome.trim() || 'Cliente avulso';

  const submit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (cart.length === 0) {
      setLocalError('Adicione pelo menos um item');
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
      if (salesSettings.lockPriceEdit && unit <= 0) {
        setLocalError(`Preço obrigatório para "${it.display_label}"`);
        return;
      }
    }

    const itens = cart.map((it) => {
      let unit = Number(it.preco_unitario);
      if (fatorGeral < 1) {
        unit = round2(unit * fatorGeral);
        if (unit < 0) unit = 0;
      }
      return {
        item_estoque_id: it.product_variant_id || it.item_estoque_id,
        product_variant_id: it.product_variant_id || it.item_estoque_id,
        quantidade: Number(it.quantidade),
        preco_unitario: unit,
        expected_quantity:
          it.expected_quantity != null ? Number(it.expected_quantity) : Number(it.disponivel),
      };
    });

    const now = new Date();
    const pagamentos = serializePagamentosForApi(payments);

    await createSale({
      aluno_id: alunoId || null,
      pagamentos,
      cliente_nome: !alunoId ? clienteNome.trim() || null : null,
      cliente_telefone: !alunoId ? String(clienteTelefone || '').replace(/\D/g, '') || null : null,
      venda_colaborador: vendaColaborador,
      itens,
      idempotency_key: idempotencyKeyRef.current,
    });

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
      addToast({ type: 'error', message: 'Não foi possível registrar a venda. Revise as informações e tente novamente.' });
      return;
    }

    addToast({ type: 'success', message: 'Venda concluída' });

    if (modalMode) {
      setCart([]);
      setPayments([createEmptyPaymentRow(0)]);
      setDescGeralCents(0);
      setDescGeralPct(0);
      setMobilePanel('catalog');
      resetSaleSession();
      void reloadCatalog();
      onSaleComplete?.();
      return;
    }

    const vendaId = st.lastSale?.venda_id || '';
    const totalFinal = round2(totalCart * fatorGeral);
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const trocoWarnings = Array.isArray(st.lastSale?.troco_warnings) ? st.lastSale.troco_warnings : [];

    const clientPhone = clienteTelefone.trim() || alunoPhoneSel || '';

    setReceipt({
      vendaId,
      date: dateStr,
      time: timeStr,
      canal: 'presencial',
      clientName: clientDisplayName,
      clientPhone: clientPhone.trim(),
      forma: buildFormaPagamentoResumo(pagamentos),
      pagamentos,
      trocoWarnings,
      items: cart.map((it) => ({
        display_label: it.display_label,
        quantidade: Number(it.quantidade),
        preco_unitario: round2(Number(it.preco_unitario) * fatorGeral),
        subtotal: round2(Number(it.quantidade) * Number(it.preco_unitario) * fatorGeral),
      })),
      total: totalFinal,
    });

    setCart([]);
    setPayments([createEmptyPaymentRow(0)]);
    setDescGeralCents(0);
    setDescGeralPct(0);
    setMobilePanel('catalog');
    resetSaleSession();
    void reloadCatalog();
  };

  const copyReceipt = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: 'Comprovante copiado' });
    } catch {
      addToast({ type: 'error', message: 'Não foi possível copiar' });
    }
  };

  const cartCount = cart.reduce((n, it) => n + Number(it.quantidade || 0), 0);

  return (
    <>
      <form className="sales-new-sale animate-in" onSubmit={submit}>
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

        <div className="sales-layout">
          <div
            className={`sales-layout__catalog sales-panel${
              mobilePanel === 'catalog' ? ' sales-panel--active' : ''
            }`}
          >
            {catalogError ? (
              <p className="text-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>
                Não foi possível carregar o catálogo:{' '}
                {friendlySaleError(catalogError) || catalogError}
              </p>
            ) : null}
            <SalesCatalogPicker
              products={products}
              loading={catalogLoading}
              onPick={handleCatalogPick}
              flashProductId={flashProductId}
            />
          </div>

          <aside
            className={`sales-layout__checkout sales-panel${
              mobilePanel === 'cart' ? ' sales-panel--active' : ''
            }`}
          >
            <div className="sales-checkout card">
              <h3 className="sales-checkout__title">Checkout</h3>

              <div className="form-group sales-checkout__field">
                <label>Aluno (opcional)</label>
                <input
                  className="form-input"
                  value={alunoSearchText}
                  onChange={(e) => setAlunoSearchText(e.target.value)}
                  placeholder="Buscar por nome ou celular"
                  disabled={Boolean(alunoId)}
                />
                {alunoSuggestions.length > 0 && (
                  <div className="sales-suggestions">
                    {alunoSuggestions.map((s) => (
                      <button key={s.id} type="button" className="sales-suggestion" onClick={() => chooseAluno(s)}>
                        <span>{s.nome}</span>
                        {s.phone ? <span className="text-small text-muted">{s.phone}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
                {alunoBusy && <div className="text-small text-muted mt-1">Buscando…</div>}
                {alunoNomeSel ? (
                  <div className="sales-aluno-pill">
                    <span>{alunoNomeSel}</span>
                    <button type="button" className="sales-aluno-pill__clear" onClick={clearAluno} aria-label="Remover aluno">
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                className={`sales-guest-fields${
                  alunoId ? ' sales-guest-fields--hidden' : ' sales-guest-fields--visible'
                }`}
                aria-hidden={Boolean(alunoId)}
              >
                <div className="form-group sales-checkout__field">
                  <label>Cliente avulso — nome</label>
                  <input
                    className="form-input"
                    maxLength={128}
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    placeholder="Nome do cliente"
                    tabIndex={alunoId ? -1 : 0}
                  />
                </div>
                <div className="form-group sales-checkout__field">
                  <label>Cliente avulso — telefone</label>
                  <input
                    className="form-input"
                    maxLength={20}
                    value={clienteTelefone}
                    onChange={(e) => setClienteTelefone(maskPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    tabIndex={alunoId ? -1 : 0}
                  />
                </div>
              </div>

              <p className="sales-price-hint text-small text-muted" role="status">
                {salesSettings.lockPriceEdit
                  ? 'Preços bloqueados pela academia'
                  : 'Você pode ajustar preços unitários'}
              </p>

              <SalesCart
                cart={cart}
                lockPriceEdit={salesSettings.lockPriceEdit}
                onQtyChange={updateCartQty}
                onPriceChange={updateCartPrice}
                onRemove={removeFromCart}
                subtotalMasked={subtotalMasked}
                descGeralMasked={descGeralMaskedOut}
                totalMasked={totalMasked}
              />

              <div className="sales-checkout__discount">
                <div className="form-group sales-checkout__field">
                  <label className="text-xs">Desconto geral</label>
                  <select className="form-input" value={descGeralTipo} onChange={(e) => setDescGeralTipo(e.target.value)}>
                    <option value="valor">R$</option>
                    <option value="percent">%</option>
                  </select>
                </div>
                {descGeralTipo === 'valor' ? (
                  <div className="form-group sales-checkout__field">
                    <label className="text-xs">Valor</label>
                    <input
                      type="text"
                      className="form-input"
                      value={descGeralMasked}
                      onChange={(e) => setDescGeralCents(parseMaskToCents(e.target.value))}
                    />
                  </div>
                ) : (
                  <div className="form-group sales-checkout__field">
                    <label className="text-xs">%</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="form-input"
                      value={descGeralPct}
                      onChange={(e) => setDescGeralPct(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <SalesPaymentBlock
                totalCents={totalFinalCents}
                payments={payments}
                onChange={setPayments}
                disabled={creating || cart.length === 0}
              />

              <div className="sales-collab-toggle">
                <label className="sales-collab-toggle__label">
                  <input
                    type="checkbox"
                    className="sales-collab-toggle__input"
                    checked={vendaColaborador}
                    onChange={(e) => setVendaColaborador(e.target.checked)}
                  />
                  <span className="sales-collab-toggle__track" aria-hidden />
                  <span className="sales-collab-toggle__text">Aplicar preço de custo (colaborador)</span>
                  <Hint
                    text="Vendas internas: substitui o preço de venda pelo custo cadastrado do produto."
                    position="top"
                  />
                </label>
                {vendaColaborador ? (
                  <p className="sales-collab-toggle__hint">
                    Os preços serão substituídos pelo preço de custo cadastrado.
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                className="btn-primary sales-submit-btn"
                disabled={creating || cart.length === 0 || !paymentValid.ok}
              >
                <ShoppingCart size={18} aria-hidden />
                <span>
                  {creating ? 'Registrando venda…' : cart.length === 0 ? 'Concluir venda' : `Concluir venda — ${totalMasked}`}
                </span>
              </button>
            </div>
          </aside>
        </div>
      </form>

      {(localError || error) ? (
        <p className="text-small mt-2" style={{ color: 'var(--danger)' }}>
          {friendlySaleError(localError || error)}
        </p>
      ) : null}

      {variantPickerParent ? (
        <SalesVariantPicker
          parent={variantPickerParent}
          onClose={() => setVariantPickerParent(null)}
          onSelect={(variant) => {
            setVariantPickerParent(null);
            pickProduct(variant);
          }}
        />
      ) : null}

      <SalesReceiptPanel
        receipt={receipt}
        settings={salesSettings}
        academyName={academyName}
        onCopy={copyReceipt}
      />

      {lastSale && !receipt && (
        <div className="card mt-3 text-small">
          <div>
            <strong>Última operação:</strong> {lastSale.status || (lastSale.ok ? 'OK' : '')}
          </div>
          {'venda_id' in lastSale && <div>Venda: {lastSale.venda_id}</div>}
        </div>
      )}
    </>
  );
}


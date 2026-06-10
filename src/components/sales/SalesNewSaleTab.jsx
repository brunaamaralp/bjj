import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { ShoppingCart, X, PauseCircle, PlayCircle } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { searchStudentsForSale } from '../../lib/studentSaleSearch.js';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useSalesCatalog } from '../../hooks/useSalesCatalog';
import {
  suggestUnitPrice,
  findCatalogVariant,
  cartVariantOptions,
  parentNeedsVariantPicker,
  variantOptionLabel,
} from '../../lib/salesCatalog';
import { readSalesSettings } from '../../lib/salesSettings';
import { parseMaskToCents, formatBRLFromCents } from '../../lib/moneyBr';
import { maskPhone } from '../../lib/masks.js';
import SalesCatalogPicker from './SalesCatalogPicker';
import SalesVariantPicker from './SalesVariantPicker';
import SalesCart from './SalesCart';
import SalesReceiptPanel from './SalesReceiptPanel';
import SalesPaymentBlock from './SalesPaymentBlock';
import SalesQuickPayBar from './SalesQuickPayBar';
import SalesPosHints from './SalesPosHints';
import CashShiftBanner from './CashShiftBanner';
import Hint from '../shared/Hint.jsx';
import { DateInputField } from '../DateInput';
import useSalesPosHotkeys from '../../hooks/useSalesPosHotkeys';
import {
  createEmptyPaymentRow,
  serializePagamentosForApi,
  paymentsUiValid,
  buildFormaPagamentoResumo,
  rebalancePaymentsForTotal,
  normalizePaymentForma,
  buildQuickPayment,
} from '../../lib/salePayments';
import {
  listSuspendedCarts,
  suspendCart,
  removeSuspendedCart,
} from '../../lib/salesSuspendedCart';
import { NL_SALE_PREFILL_EVENT } from '../../lib/nlCorrect.js';
import { friendlySaleError } from '../../lib/errorMessages.js';
import { refreshStockStores } from '../../lib/syncStockStores.js';

export default function SalesNewSaleTab({ modalMode = false, onSaleComplete, pdvMode = false }) {
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

  const [priceTouched, setPriceTouched] = useState({});
  const [receipt, setReceipt] = useState(null);

  const [deferredSale, setDeferredSale] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [manualPaymentOpen, setManualPaymentOpen] = useState(!pdvMode);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [suspendedOpen, setSuspendedOpen] = useState(false);
  const [suspendedList, setSuspendedList] = useState([]);
  const [openCashShift, setOpenCashShift] = useState(null);

  const formRef = useRef(null);

  const handlePriceBlur = useCallback((idx) => {
    setPriceTouched((prev) => ({ ...prev, [idx]: true }));
  }, []);

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

      const match = findCatalogVariant(products, d.stock_item_id);
      const product = match?.variant;
      const parent = match?.parent;
      const qty = Math.max(1, Math.trunc(Number(d.quantity) || 1));
      const unit = Number(d.unit_price);
      if (product && Number.isFinite(unit) && unit > 0) {
        setCart([
          {
            item_estoque_id: product.id,
            product_variant_id: product.id,
            display_label: product.display_label,
            variacao: variantOptionLabel(product),
            image_url: product.image_url || parent?.image_url || '',
            parent_id: parent?.id || null,
            variant_options: cartVariantOptions(parent),
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
    () =>
      deferredSale
        ? paymentsUiValid(payments, totalFinalCents, { deferred: true })
        : paymentsUiValid(payments, totalFinalCents),
    [payments, totalFinalCents, deferredSale]
  );

  const shiftBlocksSale =
    salesSettings.requireCashShift && !openCashShift && !modalMode;

  useEffect(() => {
    setManualPaymentOpen(!pdvMode);
  }, [pdvMode]);

  useEffect(() => {
    if (!academyId) {
      setSuspendedList([]);
      return;
    }
    setSuspendedList(listSuspendedCarts(academyId));
  }, [academyId, suspendedOpen, cart.length]);

  const focusCashReceived = useCallback(() => {
    setManualPaymentOpen(true);
    window.setTimeout(() => {
      const el = document.querySelector('.sales-payment-row__cash input');
      el?.focus();
    }, 60);
  }, []);

  const buildCheckoutSnapshot = useCallback(
    () => ({
      cart,
      payments,
      descGeralTipo,
      descGeralCents,
      descGeralPct,
      alunoId,
      alunoNomeSel,
      alunoPhoneSel,
      alunoSearchText,
      clienteNome,
      clienteTelefone,
      vendaColaborador,
      deferredSale,
      dueDate,
    }),
    [
      cart,
      payments,
      descGeralTipo,
      descGeralCents,
      descGeralPct,
      alunoId,
      alunoNomeSel,
      alunoPhoneSel,
      alunoSearchText,
      clienteNome,
      clienteTelefone,
      vendaColaborador,
      deferredSale,
      dueDate,
    ]
  );

  const restoreCheckoutSnapshot = useCallback((snap) => {
    if (!snap) return;
    setCart(snap.cart || []);
    setPayments(snap.payments || [createEmptyPaymentRow(0)]);
    setDescGeralTipo(snap.descGeralTipo || 'valor');
    setDescGeralCents(snap.descGeralCents || 0);
    setDescGeralPct(snap.descGeralPct || 0);
    setAlunoId(snap.alunoId || '');
    setAlunoNomeSel(snap.alunoNomeSel || '');
    setAlunoPhoneSel(snap.alunoPhoneSel || '');
    setAlunoSearchText(snap.alunoSearchText || '');
    setClienteNome(snap.clienteNome || '');
    setClienteTelefone(snap.clienteTelefone || '');
    setVendaColaborador(Boolean(snap.vendaColaborador));
    setDeferredSale(Boolean(snap.deferredSale));
    setDueDate(snap.dueDate || '');
    setLocalError('');
    setReceipt(null);
  }, []);

  const handleSuspendCart = () => {
    if (!academyId) {
      addToast({ type: 'error', message: 'Selecione uma academia para suspender a venda.' });
      return;
    }
    if (cart.length === 0) {
      addToast({ type: 'error', message: 'Adicione itens ao carrinho antes de suspender.' });
      return;
    }
    const entry = suspendCart(academyId, buildCheckoutSnapshot());
    if (!entry) {
      addToast({
        type: 'error',
        message: 'Não foi possível suspender o carrinho. Verifique o armazenamento do navegador.',
      });
      return;
    }
    setCart([]);
    setPayments([createEmptyPaymentRow(0)]);
    setDescGeralCents(0);
    setDescGeralPct(0);
    setDeferredSale(false);
    setDueDate('');
    setSuspendedList(listSuspendedCarts(academyId));
    setSuspendedOpen(true);
    addToast({ type: 'success', message: 'Venda suspensa — use Retomar para continuar' });
  };

  const handleResumeSuspended = (entry) => {
    if (!entry) return;
    restoreCheckoutSnapshot(entry);
    removeSuspendedCart(academyId, entry.id);
    setSuspendedList(listSuspendedCarts(academyId));
    setSuspendedOpen(false);
    addToast({ type: 'success', message: 'Carrinho retomado' });
  };

  const applyQuickPay = useCallback(
    (rows) => {
      setDeferredSale(false);
      setPayments(rows);
      setManualPaymentOpen(true);
    },
    []
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

  const buildCartLine = useCallback(
    (product, parent = null) => {
      const { price } = suggestUnitPrice(product, { collaborator: vendaColaborador });
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
    },
    [vendaColaborador]
  );

  const pickProduct = useCallback(
    (product, parentId = null, parent = null) => {
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
        setCart((prev) => [...prev, buildCartLine(product, parent)]);
      }

      const flashId = parentId || stockId;
      setFlashProductId(flashId);
      window.setTimeout(() => setFlashProductId(null), 420);

      addToast({
        type: 'success',
        message: `${product.display_label || product.nome} adicionado ao carrinho`,
      });
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
        setMobilePanel('cart');
      }
    },
    [cart, vendaColaborador, salesSettings.lockPriceEdit, addToast, buildCartLine]
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

  useSalesPosHotkeys({
    enabled: !modalMode,
    modalOpen: Boolean(variantPickerParent),
    onQuickPix: () => {
      if (cart.length === 0 || deferredSale) return;
      applyQuickPay(buildQuickPayment('pix', totalFinalCents));
    },
    onQuickCash: () => {
      if (cart.length === 0 || deferredSale) return;
      applyQuickPay(buildQuickPayment('dinheiro', totalFinalCents));
      focusCashReceived();
    },
    onQuickDebit: () => {
      if (cart.length === 0 || deferredSale) return;
      applyQuickPay(buildQuickPayment('cartao_debito', totalFinalCents));
    },
    onSubmit: () => formRef.current?.requestSubmit(),
    onEscape: () => {
      setVariantPickerParent(null);
    },
    canSubmit: paymentValid.ok && cart.length > 0 && !creating && !shiftBlocksSale,
  });

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

        const { price, warning } = suggestUnitPrice(variant, { collaborator: vendaColaborador });
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
          display_label: variant.display_label,
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
    [vendaColaborador, addToast]
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
      if (!academyId || t.length < 2) {
        if (active) setAlunoSuggestions([]);
        return;
      }
      setAlunoBusy(true);
      try {
        const hits = await searchStudentsForSale(academyId, t, { limit: 8 });
        if (!active) return;
        setAlunoSuggestions(hits);
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
    if (shiftBlocksSale) {
      setLocalError('Abra o caixa antes de registrar a venda.');
      return;
    }
    if (deferredSale) {
      if (!String(dueDate || '').trim()) {
        setLocalError('Informe a data de vencimento da venda a prazo.');
        return;
      }
    } else if (!paymentValid.ok) {
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
    const pagamentos = deferredSale ? [] : serializePagamentosForApi(payments);

    await createSale({
      aluno_id: alunoId || null,
      pagamentos,
      deferred: deferredSale,
      due_date: deferredSale ? dueDate : null,
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
      addToast({
        type: 'error',
        message:
          friendlySaleError(st.error, { detail: st.errorDetail }) ||
          'Não foi possível registrar a venda. Revise as informações e tente novamente.',
      });
      return;
    }

    addToast({
      type: 'success',
      message: deferredSale ? 'Venda a prazo registrada' : 'Venda concluída',
    });

    const clearAfterSale = () => {
      setCart([]);
      setPayments([createEmptyPaymentRow(0)]);
      setDescGeralCents(0);
      setDescGeralPct(0);
      setDeferredSale(false);
      setDueDate('');
      setMobilePanel('catalog');
      resetSaleSession();
      void reloadCatalog();
      void refreshStockStores();
    };

    if (modalMode) {
      clearAfterSale();
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
      status: deferredSale ? 'pendente' : 'concluida',
      clientName: clientDisplayName,
      clientPhone: clientPhone.trim(),
      forma: deferredSale ? 'A receber' : buildFormaPagamentoResumo(pagamentos),
      pagamentos,
      trocoWarnings,
      dueDate: deferredSale ? dueDate : null,
      items: cart.map((it) => ({
        display_label: it.display_label,
        quantidade: Number(it.quantidade),
        preco_unitario: round2(Number(it.preco_unitario) * fatorGeral),
        subtotal: round2(Number(it.quantidade) * Number(it.preco_unitario) * fatorGeral),
      })),
      total: totalFinal,
    });

    if (salesSettings.autoPrintReceipt && pdvMode && !deferredSale) {
      window.setTimeout(() => window.print(), 300);
    }

    clearAfterSale();
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
      {!modalMode ? (
        <CashShiftBanner
          academyId={academyId}
          requireShift={salesSettings.requireCashShift}
          pdvMode={pdvMode}
          onShiftChange={setOpenCashShift}
          blockSales={shiftBlocksSale}
        />
      ) : null}

      <form ref={formRef} className="sales-new-sale animate-in" onSubmit={submit}>
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
              <p className="text-small sales-catalog-error">
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
              <div className="sales-checkout__head">
                <h3 className="sales-checkout__title">Checkout</h3>
                <div className="sales-checkout__head-actions">
                  {suspendedList.length > 0 ? (
                    <button
                      type="button"
                      className="btn-ghost sales-checkout__suspend-btn"
                      onClick={() => setSuspendedOpen((v) => !v)}
                    >
                      <PlayCircle size={16} aria-hidden />
                      Retomar ({suspendedList.length})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-ghost sales-checkout__suspend-btn"
                    disabled={cart.length === 0 || creating}
                    onClick={handleSuspendCart}
                  >
                    <PauseCircle size={16} aria-hidden />
                    Suspender
                  </button>
                </div>
              </div>

              {suspendedOpen && suspendedList.length > 0 ? (
                <div className="sales-suspended-panel card">
                  {suspendedList.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="sales-suspended-panel__item"
                      onClick={() => handleResumeSuspended(entry)}
                    >
                      <span>{entry.label}</span>
                      <span className="text-small text-muted">
                        {new Date(entry.savedAt).toLocaleString('pt-BR')}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="form-group sales-checkout__field sales-checkout__field--aluno">
                <label>Aluno (opcional)</label>
                <input
                  className="form-input"
                  value={alunoSearchText}
                  onChange={(e) => setAlunoSearchText(e.target.value)}
                  placeholder="Buscar por nome ou celular"
                  disabled={Boolean(alunoId)}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={alunoSuggestions.length > 0}
                />
                {alunoSuggestions.length > 0 && (
                  <div className="sales-suggestions" role="listbox">
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
                onVariantChange={changeCartVariant}
                onRemove={removeFromCart}
                subtotalMasked={subtotalMasked}
                descGeralMasked={descGeralMaskedOut}
                totalMasked={totalMasked}
                inlineValidate
                priceTouched={priceTouched}
                onPriceBlur={handlePriceBlur}
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

              {!deferredSale ? (
                <>
                  <SalesQuickPayBar
                    totalCents={totalFinalCents}
                    disabled={creating || cart.length === 0}
                    onApply={applyQuickPay}
                    onFocusCashReceived={focusCashReceived}
                    compact={!pdvMode}
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
                    />
                  ) : null}
                </>
              ) : (
                <div className="form-group sales-checkout__field">
                  <label>Vencimento</label>
                  <DateInputField value={dueDate} onChange={setDueDate} />
                </div>
              )}

              <details
                className="sales-more-options"
                open={moreOptionsOpen}
                onToggle={(e) => setMoreOptionsOpen(e.target.open)}
              >
                <summary className="sales-more-options__summary">Mais opções</summary>
                <div className="sales-more-options__body">
                  <label className="sales-collab-toggle__label">
                    <input
                      type="checkbox"
                      checked={deferredSale}
                      onChange={(e) => {
                        setDeferredSale(e.target.checked);
                        if (e.target.checked) setManualPaymentOpen(false);
                      }}
                    />
                    <span className="sales-collab-toggle__text">Vender a prazo (sem pagamento agora)</span>
                  </label>
                </div>
              </details>

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

              <SalesPosHints pdvMode={pdvMode} />

              <button
                type="submit"
                className="btn-primary sales-submit-btn"
                disabled={creating || cart.length === 0 || !paymentValid.ok || shiftBlocksSale}
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
              <p className="text-small mt-2 sales-form-error">
          {friendlySaleError(localError || error)}
        </p>
      ) : null}

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


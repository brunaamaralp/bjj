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
import { formatBRLFromCents, formatBRL } from '../../lib/moneyBr';
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
import { defaultDeferredDueYmd, isIsoDateYmd } from '../../lib/dateInputUtils.js';
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
import { friendlySaleError, studentPaymentFriendlyError } from '../../lib/errorMessages.js';
import SalesGeneralDiscountFields from './SalesGeneralDiscountFields';
import {
  applySaleGeneralDiscountToUnitPrice,
  computeSaleGeneralDiscount,
  roundSaleMoney,
} from '../../lib/saleGeneralDiscount';
import { refreshStockStores } from '../../lib/syncStockStores.js';
import { getSaleFooterHint, isSaleCheckoutDirty } from '../../lib/saleModalDirty.js';
import StatusBanner from '../shared/StatusBanner.jsx';
import MixedCheckoutChargeForm from './MixedCheckoutChargeForm.jsx';
import {
  chargeLinesGross,
  productLinesGross,
  validateMixedCart,
  allocatePaymentsForMixedCheckout,
  buildSalePayloadFromMixed,
  buildStudentPaymentPayloadsFromMixed,
  summarizeMixedCheckout,
} from '../../lib/mixedCheckout.js';
import { submitMixedCheckout } from '../../lib/mixedCheckoutSubmit.js';
import { createPayment } from '../../lib/studentPayments.js';
import { resolveDefaultBankAccountLabel } from '../../lib/bankAccounts.js';
import { toastAdapterFromAddToast } from '../../lib/financeTxSettlementDisplay.js';
import { PAYMENT_CATEGORY } from '../../lib/paymentCategories.js';
import { consumeMixedCheckoutPrefill } from '../../lib/mixedCheckoutPrefill.js';

const SALE_ALUNO_SEARCH_ID = 'sale-aluno-search';
const SALE_ALUNO_SUGGESTIONS_ID = 'sale-aluno-suggestions';
const saleAlunoOptionId = (id) => `sale-aluno-option-${id}`;

const CHARGE_BADGE = {
  [PAYMENT_CATEGORY.PLAN]: 'Mensalidade',
  [PAYMENT_CATEGORY.BUNDLE]: 'Pacote',
  [PAYMENT_CATEGORY.FEE]: 'Taxa',
};

function formatSaleTotalBRL(total) {
  const n = Number(total);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${n.toFixed(2)}`.replace('.', ',');
  }
}

export default function SalesNewSaleTab({
  modalMode = false,
  onSaleComplete,
  pdvMode = false,
  formId,
  hideSubmitButton = false,
  onVariantPickerChange,
  onDirtyChange,
  onSubmitStateChange,
  onNavigateAway,
}) {
  const createSale = useSalesStore((s) => s.createSale);
  const cancelSale = useSalesStore((s) => s.cancelSale);
  const creating = useSalesStore((s) => s.creating);
  const lastSale = useSalesStore((s) => s.lastSale);
  const error = useSalesStore((s) => s.error);
  const academyId = useLeadStore((s) => s.academyId);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const userId = useLeadStore((s) => s.userId);
  const addToast = useUiStore((s) => s.addToast);
  const { products, loading: catalogLoading, reload: reloadCatalog, error: catalogError } =
    useSalesCatalog(academyId);

  const [salesSettings, setSalesSettings] = useState(() => readSalesSettings(null));
  const [academyName, setAcademyName] = useState('');

  const [alunoId, setAlunoId] = useState('');
  const [alunoSearchText, setAlunoSearchText] = useState('');
  const [alunoSuggestions, setAlunoSuggestions] = useState([]);
  const [alunoActiveIndex, setAlunoActiveIndex] = useState(-1);
  const [alunoBusy, setAlunoBusy] = useState(false);
  const [alunoNomeSel, setAlunoNomeSel] = useState('');
  const [alunoPhoneSel, setAlunoPhoneSel] = useState('');

  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');

  const [vendaColaborador, setVendaColaborador] = useState(false);
  const [payments, setPayments] = useState(() => [createEmptyPaymentRow(0)]);

  const [cart, setCart] = useState([]);
  const [chargeLines, setChargeLines] = useState([]);
  const [alunoPlanName, setAlunoPlanName] = useState('');
  const [alunoPlanPrice, setAlunoPlanPrice] = useState(null);
  const [mixedBusy, setMixedBusy] = useState(false);
  const [saveStageLabel, setSaveStageLabel] = useState('');
  const [localError, setLocalError] = useState('');
  const [flashProductId, setFlashProductId] = useState(null);
  const [variantPickerParent, setVariantPickerParent] = useState(null);
  const [variantPickerLineKind, setVariantPickerLineKind] = useState('sale');
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

  useEffect(() => {
    const prefill = consumeMixedCheckoutPrefill();
    if (!prefill?.aluno_id) return;
    setAlunoId(String(prefill.aluno_id).trim());
    const nome = String(prefill.aluno_nome || '').trim();
    setAlunoNomeSel(nome);
    setAlunoSearchText(nome);
    setAlunoPhoneSel(String(prefill.phone || '').trim());
    setAlunoPlanName(String(prefill.plan || '').trim());
    setAlunoPlanPrice(
      prefill.plan_price != null && Number.isFinite(Number(prefill.plan_price))
        ? Number(prefill.plan_price)
        : null
    );
    setClienteNome('');
    setClienteTelefone('');
  }, []);

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

  const {
    fatorGeral,
    totalFinal,
    totalFinalCents: productTotalCents,
    discountDisplayValue,
  } = useMemo(
    () =>
      computeSaleGeneralDiscount(totalCart, {
        tipo: descGeralTipo,
        cents: descGeralCents,
        pct: descGeralPct,
      }),
    [totalCart, descGeralTipo, descGeralCents, descGeralPct]
  );

  const chargesGross = useMemo(() => chargeLinesGross(chargeLines), [chargeLines]);
  const checkoutTotal = useMemo(
    () => roundSaleMoney(Number(totalFinal || 0) + Number(chargesGross || 0)),
    [totalFinal, chargesGross]
  );
  const totalFinalCents = useMemo(
    () => Math.max(0, Math.round(checkoutTotal * 100)),
    [checkoutTotal]
  );

  const paymentValid = useMemo(
    () =>
      deferredSale
        ? paymentsUiValid(payments, productTotalCents, { deferred: true })
        : paymentsUiValid(payments, totalFinalCents, { financeConfig, allowPartial: true }),
    [payments, totalFinalCents, productTotalCents, deferredSale, financeConfig]
  );

  const shiftBlocksSale =
    salesSettings.requireCashShift && !openCashShift && !modalMode;
  const dueDateValid = !deferredSale || isIsoDateYmd(dueDate);
  const hasCheckoutItems = cart.length > 0 || chargeLines.length > 0;
  const canCheckout =
    hasCheckoutItems &&
    paymentValid.ok &&
    dueDateValid &&
    !creating &&
    !mixedBusy &&
    !shiftBlocksSale;

  const subtotalMasked = useMemo(() => {
    try {
      return totalCart.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${totalCart.toFixed(2)}`.replace('.', ',');
    }
  }, [totalCart]);

  const descGeralMaskedOut = useMemo(() => {
    const v = discountDisplayValue;
    try {
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${v.toFixed(2)}`.replace('.', ',');
    }
  }, [discountDisplayValue]);

  const totalMasked = useMemo(() => formatSaleTotalBRL(checkoutTotal), [checkoutTotal]);

  const descGeralMasked = useMemo(() => formatBRLFromCents(descGeralCents), [descGeralCents]);

  const checkoutDirty = useMemo(
    () =>
      isSaleCheckoutDirty({
        cart,
        alunoId,
        clienteNome,
        clienteTelefone,
        descGeralCents,
        descGeralPct,
        deferredSale,
      }),
    [cart, alunoId, clienteNome, clienteTelefone, descGeralCents, descGeralPct, deferredSale]
  );

  useEffect(() => {
    onVariantPickerChange?.(!!variantPickerParent);
  }, [variantPickerParent, onVariantPickerChange]);

  useEffect(() => {
    onDirtyChange?.(checkoutDirty);
  }, [checkoutDirty, onDirtyChange]);

  useEffect(() => {
    if (!onSubmitStateChange) return;
    const busy = creating || mixedBusy;
    const busyLabel = saveStageLabel || (creating ? 'Registrando venda…' : 'Registrando…');
    onSubmitStateChange({
      canSubmit: canCheckout,
      busy,
      label: busy
        ? busyLabel
        : !hasCheckoutItems
          ? 'Concluir'
          : `Concluir — ${formatSaleTotalBRL(checkoutTotal)}`,
      footerHint: canCheckout || localError || error
        ? null
        : getSaleFooterHint({
            cartLength: cart.length + chargeLines.length,
            paymentValid: paymentValid.ok,
            deferredSale,
            dueDateValid,
            busy,
            allowPartial: true,
          }),
      footerError: localError || error ? friendlySaleError(localError || error) : null,
    });
  }, [
    canCheckout,
    hasCheckoutItems,
    cart.length,
    chargeLines.length,
    creating,
    mixedBusy,
    saveStageLabel,
    deferredSale,
    dueDateValid,
    paymentValid.ok,
    localError,
    error,
    checkoutTotal,
    onSubmitStateChange,
  ]);

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
    setPayments((prev) => rebalancePaymentsForTotal(prev, totalFinalCents));
  }, [totalFinalCents]);

  const buildCartLine = useCallback(
    (product, parent = null, lineKind = 'sale') => {
      const kind = normalizeLineKind(lineKind);
      const { price } = suggestUnitPrice(product, {
        collaborator: vendaColaborador,
        lineKind: kind,
        parent,
      });
      const unit = price != null ? price : null;
      const multi = cartVariantOptions(parent);
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
    },
    [vendaColaborador]
  );

  const pickProduct = useCallback(
    (product, parentId = null, parent = null, lineKind = 'sale') => {
      setLocalError('');
      const kind = normalizeLineKind(lineKind);
      const avail = parent
        ? catalogLineAvailability(product, parent, kind)
        : catalogLineAvailability(product, { type: product.type || kind }, kind);
      const { price, warning } = suggestUnitPrice(product, {
        collaborator: vendaColaborador,
        lineKind: kind,
        parent,
      });
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
        (c) =>
          (c.product_variant_id === stockId || c.item_estoque_id === stockId) &&
          normalizeLineKind(c.line_kind) === kind
      );
      if (idx >= 0) {
        const next = [...cart];
        const newQ = Number(next[idx].quantidade) + 1;
        if (avail > 0 && newQ > avail) {
          addToast({ type: 'error', message: 'Quantidade acima do estoque disponível' });
          return;
        }
        next[idx] = {
          ...next[idx],
          quantidade: newQ,
          expected_quantity: avail,
          disponivel: avail,
        };
        setCart(next);
      } else {
        setCart((prev) => [...prev, buildCartLine(product, parent, kind)]);
      }

      const flashId = parentId || stockId;
      setFlashProductId(flashId);
      window.setTimeout(() => setFlashProductId(null), 420);

      if (!modalMode) {
        const kindLabel = kind === 'rental' ? 'aluguel' : 'venda';
        addToast({
          type: 'success',
          message: `${product.display_label || product.nome} adicionado ao carrinho (${kindLabel})`,
        });
      }
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
        setMobilePanel('cart');
      }
    },
    [cart, vendaColaborador, salesSettings.lockPriceEdit, addToast, buildCartLine, modalMode]
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
    canSubmit: canCheckout,
  });

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
          collaborator: vendaColaborador,
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
          display_label: variant.display_label,
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
    [vendaColaborador, addToast, products]
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

  useEffect(() => {
    setAlunoActiveIndex(alunoSuggestions.length > 0 ? 0 : -1);
  }, [alunoSuggestions]);

  useEffect(() => {
    if (alunoActiveIndex < 0) return;
    const hit = alunoSuggestions[alunoActiveIndex];
    if (!hit) return;
    document.getElementById(saleAlunoOptionId(hit.id))?.scrollIntoView({ block: 'nearest' });
  }, [alunoActiveIndex, alunoSuggestions]);

  const chooseAluno = useCallback((s) => {
    setAlunoId(s.id);
    setAlunoNomeSel(`${s.nome}${s.phone ? ` • ${s.phone}` : ''}`);
    setAlunoPhoneSel(String(s.phone || '').trim());
    setAlunoPlanName(String(s.plan || s.plan_name || '').trim());
    setAlunoPlanPrice(
      s.plan_price != null && Number.isFinite(Number(s.plan_price)) ? Number(s.plan_price) : null
    );
    setClienteNome('');
    setClienteTelefone('');
    setAlunoSuggestions([]);
    setAlunoActiveIndex(-1);
    setAlunoSearchText('');
  }, []);

  const handleAlunoSearchKeyDown = useCallback(
    (e) => {
      if (alunoId) return;
      const count = alunoSuggestions.length;

      if (e.key === 'Escape') {
        if (count > 0) {
          e.preventDefault();
          e.stopPropagation();
          setAlunoSuggestions([]);
          setAlunoActiveIndex(-1);
        }
        return;
      }

      if (count === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAlunoActiveIndex((i) => Math.min(i < 0 ? 0 : i + 1, count - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAlunoActiveIndex((i) => Math.max(i < 0 ? 0 : i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && alunoActiveIndex >= 0 && alunoSuggestions[alunoActiveIndex]) {
        e.preventDefault();
        chooseAluno(alunoSuggestions[alunoActiveIndex]);
      }
    },
    [alunoId, alunoSuggestions, alunoActiveIndex, chooseAluno]
  );

  const clearAluno = () => {
    setAlunoId('');
    setAlunoNomeSel('');
    setAlunoPhoneSel('');
    setAlunoSearchText('');
    setAlunoActiveIndex(-1);
    setAlunoPlanName('');
    setAlunoPlanPrice(null);
    setChargeLines([]);
  };

  const clientDisplayName = alunoNomeSel || clienteNome.trim() || 'Cliente avulso';

  const focusCheckoutPanel = useCallback(() => {
    if (modalMode && typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      setMobilePanel('cart');
    }
  }, [modalMode]);

  const submit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (cart.length === 0 && chargeLines.length === 0) {
      setLocalError('Adicione pelo menos um item ou cobrança');
      focusCheckoutPanel();
      return;
    }
    if (shiftBlocksSale) {
      setLocalError('Abra o caixa antes de registrar a venda.');
      focusCheckoutPanel();
      return;
    }

    const mixedCheck = validateMixedCart({
      alunoId,
      productLines: cart,
      chargeLines,
      deferred: deferredSale,
    });
    if (!mixedCheck.ok) {
      setLocalError(mixedCheck.message || 'Revise o carrinho.');
      focusCheckoutPanel();
      return;
    }

    if (deferredSale) {
      if (!isIsoDateYmd(dueDate)) {
        setLocalError('Informe a data de vencimento da venda a prazo.');
        focusCheckoutPanel();
        return;
      }
    } else if (!paymentValid.ok) {
      if (paymentValid.reason === 'capture_method' && paymentValid.message) {
        setLocalError(paymentValid.message);
      } else if (paymentValid.reason === 'sum' && paymentValid.net > totalFinalCents) {
        setLocalError('O valor informado excede o total da venda.');
      } else {
        setLocalError('Informe um valor de pagamento válido.');
      }
      focusCheckoutPanel();
      return;
    }
    for (const it of cart) {
      const unit = Number(it.preco_unitario);
      if (!Number.isFinite(unit) || unit <= 0) {
        setLocalError(`Informe o preço de "${it.display_label}"`);
        focusCheckoutPanel();
        return;
      }
      if (salesSettings.lockPriceEdit && unit <= 0) {
        setLocalError(`Preço obrigatório para "${it.display_label}"`);
        focusCheckoutPanel();
        return;
      }
    }

    const discountedProductLines = cart.map((it) => ({
      ...it,
      preco_unitario: applySaleGeneralDiscountToUnitPrice(it.preco_unitario, fatorGeral),
    }));

    const now = new Date();
    const pagamentos = deferredSale ? [] : serializePagamentosForApi(payments);

    const clearAfterSale = () => {
      setCart([]);
      setChargeLines([]);
      setPayments([createEmptyPaymentRow(0)]);
      setDescGeralCents(0);
      setDescGeralPct(0);
      setDeferredSale(false);
      setDueDate('');
      setMobilePanel('catalog');
      setSaveStageLabel('');
      resetSaleSession();
      // Libera o balcão; catálogo/estoque atualizam em background.
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(
          () => {
            void reloadCatalog();
            void refreshStockStores();
          },
          { timeout: 2500 }
        );
      } else {
        window.setTimeout(() => {
          void reloadCatalog();
          void refreshStockStores();
        }, 0);
      }
    };

    // Path legado: só produtos
    if (chargeLines.length === 0) {
      setSaveStageLabel('Registrando venda…');
      try {
        await createSale({
          aluno_id: alunoId || null,
          pagamentos,
          deferred: deferredSale,
          due_date: deferredSale && isIsoDateYmd(dueDate) ? String(dueDate).slice(0, 10) : null,
          cliente_nome: !alunoId ? clienteNome.trim() || null : null,
          cliente_telefone: !alunoId ? String(clienteTelefone || '').replace(/\D/g, '') || null : null,
          venda_colaborador: vendaColaborador,
          itens: discountedProductLines.map((it) => ({
            item_estoque_id: it.product_variant_id || it.item_estoque_id,
            product_variant_id: it.product_variant_id || it.item_estoque_id,
            quantidade: Number(it.quantidade),
            preco_unitario: Number(it.preco_unitario),
            line_kind: normalizeLineKind(it.line_kind),
            expected_quantity:
              it.expected_quantity != null ? Number(it.expected_quantity) : Number(it.disponivel),
          })),
          idempotency_key: idempotencyKeyRef.current,
          sale_source: modalMode ? 'modal' : 'pdv',
        });
      } finally {
        setSaveStageLabel('');
      }

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

      if (modalMode) {
        clearAfterSale();
        onSaleComplete?.();
        return;
      }

      const vendaId = st.lastSale?.venda_id || '';
      const dateStr = now.toLocaleDateString('pt-BR');
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const trocoWarnings = Array.isArray(st.lastSale?.troco_warnings) ? st.lastSale.troco_warnings : [];
      const clientPhone = clienteTelefone.trim() || alunoPhoneSel || '';

      setReceipt({
        vendaId,
        date: dateStr,
        time: timeStr,
        status: st.lastSale?.status || (deferredSale ? 'pendente' : paymentValid.partial ? 'parcial' : 'concluida'),
        clientName: clientDisplayName,
        clientPhone: clientPhone.trim(),
        forma: deferredSale ? 'A receber' : buildFormaPagamentoResumo(pagamentos),
        pagamentos,
        trocoWarnings,
        dueDate: deferredSale ? dueDate : null,
        items: cart.map((it) => ({
          display_label: it.display_label,
          quantidade: Number(it.quantidade),
          preco_unitario: applySaleGeneralDiscountToUnitPrice(it.preco_unitario, fatorGeral),
          subtotal: roundSaleMoney(
            Number(it.quantidade) *
              applySaleGeneralDiscountToUnitPrice(it.preco_unitario, fatorGeral)
          ),
        })),
        total: totalFinal,
      });

      if (salesSettings.autoPrintReceipt && pdvMode && !deferredSale) {
        window.setTimeout(() => window.print(), 300);
      }

      clearAfterSale();
      return;
    }

    // Checkout misto: produtos + cobranças (ou só cobranças)
    const saleGross = productLinesGross(discountedProductLines);
    const alloc = allocatePaymentsForMixedCheckout(pagamentos, {
      saleGross,
      charges: chargeLines.map((c) => ({ id: c.id, amount: c.amount })),
    });
    const defaultAccount = resolveDefaultBankAccountLabel(financeConfig) || '';
    const salePayload =
      discountedProductLines.length > 0
        ? buildSalePayloadFromMixed({
            alunoId,
            productLines: discountedProductLines,
            salePagamentos: alloc.salePagamentos,
            idempotency_key: idempotencyKeyRef.current,
            sale_source: modalMode ? 'modal' : 'pdv',
            venda_colaborador: vendaColaborador,
          })
        : null;
    const paymentPayloads = buildStudentPaymentPayloadsFromMixed({
      alunoId,
      academyId,
      userId,
      chargeLines,
      chargeAllocations: alloc.charges.map((c) => ({ ...c, account: defaultAccount })),
      defaultAccount,
    });

    setMixedBusy(true);
    setSaveStageLabel('Registrando…');
    try {
      const result = await submitMixedCheckout({
        deps: {
          createSale: async (payload) => {
            const doc = await createSale(payload);
            const st = useSalesStore.getState();
            if (st.error) {
              const err = new Error(st.error);
              err.code = st.error;
              err.detail = st.errorDetail;
              throw err;
            }
            return doc || st.lastSale;
          },
          createPayment: (data, opts) => createPayment(data, opts),
          cancelSale: ({ venda_id, motivo }) => cancelSale({ venda_id, motivo }),
        },
        salePayload,
        paymentPayloads,
        createPaymentOpts: {
          financeConfig,
          toast: toastAdapterFromAddToast(addToast),
        },
        onProgress: (evt) => {
          if (evt?.label) setSaveStageLabel(String(evt.label));
        },
      });

      if (!result.ok) {
        if (result.error === 'sale_failed') {
          const code = result.cause?.code || result.cause?.message;
          if (code === 'no_stock' || code === 'stock_stale') {
            addToast({
              type: 'warning',
              message: 'Estoque insuficiente — o catálogo foi atualizado. Revise os itens.',
            });
            void reloadCatalog();
            return;
          }
          addToast({
            type: 'error',
            message:
              friendlySaleError(code, { detail: result.cause?.detail }) ||
              result.message ||
              'Não foi possível registrar a venda.',
          });
          return;
        }
        addToast({
          type: 'error',
          message:
            studentPaymentFriendlyError(result.cause, 'save') ||
            result.message ||
            'Não foi possível concluir o checkout misto.',
        });
        if (result.compensated) {
          addToast({
            type: 'warning',
            message: 'A venda criada nesta tentativa foi cancelada automaticamente.',
            duration: 8000,
          });
        }
        return;
      }

      const summary = summarizeMixedCheckout({
        saleGross,
        chargeLines,
      });
      const partsLabel = summary.parts.map((p) => `${p.label} ${formatBRL(p.amount)}`).join(' + ');
      addToast({
        type: 'success',
        message: `Checkout concluído: ${partsLabel}`,
        duration: 8000,
      });

      clearAfterSale();
      if (modalMode) onSaleComplete?.();
    } finally {
      setMixedBusy(false);
      setSaveStageLabel('');
    }
  };

  const copyReceipt = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: 'Comprovante copiado' });
    } catch {
      addToast({ type: 'error', message: 'Não foi possível copiar' });
    }
  };

  const cartCount =
    cart.reduce((n, it) => n + Number(it.quantidade || 0), 0) + chargeLines.length;

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

      <form
        id={formId || undefined}
        ref={formRef}
        className="sales-new-sale animate-in"
        onSubmit={submit}
      >
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
              onNavigateAway={onNavigateAway}
              autoFocusSearch={Boolean(modalMode)}
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
                <label htmlFor={SALE_ALUNO_SEARCH_ID}>
                  {chargeLines.length > 0 ? 'Aluno (obrigatório para cobranças)' : 'Aluno (opcional)'}
                </label>
                <input
                  id={SALE_ALUNO_SEARCH_ID}
                  className="form-input"
                  value={alunoSearchText}
                  onChange={(e) => setAlunoSearchText(e.target.value)}
                  onKeyDown={handleAlunoSearchKeyDown}
                  placeholder="Buscar por nome ou celular"
                  disabled={Boolean(alunoId)}
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls={alunoSuggestions.length > 0 ? SALE_ALUNO_SUGGESTIONS_ID : undefined}
                  aria-expanded={alunoSuggestions.length > 0}
                  aria-activedescendant={
                    alunoActiveIndex >= 0 && alunoSuggestions[alunoActiveIndex]
                      ? saleAlunoOptionId(alunoSuggestions[alunoActiveIndex].id)
                      : undefined
                  }
                />
                {alunoSuggestions.length > 0 && (
                  <div className="sales-suggestions" id={SALE_ALUNO_SUGGESTIONS_ID} role="listbox">
                    {alunoSuggestions.map((s, index) => (
                      <button
                        key={s.id}
                        id={saleAlunoOptionId(s.id)}
                        type="button"
                        role="option"
                        aria-selected={index === alunoActiveIndex}
                        className={`sales-suggestion${index === alunoActiveIndex ? ' sales-suggestion--active' : ''}`}
                        onMouseEnter={() => setAlunoActiveIndex(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => chooseAluno(s)}
                      >
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
                    inputMode="tel"
                    autoComplete="tel"
                    tabIndex={alunoId ? -1 : 0}
                  />
                </div>
              </div>

              <MixedCheckoutChargeForm
                disabled={!alunoId}
                studentPlanName={alunoPlanName}
                studentPlanPrice={alunoPlanPrice}
                onAdd={(line) => {
                  setChargeLines((prev) => [...prev, line]);
                  if (deferredSale) {
                    setDeferredSale(false);
                    setLocalError('');
                  }
                }}
              />

              {chargeLines.length > 0 ? (
                <ul className="mixed-checkout-charges">
                  {chargeLines.map((line) => (
                    <li key={line.id} className="mixed-checkout-charges__item">
                      <span>
                        <span className="mixed-checkout-charges__badge">
                          {CHARGE_BADGE[line.kind] || line.kind}
                        </span>
                        {line.note ? (
                          <span className="text-small text-muted"> — {line.note}</span>
                        ) : null}
                        {line.kind === PAYMENT_CATEGORY.PLAN && line.reference_month ? (
                          <span className="text-small text-muted"> · {line.reference_month}</span>
                        ) : null}
                      </span>
                      <span className="mixed-checkout-charges__right">
                        <strong className="text-small">{formatBRL(line.amount)}</strong>
                        <button
                          type="button"
                          className="btn-ghost"
                          aria-label="Remover cobrança"
                          onClick={() =>
                            setChargeLines((prev) => prev.filter((c) => c.id !== line.id))
                          }
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

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
                subtotalValue={totalCart}
                descGeralMasked={descGeralMaskedOut}
                totalMasked={formatSaleTotalBRL(totalFinal)}
                totalValue={totalFinal}
                inlineValidate
                priceTouched={priceTouched}
                onPriceBlur={handlePriceBlur}
              />

              {chargeLines.length > 0 && cart.length > 0 ? (
                <p className="text-small text-muted sales-checkout__breakdown" role="status">
                  Produtos {formatBRL(totalFinal)} + cobranças {formatBRL(chargesGross)}
                </p>
              ) : null}

              <SalesGeneralDiscountFields
                descGeralTipo={descGeralTipo}
                onTipoChange={(e) => setDescGeralTipo(e.target.value)}
                descGeralMasked={descGeralMasked}
                onCentsChange={setDescGeralCents}
                descGeralPct={descGeralPct}
                onPctChange={(e) => setDescGeralPct(e.target.value)}
              />
              {cart.length > 0 ? (
                <p className="text-small text-muted" style={{ margin: '-4px 0 4px' }}>
                  Desconto aplica só aos produtos, não à mensalidade/taxa.
                </p>
              ) : null}

              {!deferredSale ? (
                <>
                  <SalesQuickPayBar
                    totalCents={totalFinalCents}
                    disabled={creating || mixedBusy || !hasCheckoutItems}
                    onApply={applyQuickPay}
                    onFocusCashReceived={focusCashReceived}
                    compact={!pdvMode}
                    financeConfig={financeConfig}
                  />
                  <button
                    type="button"
                    className="btn-ghost sales-manual-pay-toggle"
                    onClick={() => setManualPaymentOpen((v) => !v)}
                    disabled={!hasCheckoutItems}
                  >
                    {manualPaymentOpen ? 'Ocultar pagamento manual' : 'Pagamento manual'}
                  </button>
                  {manualPaymentOpen ? (
                    <SalesPaymentBlock
                      totalCents={totalFinalCents}
                      payments={payments}
                      onChange={setPayments}
                      disabled={creating || mixedBusy || !hasCheckoutItems}
                      inlineValidate
                      financeConfig={financeConfig}
                      allowPartial
                    />
                  ) : null}
                </>
              ) : (
                <div className="form-group sales-checkout__field">
                  <label htmlFor="sales-deferred-due">
                    Data de vencimento <span className="sales-field-required">*</span>
                  </label>
                  <DateInputField
                    id="sales-deferred-due"
                    value={dueDate}
                    onChange={(e) => setDueDate(String(e?.target?.value || '').slice(0, 10))}
                    required
                    disabled={creating || mixedBusy || cart.length === 0}
                    aria-label="Data de vencimento da venda a prazo"
                  />
                </div>
              )}

              <label className="sales-collab-toggle__label sales-deferred-toggle">
                <input
                  type="checkbox"
                  checked={deferredSale}
                  disabled={creating || mixedBusy || cart.length === 0 || chargeLines.length > 0}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setDeferredSale(on);
                    if (on) {
                      setManualPaymentOpen(false);
                      setDueDate((prev) => prev || defaultDeferredDueYmd());
                    }
                    setLocalError('');
                  }}
                />
                <span className="sales-collab-toggle__text">
                  Vender a prazo (sem pagamento agora)
                  {chargeLines.length > 0 ? ' — indisponível com cobranças' : ''}
                </span>
              </label>

              <details
                className="sales-more-options"
                open={moreOptionsOpen}
                onToggle={(e) => setMoreOptionsOpen(e.target.open)}
              >
                <summary className="sales-more-options__summary">Mais opções</summary>
                <div className="sales-more-options__body">
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
                </div>
              </details>

              {!modalMode ? <SalesPosHints pdvMode={pdvMode} /> : null}

              {(localError || error) ? (
                <StatusBanner
                  variant="error"
                  message={friendlySaleError(localError || error)}
                  className="sales-checkout__error"
                />
              ) : null}

              {hasCheckoutItems ? (
                <div
                  className="sales-checkout__sticky-total"
                  role="status"
                  aria-live="polite"
                >
                  <span className="sales-checkout__sticky-total-label">A cobrar na máquina</span>
                  <strong className="sales-checkout__sticky-total-value">{totalMasked}</strong>
                </div>
              ) : null}

              {saveStageLabel ? (
                <p className="text-small sales-checkout__save-stage" aria-live="polite" role="status">
                  {saveStageLabel}
                </p>
              ) : null}

              {!hideSubmitButton ? (
                <button
                  type="submit"
                  className="btn-primary sales-submit-btn"
                  disabled={!canCheckout}
                >
                  <ShoppingCart size={18} aria-hidden />
                  <span>
                    {creating || mixedBusy
                      ? saveStageLabel || 'Registrando…'
                      : !hasCheckoutItems
                        ? 'Concluir'
                        : `Concluir — ${totalMasked}`}
                  </span>
                </button>
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


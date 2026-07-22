import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { lazyWithRetry } from '../../lib/lazyWithRetry.js';
import './finance.css';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ExternalLink,
  FileSpreadsheet,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import { activeFinanceVendors, findFinanceVendorByName } from '../../lib/financeVendors.js';
import { fetchPayablesCached, createFinanceTx, patchFinanceTx } from '../../lib/financeTxApi.js';
import { PAYABLE_SOURCE, selectPayablesItems, filterPayablesSearch } from '../../lib/payablesAggregate.js';
import {
  PAYABLES_SECTIONS,
  PAYABLES_SECTION_LABELS,
  buildPayablesPath,
} from '../../lib/financeiroPayablesSections.js';
import { todayYmdLocal, addDaysYmd } from '../../lib/financeForecastCore.js';
import {
  FINANCE_CATEGORIES,
  getCategoryOptionsByNature,
  resolveFinanceCategory,
} from '../../lib/financeCategories.js';
import { encodeAccountCategoryValue } from '../../lib/financeAccountCategories.js';
import {
  formatPayableCategoryLabel,
  payableCategoryFilterOptions,
} from '../../lib/payablesCategoryDisplay.js';
import { useAccountingStore } from '../../store/useAccountingStore';
import SearchableGroupedSelect from '../shared/SearchableGroupedSelect.jsx';
import { currentCompetenceMonth } from '../../lib/financeCompetence.js';
import { RECURRENCE_TYPES, normalizeRecurrenceDay, buildRecurrenceEndOptions } from '../../lib/financeRecurrence.js';
import { maskCurrency, parseCurrencyBRL } from '../../lib/masks.js';
import { validateBankAccountForPayment, hasConfiguredBankAccounts } from '../../lib/bankAccounts.js';
import { EMPRESA_FINANCE_ACCOUNTS_PATH, EMPRESA_FINANCE_VENDORS_PATH } from '../../lib/financeiroHubTabs.js';
import { applyAccountingSideEffectsAuto } from '../../lib/financeJournal.js';
import { useToast } from '../../hooks/useToast.js';
import { financeTxFriendlyError } from '../../lib/errorMessages.js';
import { FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE } from '../../../lib/constants.js';
import FinanceTabShell from './FinanceTabShell.jsx';
import HubTabBar from '../shared/HubTabBar.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import BankAccountSelect from './BankAccountSelect.jsx';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import useDebounce from '../../hooks/useDebounce.js';

const ImportPayablesModal = lazyWithRetry(() => import('./ImportPayablesModal.jsx'));

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtCompactMoney(v) {
  const n = Number(v) || 0;
  if (n >= 1000) {
    try {
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' });
    } catch {
      /* fall through */
    }
  }
  return fmtMoney(n);
}

function fmtDateBr(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'Vencida';
  if (s === 'due_soon') return 'Vence em breve';
  if (s === 'open') return 'Em aberto';
  return 'Programada';
}

function statusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'finance-badge-atraso';
  if (s === 'due_soon') return 'finance-badge-aguardando';
  return 'finance-badge-pendente';
}

const VALID_SECTIONS = new Set(Object.values(PAYABLES_SECTIONS));

const defaultForm = () => ({
  vendor: '',
  category: FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
  gross: '',
  due_date: todayYmdLocal(),
  repeat_enabled: false,
  recurrence_day: 10,
  recurrence_end: '',
  note: '',
});

export default function PayablesTab({
  academyId,
  financeConfig,
  canManageAdvanced = false,
  activeSection,
  defaultSection,
  onSectionChange,
  highlightTxId = '',
  openNewOnMount = false,
  onPayablesSummaryChange,
}) {
  const toast = useToast();
  const resolvedSection = useMemo(() => {
    if (VALID_SECTIONS.has(activeSection)) return activeSection;
    if (VALID_SECTIONS.has(defaultSection)) return defaultSection;
    return PAYABLES_SECTIONS.CONTAS_FIXAS;
  }, [activeSection, defaultSection]);
  const handleSectionChange = onSectionChange || (() => {});

  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const debouncedSearch = useDebounce(search, 200);

  const [showFormModal, setShowFormModal] = useState(openNewOnMount);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingTxId, setEditingTxId] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState({});
  const [savingForm, setSavingForm] = useState(false);

  const [settleItem, setSettleItem] = useState(null);
  const [settleAccount, setSettleAccount] = useState('');
  const [settleMethod, setSettleMethod] = useState('pix');
  const [settleGross, setSettleGross] = useState('');
  const [settlePaidAt, setSettlePaidAt] = useState(() => todayYmdLocal());
  const [settleSaving, setSettleSaving] = useState(false);
  const [settleError, setSettleError] = useState('');
  const [showValueConfirm, setShowValueConfirm] = useState(false);
  const [cancelTemplateId, setCancelTemplateId] = useState('');
  const [cancelTemplateSaving, setCancelTemplateSaving] = useState(false);
  const [cancelPayableItem, setCancelPayableItem] = useState(null);
  const [cancelPayableSaving, setCancelPayableSaving] = useState(false);
  const [cancelPayableStopRecurrence, setCancelPayableStopRecurrence] = useState(false);

  const range = useMemo(() => {
    const today = todayYmdLocal();
    return { from: today, to: addDaysYmd(today, 90) };
  }, []);

  const chartAccounts = useAccountingStore((s) => s.accounts);
  useEffect(() => {
    if (academyId) useAccountingStore.getState().loadByAcademy(academyId);
  }, [academyId]);

  const categoryOptionGroups = useMemo(
    () => getCategoryOptionsByNature('out', chartAccounts),
    [chartAccounts]
  );
  const categoryFilterOptions = useMemo(
    () => payableCategoryFilterOptions(categoryOptionGroups),
    [categoryOptionGroups]
  );

  const vendorOptions = useMemo(
    () => activeFinanceVendors(financeConfig),
    [financeConfig]
  );

  const applyVendorDefaults = useCallback(
    (vendorName) => {
      const match = findFinanceVendorByName(financeConfig, vendorName);
      if (!match) return;
      setForm((f) => {
        const next = { ...f, vendor: match.name };
        if (match.defaultCategory) next.category = match.defaultCategory;
        if (match.defaultDueDay) {
          const today = todayYmdLocal();
          const ym = today.slice(0, 7);
          const day = String(match.defaultDueDay).padStart(2, '0');
          next.due_date = `${ym}-${day}`;
          next.recurrence_day = match.defaultDueDay;
        }
        return next;
      });
    },
    [financeConfig]
  );

  const handleVendorChange = useCallback(
    (value) => {
      setForm((f) => ({ ...f, vendor: value }));
      const trimmed = String(value || '').trim();
      if (trimmed && findFinanceVendorByName(financeConfig, trimmed)) {
        applyVendorDefaults(trimmed);
      }
    },
    [financeConfig, applyVendorDefaults]
  );

  const recurrenceEndOptions = useMemo(() => buildRecurrenceEndOptions(), []);

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const body = await fetchPayablesCached({
        academyId,
        from: range.from,
        to: range.to,
        force: refreshToken > 0,
      });
      setData(body);
      onPayablesSummaryChange?.(Number(body?.summary?.overdueCount) || 0);
    } catch (e) {
      console.error('[PayablesTab]', e);
      setData(null);
      setError('Não foi possível carregar as contas a pagar.');
      onPayablesSummaryChange?.(0);
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [academyId, range.from, range.to, refreshToken, onPayablesSummaryChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const bump = () => setRefreshToken((t) => t + 1);
    window.addEventListener('navi-financial-tx-settled', bump);
    window.addEventListener('navi-finance-forecast-invalidate', bump);
    return () => {
      window.removeEventListener('navi-financial-tx-settled', bump);
      window.removeEventListener('navi-finance-forecast-invalidate', bump);
    };
  }, []);

  const summary = data?.summary || {
    totalOpen: 0,
    overdueCount: 0,
    overdueAmount: 0,
    dueSoonCount: 0,
    dueSoonAmount: 0,
    activeTemplates: 0,
  };

  const items = useMemo(() => {
    const catalog = data?.catalog;
    const base = catalog
      ? selectPayablesItems(catalog, resolvedSection)
      : data?.items || [];
    let rows = filterPayablesSearch(base, debouncedSearch);
    const cat = String(categoryFilter || '').trim();
    if (cat) {
      rows = rows.filter((it) => {
        const raw = String(it.category || '').trim();
        if (raw === cat) return true;
        return (
          formatPayableCategoryLabel(raw, chartAccounts) ===
          formatPayableCategoryLabel(cat, chartAccounts)
        );
      });
    }
    return rows;
  }, [data?.catalog, data?.items, resolvedSection, debouncedSearch, categoryFilter, chartAccounts]);

  useEffect(() => {
    if (!highlightTxId || !items.length) return;
    const hit = items.find((it) => it.tx_id === highlightTxId);
    if (hit && hit.source === PAYABLE_SOURCE.LANCAMENTO) {
      setSettleItem(hit);
      setSettleGross(String(hit.amount || ''));
      setSettleAccount('');
      setSettleMethod('pix');
      setSettlePaidAt(todayYmdLocal());
      setSettleError('');
    }
  }, [highlightTxId, items]);

  const sectionTabs = useMemo(() => {
    const withAmount = (label, amount) => `${label} · ${fmtCompactMoney(amount)}`;
    return [
      {
        id: PAYABLES_SECTIONS.VISAO,
        label: withAmount(PAYABLES_SECTION_LABELS[PAYABLES_SECTIONS.VISAO], summary.totalOpen),
        shortLabel: PAYABLES_SECTION_LABELS[PAYABLES_SECTIONS.VISAO],
      },
      {
        id: PAYABLES_SECTIONS.CONTAS_FIXAS,
        label: PAYABLES_SECTION_LABELS[PAYABLES_SECTIONS.CONTAS_FIXAS],
        shortLabel: PAYABLES_SECTION_LABELS[PAYABLES_SECTIONS.CONTAS_FIXAS],
      },
      {
        id: PAYABLES_SECTIONS.VENCIDAS,
        label:
          summary.overdueCount > 0
            ? `${PAYABLES_SECTION_LABELS[PAYABLES_SECTIONS.VENCIDAS]} (${summary.overdueCount})`
            : PAYABLES_SECTION_LABELS[PAYABLES_SECTIONS.VENCIDAS],
        shortLabel: PAYABLES_SECTION_LABELS[PAYABLES_SECTIONS.VENCIDAS],
      },
    ];
  }, [summary.totalOpen, summary.overdueCount]);

  function canPayPayableItem(item) {
    if (!item) return false;
    if (item.source === PAYABLE_SOURCE.LANCAMENTO) return Boolean(String(item.tx_id || '').trim());
    if (item.source === PAYABLE_SOURCE.TEMPLATE || item.source === PAYABLE_SOURCE.RECORRENCIA) {
      return Boolean(String(item.template_id || '').trim());
    }
    return false;
  }

  function openSettle(item) {
    if (!canPayPayableItem(item)) return;
    setSettleItem(item);
    setSettleGross(String(item.amount || ''));
    setSettleAccount('');
    setSettleMethod('pix');
    setSettlePaidAt(todayYmdLocal());
    setSettleError('');
    setShowValueConfirm(false);
  }

  function settleTargetId(item) {
    if (!item) return '';
    if (item.source === PAYABLE_SOURCE.LANCAMENTO) return String(item.tx_id || '').trim();
    return String(item.template_id || '').trim();
  }

  function settleActionForItem(item) {
    if (item?.source === PAYABLE_SOURCE.LANCAMENTO) return 'settle';
    return 'settle_payable_from_template';
  }

  function openEdit(item) {
    if (!item?.tx_id || item.source !== PAYABLE_SOURCE.LANCAMENTO) return;
    setEditingTxId(item.tx_id);
    setForm({
      vendor: item.vendor_label || '',
      category: item.category || FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
      gross: maskCurrency(String(Math.round((Number(item.amount) || 0) * 100))),
      due_date: String(item.due_date || '').slice(0, 10) || todayYmdLocal(),
      repeat_enabled: false,
      recurrence_day: 10,
      recurrence_end: '',
      note: '',
    });
    setFormErrors({});
    setShowFormModal(true);
  }

  function openNewForm() {
    setEditingTxId('');
    setForm(defaultForm());
    setFormErrors({});
    setShowFormModal(true);
  }

  async function handleSaveForm(e) {
    e.preventDefault();
    const errors = {};
    const vendor = String(form.vendor || '').trim();
    if (!vendor) errors.vendor = 'Informe o fornecedor ou descrição.';
    const grossNum = parseCurrencyBRL(form.gross);
    if (!Number.isFinite(grossNum) || grossNum <= 0) errors.gross = 'Informe um valor válido.';
    const due = String(form.due_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) errors.due_date = 'Informe a data de vencimento.';
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    const cat =
      resolveFinanceCategory(form.category, chartAccounts, { direction: 'out' }) ||
      FINANCE_CATEGORIES.OUTRAS_DESPESAS;
    const categoryValue = cat.isAccountCategory
      ? encodeAccountCategoryValue(cat.accountCode)
      : cat.label;
    const dueDay = due.split('-')[2];
    const recurrenceDay = normalizeRecurrenceDay(
      RECURRENCE_TYPES.MONTHLY,
      form.repeat_enabled ? Number(dueDay) || form.recurrence_day : 1
    );

    setSavingForm(true);
    try {
      if (editingTxId) {
        await patchFinanceTx({
          academyId,
          id: editingTxId,
          payload: {
            direction: 'out',
            type: cat.type,
            category: categoryValue,
            planName: vendor,
            gross: grossNum,
            note: String(form.note || '').trim(),
            due_date: due,
            competence_month: due.slice(0, 7) || currentCompetenceMonth(),
          },
        });
        toast.success('Conta atualizada.');
      } else {
        const payload = {
          direction: 'out',
          type: cat.type,
          category: categoryValue,
          planName: vendor,
          gross: grossNum,
          note: String(form.note || '').trim(),
          due_date: due,
          competence_month: due.slice(0, 7) || currentCompetenceMonth(),
          receive_now: false,
          method: 'pix',
        };
        if (form.repeat_enabled) {
          payload.is_recurrence_template = true;
          payload.recurrence_type = RECURRENCE_TYPES.MONTHLY;
          payload.recurrence_day = recurrenceDay;
          if (form.recurrence_end) payload.recurrence_end = form.recurrence_end;
        }
        await createFinanceTx({ academyId, payload });
        toast.success(form.repeat_enabled ? 'Conta fixa programada.' : 'Conta a pagar registrada.');
      }
      setShowFormModal(false);
      setEditingTxId('');
      setForm(defaultForm());
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
      setRefreshToken((t) => t + 1);
    } catch (err) {
      toast.error(financeTxFriendlyError(err, 'save') || 'Não foi possível salvar a conta.');
    } finally {
      setSavingForm(false);
    }
  }

  async function submitSettle({ skipValueCheck = false } = {}) {
    const targetId = settleTargetId(settleItem);
    if (!targetId) return;
    const accountCheck = validateBankAccountForPayment(settleAccount, financeConfig);
    if (!accountCheck.ok) {
      setSettleError(accountCheck.message || 'Selecione a conta bancária.');
      return;
    }
    const grossNum = parseCurrencyBRL(settleGross);
    if (!Number.isFinite(grossNum) || grossNum <= 0) {
      setSettleError('Informe um valor válido.');
      return;
    }
    const paidYmd = String(settlePaidAt || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidYmd)) {
      setSettleError('Informe a data do pagamento.');
      return;
    }
    const original = Number(settleItem.amount) || 0;
    if (!skipValueCheck && original > 0) {
      const diff = Math.abs(grossNum - original) / original;
      if (diff > 0.05) {
        setShowValueConfirm(true);
        return;
      }
    }
    setSettleSaving(true);
    setSettleError('');
    setShowValueConfirm(false);
    try {
      const paidIso = new Date(`${paidYmd}T12:00:00`).toISOString();
      const dueYmd = String(settleItem.due_date || '').slice(0, 10);
      const payload = {
        action: settleActionForItem(settleItem),
        gross: grossNum,
        method: settleMethod,
        bank_account: accountCheck.account,
        direction: 'out',
        settledAt: paidIso,
      };
      if (
        settleItem.source !== PAYABLE_SOURCE.LANCAMENTO &&
        /^\d{4}-\d{2}-\d{2}$/.test(dueYmd)
      ) {
        payload.payable_due_date = dueYmd;
      }
      const row = await patchFinanceTx({
        academyId,
        id: targetId,
        payload,
      });
      if (row) applyAccountingSideEffectsAuto(row, academyId);
      toast.success('Pagamento registrado.');
      setSettleItem(null);
      window.dispatchEvent(new CustomEvent('navi-financial-tx-settled'));
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
      setRefreshToken((t) => t + 1);
    } catch (err) {
      setSettleError(err?.message || 'Não foi possível registrar o pagamento.');
    } finally {
      setSettleSaving(false);
    }
  }

  async function handleSettle(e) {
    e.preventDefault();
    await submitSettle();
  }

  async function confirmCancelRecurrence() {
    if (!cancelTemplateId) return;
    setCancelTemplateSaving(true);
    try {
      await patchFinanceTx({
        academyId,
        id: cancelTemplateId,
        payload: { action: 'cancel_recurrence' },
      });
      toast.success('Recorrência cancelada. Instâncias pendentes já geradas permanecem na fila.');
      setCancelTemplateId('');
      setRefreshToken((t) => t + 1);
    } catch (err) {
      toast.error(financeTxFriendlyError(err, 'action') || 'Não foi possível cancelar a recorrência.');
    } finally {
      setCancelTemplateSaving(false);
    }
  }

  function openCancelPayable(item) {
    setCancelPayableStopRecurrence(false);
    setCancelPayableItem(item);
  }

  async function confirmCancelPayable() {
    const txId = String(cancelPayableItem?.tx_id || '').trim();
    if (!txId) return;
    setCancelPayableSaving(true);
    try {
      await patchFinanceTx({ academyId, id: txId, payload: { action: 'cancel' } });
      const templateId = String(cancelPayableItem?.template_id || '').trim();
      if (cancelPayableStopRecurrence && templateId) {
        await patchFinanceTx({ academyId, id: templateId, payload: { action: 'cancel_recurrence' } });
        toast.success('Conta excluída e recorrência cancelada.');
      } else {
        toast.success('Conta excluída da fila.');
      }
      setCancelPayableItem(null);
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
      setRefreshToken((t) => t + 1);
    } catch (err) {
      toast.error(financeTxFriendlyError(err, 'action') || 'Não foi possível excluir a conta.');
    } finally {
      setCancelPayableSaving(false);
    }
  }

  useModalA11y({ isOpen: showFormModal, onClose: () => setShowFormModal(false) });
  useModalA11y({ isOpen: !!settleItem, onClose: () => setSettleItem(null) });

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia.</p>;
  }

  if (loading && !loadedOnce) {
    return (
      <div className="mt-2">
        <PageSkeleton variant="table" rows={6} />
      </div>
    );
  }

  const refreshBtn = (
    <button
      type="button"
      className="btn-outline btn-sm receivables-tab__refresh"
      onClick={() => setRefreshToken((t) => t + 1)}
      disabled={loading}
      aria-busy={loading}
      aria-label="Atualizar contas a pagar"
    >
      <RefreshCw size={14} className={loading ? 'navi-async-btn__spin' : ''} aria-hidden />
      <span className="receivables-tab__refresh-label">Atualizar</span>
    </button>
  );

  const kpiStrip =
    resolvedSection === PAYABLES_SECTIONS.VENCIDAS ? (
      <div className="finance-kpi receivables-tab__total-kpi">
        <p className="finance-kpi__label">Vencidas</p>
        <p className="finance-kpi__value finance-value-negative">{fmtMoney(summary.overdueAmount)}</p>
        <p className="finance-kpi__hint">
          {summary.overdueCount} conta{summary.overdueCount !== 1 ? 's' : ''} em atraso
        </p>
      </div>
    ) : (
      <>
        <div className="finance-kpi finance-kpi--hero">
          <p className="finance-kpi__label">Em aberto (90 dias)</p>
          <p className="finance-kpi__value finance-value-negative">{fmtMoney(summary.totalOpen)}</p>
        </div>
        <div className="finance-kpi">
          <p className="finance-kpi__label">Vence em 7 dias</p>
          <p className="finance-kpi__value">{fmtMoney(summary.dueSoonAmount)}</p>
          <p className="finance-kpi__hint">{summary.dueSoonCount} conta(s)</p>
        </div>
        <div className="finance-kpi">
          <p className="finance-kpi__label">Fixas ativas</p>
          <p className="finance-kpi__value">{summary.activeTemplates}</p>
        </div>
      </>
    );

  const subNav = (
    <div className="receivables-tab__subnav-bar">
      <HubTabBar
        tabs={sectionTabs}
        activeId={resolvedSection}
        onChange={handleSectionChange}
        ariaLabel="Seções de contas a pagar"
        variant="secondary"
        size="sm"
        fullWidth
        panelIdPrefix="payables-"
        className="receivables-tab__subnav-tabs"
      />
      <div className="receivables-tab__subnav-actions">
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => setShowImportModal(true)}
        >
          <FileSpreadsheet size={14} aria-hidden />
          Importar CSV
        </button>
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={openNewForm}
        >
          <Plus size={14} aria-hidden />
          Nova conta
        </button>
        {refreshBtn}
      </div>
    </div>
  );

  return (
    <>
      <FinanceTabShell panelClassName="payables-tab receivables-tab finance-tab-panel--compact" kpiStrip={kpiStrip} subNav={subNav}>
        {error ? <ErrorBanner message={error} onRetry={() => setRefreshToken((t) => t + 1)} /> : null}

        {summary.pendingTruncated ? (
          <StatusBanner variant="warning" className="mb-3">
            Exibindo as 300 contas pendentes mais recentes. Regularize ou liquide itens antigos em Lançamentos.
          </StatusBanner>
        ) : null}

        {resolvedSection !== PAYABLES_SECTIONS.VENCIDAS ? (
          <div className="finance-filters-bar finance-filters-bar--compact mb-3">
            <input
              type="search"
              className="form-input"
              placeholder="Buscar fornecedor ou categoria…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar contas a pagar"
            />
            <select
              className="form-input"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filtrar por categoria"
            >
              <option value="">Todas as categorias</option>
              {categoryFilterOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {items.length === 0 && !error ? (
          <EmptyState
            variant="compact"
            icon={TrendingDown}
            title={
              resolvedSection === PAYABLES_SECTIONS.VENCIDAS
                ? 'Nenhuma conta vencida'
                : 'Nenhuma conta programada'
            }
            description={
              resolvedSection === PAYABLES_SECTIONS.VENCIDAS
                ? 'Ótimo — não há despesas pendentes em atraso.'
                : 'Cadastre contas fixas como água, luz e telefone para acompanhar vencimentos.'
            }
            primaryAction={{
              label: 'Nova conta',
              onClick: openNewForm,
            }}
          />
        ) : (
          <div className="finance-table-wrap">
            <table className="finance-table finance-table--compact">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Fornecedor</th>
                  <th>Categoria</th>
                  <th className="text-right">Valor</th>
                  <th>Status</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="finance-table__date">{fmtDateBr(item.due_date)}</span>
                    </td>
                    <td>
                      <span className="finance-table__primary">
                        {item.recurrence?.active ? (
                          <Repeat size={14} title="Recorrente" aria-hidden className="icon-inline" />
                        ) : null}
                        {item.vendor_label}
                      </span>
                      {item.source === PAYABLE_SOURCE.TEMPLATE ? (
                        <span className="text-small text-muted d-block">
                          Mensal · dia {item.recurrence?.day || '—'}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-small">
                      {formatPayableCategoryLabel(item.category, chartAccounts)}
                    </td>
                    <td className="text-right finance-value-negative">{fmtMoney(item.amount)}</td>
                    <td>
                      <span className={`finance-badge ${statusBadgeClass(item.status)}`}>
                        {item.status === 'overdue' ? (
                          <AlertCircle size={12} aria-hidden className="icon-inline" />
                        ) : null}
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="finance-table__actions">
                        {item.source === PAYABLE_SOURCE.LANCAMENTO ||
                        item.source === PAYABLE_SOURCE.TEMPLATE ||
                        item.source === PAYABLE_SOURCE.RECORRENCIA ? (
                          <>
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              onClick={() => openSettle(item)}
                              disabled={!canPayPayableItem(item)}
                              title={
                                canPayPayableItem(item)
                                  ? 'Registrar pagamento'
                                  : FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE
                              }
                            >
                              Pagar
                            </button>
                            {item.source === PAYABLE_SOURCE.LANCAMENTO ? (
                              <>
                                <button
                                  type="button"
                                  className="btn-ghost btn-sm"
                                  onClick={() => openEdit(item)}
                                  aria-label={`Editar ${item.vendor_label}`}
                                >
                                  <Pencil size={14} aria-hidden />
                                </button>
                                <Link
                                  to={`/financeiro?tab=movimentacoes&tx=${encodeURIComponent(item.tx_id)}`}
                                  className="btn-ghost btn-sm"
                                  aria-label={`Ver lançamento ${item.vendor_label}`}
                                >
                                  <ExternalLink size={14} aria-hidden />
                                </Link>
                                {canManageAdvanced ? (
                                  <button
                                    type="button"
                                    className="btn-ghost btn-sm text-muted"
                                    onClick={() => openCancelPayable(item)}
                                    aria-label={`Excluir ${item.vendor_label}`}
                                    title="Excluir conta"
                                  >
                                    <Trash2 size={14} aria-hidden />
                                  </button>
                                ) : null}
                              </>
                            ) : item.source === PAYABLE_SOURCE.TEMPLATE && canManageAdvanced ? (
                              <button
                                type="button"
                                className="btn-ghost btn-sm text-muted"
                                onClick={() => setCancelTemplateId(item.template_id)}
                              >
                                Cancelar
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {resolvedSection === PAYABLES_SECTIONS.VISAO && items.length > 0 ? (
          <p className="text-small text-muted mt-3">
            <Link to={buildPayablesPath({ section: PAYABLES_SECTIONS.CONTAS_FIXAS })}>
              Ver todas as contas fixas
            </Link>
            {' · '}
            <Link to="/financeiro?tab=previsao">Abrir previsão de caixa</Link>
          </p>
        ) : null}
      </FinanceTabShell>

      {showFormModal ? (
        <ModalShell
          open={showFormModal}
          title={editingTxId ? 'Editar conta a pagar' : 'Nova conta a pagar'}
          onClose={() => {
            setShowFormModal(false);
            setEditingTxId('');
          }}
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setShowFormModal(false)}>
                Cancelar
              </button>
              <button type="submit" form="payable-form" className="btn-primary" disabled={savingForm}>
                {savingForm ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          }
        >
          <form id="payable-form" onSubmit={handleSaveForm} className="form-stack">
            <div>
              <label htmlFor="payable-vendor">
                Fornecedor / descrição <span className="text-danger">*</span>
              </label>
              <input
                id="payable-vendor"
                className="form-input"
                list="payable-vendor-options"
                value={form.vendor}
                required
                aria-required="true"
                onChange={(e) => handleVendorChange(e.target.value)}
                onBlur={(e) => applyVendorDefaults(e.target.value)}
                placeholder="Ex.: Salário Hugo, CPFL, Compra de frutas…"
              />
              <datalist id="payable-vendor-options">
                {vendorOptions.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
              {formErrors.vendor ? <FieldError>{formErrors.vendor}</FieldError> : null}
              {vendorOptions.length === 0 ? (
                <p className="text-small text-muted mt-1">
                  Cadastre fornecedores em{' '}
                  <Link to={EMPRESA_FINANCE_VENDORS_PATH}>Minha academia → Fornecedores</Link>{' '}
                  para autocompletar categoria e vencimento.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="payable-category">Categoria</label>
              <SearchableGroupedSelect
                id="payable-category"
                value={form.category}
                groups={categoryOptionGroups}
                getOptionValue={(c) => c.value || c.label}
                getOptionLabel={(c) => c.label}
                getOptionTitle={(c) => c.title || ''}
                placeholder="Digite para buscar categoria…"
                emptyMessage="Nenhuma categoria encontrada para essa busca."
                onChange={(value) => setForm((f) => ({ ...f, category: value }))}
              />
            </div>
            <div>
              <label htmlFor="payable-gross">Valor (R$)</label>
              <input
                id="payable-gross"
                className="form-input"
                inputMode="decimal"
                value={form.gross}
                onChange={(e) => setForm((f) => ({ ...f, gross: maskCurrency(e.target.value) }))}
                placeholder="0,00"
              />
              {formErrors.gross ? <FieldError>{formErrors.gross}</FieldError> : null}
            </div>
            <div>
              <label htmlFor="payable-due">Vencimento</label>
              <input
                id="payable-due"
                type="date"
                className="form-input"
                value={form.due_date}
                onChange={(e) => {
                  const v = e.target.value;
                  const day = Number(String(v).slice(8, 10)) || 1;
                  setForm((f) => ({
                    ...f,
                    due_date: v,
                    recurrence_day: normalizeRecurrenceDay(RECURRENCE_TYPES.MONTHLY, day),
                  }));
                }}
              />
              {formErrors.due_date ? <FieldError>{formErrors.due_date}</FieldError> : null}
            </div>
            <label className="form-check">
              <input
                type="checkbox"
                checked={form.repeat_enabled}
                disabled={Boolean(editingTxId)}
                onChange={(e) => setForm((f) => ({ ...f, repeat_enabled: e.target.checked }))}
              />
              <span>Repetir todo mês (conta fixa)</span>
            </label>
            {form.repeat_enabled && !editingTxId ? (
              <div>
                <label htmlFor="payable-recurrence-end">Repetir até (opcional)</label>
                <select
                  id="payable-recurrence-end"
                  className="form-input"
                  value={form.recurrence_end}
                  onChange={(e) => setForm((f) => ({ ...f, recurrence_end: e.target.value }))}
                >
                  {recurrenceEndOptions.map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label htmlFor="payable-note">Observação (opcional)</label>
              <textarea
                id="payable-note"
                className="form-input"
                rows={2}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
          </form>
        </ModalShell>
      ) : null}

      {settleItem ? (
        <ModalShell
          open={!!settleItem}
          title={`Registrar pagamento — ${settleItem.vendor_label}`}
          onClose={() => setSettleItem(null)}
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setSettleItem(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                form="payable-settle-form"
                className="btn-primary"
                disabled={settleSaving || !hasConfiguredBankAccounts(financeConfig)}
              >
                {settleSaving ? 'Salvando…' : 'Confirmar pagamento'}
              </button>
            </>
          }
        >
          <form id="payable-settle-form" onSubmit={handleSettle} className="form-stack">
            {!hasConfiguredBankAccounts(financeConfig) ? (
              <p className="text-small text-muted">
                Cadastre uma conta em{' '}
                <Link to={EMPRESA_FINANCE_ACCOUNTS_PATH}>Minha academia → Recebimento</Link>.
              </p>
            ) : null}
            <div>
              <label htmlFor="settle-gross">Valor pago (R$)</label>
              <input
                id="settle-gross"
                className="form-input"
                inputMode="decimal"
                value={settleGross}
                onChange={(e) => setSettleGross(maskCurrency(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="settle-method">Método</label>
              <select
                id="settle-method"
                className="form-input"
                value={settleMethod}
                onChange={(e) => setSettleMethod(e.target.value)}
              >
                <option value="pix">PIX</option>
                <option value="transferencia">Transferência</option>
                <option value="debito">Débito</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="boleto">Boleto</option>
              </select>
            </div>
            <div>
              <label htmlFor="settle-paid-at">Data do pagamento</label>
              <input
                id="settle-paid-at"
                type="date"
                className="form-input"
                value={settlePaidAt}
                onChange={(e) => setSettlePaidAt(e.target.value)}
              />
            </div>
            <BankAccountSelect
              academyId={academyId}
              financeConfig={financeConfig}
              value={settleAccount}
              onChange={setSettleAccount}
              id="settle-account"
              label="Conta bancária"
              required
            />
            {settleError ? <FieldError>{settleError}</FieldError> : null}
          </form>
        </ModalShell>
      ) : null}

      {cancelPayableItem?.template_id ? (
        <ModalShell
          open={Boolean(cancelPayableItem)}
          title="Excluir conta a pagar?"
          onClose={() => {
            if (!cancelPayableSaving) setCancelPayableItem(null);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setCancelPayableItem(null)}
                disabled={cancelPayableSaving}
              >
                Voltar
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={cancelPayableSaving}
                onClick={() => void confirmCancelPayable()}
              >
                {cancelPayableSaving ? 'Excluindo…' : 'Excluir'}
              </button>
            </>
          }
        >
          <p className="text-small text-muted">
            Remover <strong>{cancelPayableItem.vendor_label}</strong> da fila?
          </p>
          <label className="form-check mt-3">
            <input
              type="checkbox"
              className="form-check-input"
              checked={cancelPayableStopRecurrence}
              onChange={(e) => setCancelPayableStopRecurrence(e.target.checked)}
            />
            <span className="form-check-label text-small">
              Também cancelar a recorrência (não gerar novas parcelas)
            </span>
          </label>
        </ModalShell>
      ) : (
        <ConfirmDialog
          open={Boolean(cancelPayableItem)}
          title="Excluir conta a pagar?"
          description={`Remover "${cancelPayableItem?.vendor_label || 'esta conta'}" da fila?`}
          confirmLabel="Excluir"
          confirmVariant="danger"
          loading={cancelPayableSaving}
          onConfirm={() => void confirmCancelPayable()}
          onClose={() => {
            if (!cancelPayableSaving) setCancelPayableItem(null);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(cancelTemplateId)}
        title="Cancelar recorrência?"
        description="A conta fixa deixa de gerar novas parcelas. Parcelas pendentes já criadas continuam na fila até serem pagas ou canceladas em Lançamentos."
        confirmLabel="Cancelar recorrência"
        confirmVariant="danger"
        loading={cancelTemplateSaving}
        onConfirm={() => void confirmCancelRecurrence()}
        onClose={() => {
          if (!cancelTemplateSaving) setCancelTemplateId('');
        }}
      />

      <ConfirmDialog
        open={showValueConfirm}
        title="Valor diferente do previsto"
        description={`O valor informado (${fmtMoney(parseCurrencyBRL(settleGross))}) difere mais de 5% do previsto (${fmtMoney(settleItem?.amount)}). Deseja registrar mesmo assim?`}
        confirmLabel="Registrar pagamento"
        confirmVariant="primary"
        loading={settleSaving}
        onConfirm={() => void submitSettle({ skipValueCheck: true })}
        onClose={() => {
          if (!settleSaving) setShowValueConfirm(false);
        }}
      />

      {showImportModal ? (
        <Suspense fallback={null}>
          <ImportPayablesModal
            open={showImportModal}
            academyId={academyId}
            onClose={() => setShowImportModal(false)}
            onImported={() => setRefreshToken((t) => t + 1)}
          />
        </Suspense>
      ) : null}
    </>
  );
}

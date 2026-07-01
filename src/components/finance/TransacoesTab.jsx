import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import './finance.css';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { listFinanceTx, createFinanceTx, patchFinanceTx, reverseFinanceTx, anticipateFinanceTx } from '../../lib/financeTxApi.js';
import {
  FINANCE_TX_LIST_INITIAL_PAGE_SIZE,
  FINANCE_TX_LIST_PAGE_SIZE,
} from '../../lib/financeListLimits.js';
import {
  txDirection,
  displayGross,
  displayNet,
  displayFee,
  formatSignedMoney,
  labelForFinanceTxType,
  getTxDescriptionCell,
  NATURE_STYLES,
} from '../../lib/financeTxDisplay.js';
import { formatSaleIdShort } from '../../lib/salesHistory.js';
import { useStudentStore } from '../../store/useStudentStore';
import { Receipt, Repeat, ChevronDown, Upload, Download, MoreHorizontal } from 'lucide-react';
import { DateInputField } from '../DateInput';
import {
  RECURRENCE_TYPES,
  WEEKDAY_OPTIONS,
  buildRecurrenceEndOptions,
  defaultRecurrenceForm,
  isRecurrenceTx,
  recurrenceTooltip,
  normalizeRecurrenceDay,
} from '../../lib/financeRecurrence.js';
import { dueDateForRecurrenceMonth } from '../../lib/financeRecurrenceDedup.js';
import { todayYmdLocal } from '../../lib/financeForecastCore.js';
import { txSettlementSubtitle } from '../../lib/financeTxSettlementDisplay.js';
import { useToast } from '../../hooks/useToast';
import useFinanceCategorySuggestion from '../../hooks/useFinanceCategorySuggestion.js';
import FinanceCategorySuggestionChip from './FinanceCategorySuggestionChip.jsx';
import { financeTxFriendlyError } from '../../lib/errorMessages';
import { maskCurrency, parseCurrencyBRL } from '../../lib/masks.js';
import { applySettleAccountingSideEffects } from '../../lib/financeTxSettle.js';
import { applyAccountingSideEffectsAuto } from '../../lib/financeJournal.js';
import FinanceRegimeToggle from './FinanceRegimeToggle.jsx';
import {
  FINANCE_REGIME,
  getFinanceRegime,
  competenceMonthMissing,
  currentCompetenceMonth,
  txTemporalIso,
} from '../../lib/financeCompetence.js';
import {
  FINANCE_CATEGORIES,
  defaultCategoryForTxType,
  getCategoryOptionsByNature,
  resolveFinanceCategory,
} from '../../lib/financeCategories.js';
import {
  encodeAccountCategoryValue,
  parseAccountCategoryValue,
} from '../../lib/financeAccountCategories.js';
import { useAccountingStore } from '../../store/useAccountingStore';
import EmptyState from '../shared/EmptyState.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import FieldError from '../shared/FieldError.jsx';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import {
  DropdownMenu,
  DropdownMenuPanel,
  DropdownMenuItemStatic,
  DropdownMenuLabel,
} from '../shared/menu';
import FinanceTxRowActions from './FinanceTxRowActions.jsx';
import FinanceBankAccountsSetupBanner from './FinanceBankAccountsSetupBanner.jsx';
import FinanceTxDetailDrawer from './FinanceTxDetailDrawer.jsx';
import FinanceTxAnticipationDialog from './FinanceTxAnticipationDialog.jsx';
import FinanceTxStudentField from './FinanceTxStudentField.jsx';
import FinanceTxDirectionToggle from './FinanceTxDirectionToggle.jsx';
import FinanceTxFormSection from './FinanceTxFormSection.jsx';
import SearchField from '../shared/SearchField.jsx';
import SearchableGroupedSelect from '../shared/SearchableGroupedSelect.jsx';
import PlanSelect from '../shared/PlanSelect.jsx';
import { planPriceToPayAmountString } from '../../lib/academyPlans.js';
import FinanceFiltersBar, { FinanceToolbarDate, FinanceToolbarSelect } from './FinanceFiltersBar.jsx';
import { formatPaymentMethod } from '../../lib/paymentMethodLabels.js';
import ImportFinanceTxModal from './ImportFinanceTxModal.jsx';
import {
  fetchAllFinanceTxInPeriod,
  applyFinanceTxFilters,
  exportFinanceTransactionsCsv,
  financeTxToCsvRow,
} from '../../lib/financeTxExport.js';
import FinanceTabShell from './FinanceTabShell.jsx';
import BankAccountSelect from './BankAccountSelect.jsx';
import {
  listBankAccountLabels,
  resolveBankAccountForPayment,
  validateBankAccountForPayment,
} from '../../lib/bankAccounts.js';
import { accountWhenPaymentMethodChanges } from '../../lib/paymentMethodBankDefaults.js';
import {
  isStorageCreditMethod,
  STORAGE_CREDIT_METHOD,
} from '../../lib/paymentMethods.js';
import { storageDialectPaymentMethodOptionsForFinance } from '../../lib/paymentMethodSettings.js';
import { resolveTxBankAccount, UNALLOCATED_BANK_LABEL } from '../../lib/bankAccountBalances.js';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import useDebounce from '../../hooks/useDebounce.js';
import {
  buildLeadNameById,
  formatTxLeadCell,
  resolveTxLeadName,
} from '../../lib/financeTxLeadNames.js';
import {
  OPTIONAL_TX_COLUMNS,
  defaultTxColumnVisibility,
  loadTxColumnVisibility,
  saveTxColumnVisibility,
  parseStatusFilterParam,
  parseDirectionFilterParam,
  patchFinanceTxUrlParam,
  getTxModalTitle,
  getTxModalSaveLabel,
  getTxModalIntro,
} from '../../lib/financeTxTabState.js';
import {
  buildInitialTxForm,
  applyDirectionChangeToTxForm,
  shouldSyncCompetenceFromDueDate,
  shouldShowFinanceTxStudentField,
  competenceMonthFromDueDate,
} from '../../lib/financeTxModalForm.js';

const BANK_FILTER_UNALLOCATED = '__unallocated__';

function bankFilterFromContaParam(conta) {
  const value = String(conta || '').trim();
  if (!value) return 'all';
  if (value === UNALLOCATED_BANK_LABEL || value === BANK_FILTER_UNALLOCATED) {
    return BANK_FILTER_UNALLOCATED;
  }
  return value;
}

function contaParamFromBankFilter(value) {
  if (value === 'all') return '';
  if (value === BANK_FILTER_UNALLOCATED) return UNALLOCATED_BANK_LABEL;
  return String(value || '').trim();
}

function formatTxDateStr(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

function formatMoneyBRL(value) {
  try {
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    const n = Number(value);
    return Number.isFinite(n) ? `R$ ${n.toFixed(2).replace('.', ',')}` : '—';
  }
}

function getTxTypeLabelDesktop(tx) {
  const t = String(tx.type || '').toLowerCase();
  if (t === 'plan') return `Plano${tx.planName ? ` • ${tx.planName}` : ''}`;
  return labelForFinanceTxType(t);
}

const TX_FORM_ERROR_FOCUS_ORDER = ['category', 'planName', 'due_date', 'gross', 'bankAccount', 'recurrence'];

const TX_FORM_FIELD_IDS = {
  category: 'finance-tx-category',
  planName: 'finance-tx-plan',
  description: 'finance-tx-description',
  due_date: 'finance-tx-due',
  gross: 'finance-tx-gross',
  bankAccount: 'finance-tx-bank-account',
  recurrence: 'finance-tx-recurrence-toggle',
};

const FINANCE_TX_FORM_ID = 'finance-tx-form';

function focusFirstTxFormError(errors) {
  for (const key of TX_FORM_ERROR_FOCUS_ORDER) {
    if (!errors[key]) continue;
    const primaryId = TX_FORM_FIELD_IDS[key];
    const el =
      document.getElementById(primaryId) ||
      (key === 'planName' ? document.getElementById(TX_FORM_FIELD_IDS.description) : null);
    if (el && typeof el.focus === 'function') {
      el.focus();
      return;
    }
  }
}

function validateTxFormFields({
  txForm,
  bankAccountLabels,
  financeConfig,
  editingRecurrenceOnly,
  accounts,
}) {
  const errors = {};
  if (editingRecurrenceOnly) {
    if (!txForm.repeat_enabled) {
      errors.recurrence = 'Ative "Repetir automaticamente" para manter a recorrência.';
    }
    return errors;
  }

  const grossNum =
    typeof txForm.gross === 'number' && Number.isFinite(txForm.gross)
      ? txForm.gross
      : parseCurrencyBRL(txForm.gross);
  if (!Number.isFinite(grossNum) || grossNum <= 0) {
    errors.gross = 'Informe um valor maior que zero.';
  }

  const cat = resolveFinanceCategory(txForm.category, accounts);
  if (!cat) {
    errors.category = 'Selecione uma categoria válida.';
  } else if (cat.type === 'plan' && !String(txForm.planName || '').trim()) {
    errors.planName = 'Selecione um plano.';
  } else if (txForm.direction === 'out' && !String(txForm.planName || '').trim()) {
    errors.planName = 'Informe uma descrição para identificar a saída.';
  } else if (cat.type !== 'plan' && !String(txForm.planName || '').trim()) {
    errors.planName = 'Informe uma descrição para identificar o lançamento.';
  }

  if (bankAccountLabels.length > 0) {
    const accountCheck = validateBankAccountForPayment(txForm.bankAccount, financeConfig);
    if (!accountCheck.ok) {
      errors.bankAccount = accountCheck.message;
    }
  }

  return errors;
}

export default function TransacoesTab({
  academyId,
  financeConfig,
  onTransactionsChange,
  isOwner = false,
  isAdmin = false,
  highlightTxId = '',
  periodFrom = '',
  periodTo = '',
  onPeriodFiltersChange,
  onTxMutated,
  periodBalance = null,
  periodBalanceLoading = false,
}) {
  const leads = useStudentStore((s) => s.students);
  const chartAccounts = useAccountingStore((s) => s.accounts);
  const journalEntries = useAccountingStore((s) => s.journal);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (academyId) useAccountingStore.getState().loadByAcademy(academyId);
  }, [academyId]);
  const [searchParams, setSearchParams] = useSearchParams();
  const canManageAdvanced = isOwner || isAdmin;
  const isMobileList = useMediaQuery('(max-width: 767px)');
  const activePaymentMethodOptions = useMemo(
    () => storageDialectPaymentMethodOptionsForFinance(financeConfig),
    [financeConfig]
  );
  const [fromDate, setFromDate] = useState(periodFrom);
  const [toDate, setToDate] = useState(periodTo);
  const [txLoading, setTxLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [showTxModal, setShowTxModal] = useState(() => searchParams.get('new') === '1');
  const [txFormErrors, setTxFormErrors] = useState({});
  const [txForm, setTxForm] = useState(() => ({
    direction: 'in',
    type: 'plan',
    planName: '',
    method: 'pix',
    gross: '',
    fee: '',
    installments: 1,
    note: '',
    lead_id: '',
    competence_month: currentCompetenceMonth(),
    category: FINANCE_CATEGORIES.MENSALIDADE.label,
    bankAccount: '',
    due_date: todayYmdLocal(),
    ...defaultRecurrenceForm(),
  }));
  const [savingTx, setSavingTx] = useState(false);
  const [receiveNow, setReceiveNow] = useState(false);
  const [cancelLoadingId, setCancelLoadingId] = useState('');
  const [recurrenceCancelLoadingId, setRecurrenceCancelLoadingId] = useState('');
  const [menuOpenId, setMenuOpenId] = useState('');
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [txPaymentSectionOpen, setTxPaymentSectionOpen] = useState(true);
  const [txOptionalSectionOpen, setTxOptionalSectionOpen] = useState(false);
  const [editingRecurrenceOnly, setEditingRecurrenceOnly] = useState(false);
  const [editingTxId, setEditingTxId] = useState('');
  const [editPreservedSaleId, setEditPreservedSaleId] = useState('');
  const [studentDisplayName, setStudentDisplayName] = useState('');
  const [regime, setRegime] = useState(() => (academyId ? getFinanceRegime(academyId) : FINANCE_REGIME.CASH));
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [listTotal, setListTotal] = useState(null);
  const [listTruncated, setListTruncated] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const statusFilter = useMemo(
    () => parseStatusFilterParam(searchParams.get('status')),
    [searchParams]
  );
  const directionFilter = useMemo(
    () => parseDirectionFilterParam(searchParams.get('dir')),
    [searchParams]
  );
  const [txSearch, setTxSearch] = useState(() => searchParams.get('q') || '');
  const debouncedTxSearch = useDebounce(txSearch, 200);
  const [detailTx, setDetailTx] = useState(null);
  const [anticipateTarget, setAnticipateTarget] = useState(null);
  const [pendingAnticipation, setPendingAnticipation] = useState(null);
  const [anticipateSaving, setAnticipateSaving] = useState(false);
  const [showDiscardTxModal, setShowDiscardTxModal] = useState(false);
  const [showCancelTxDialog, setShowCancelTxDialog] = useState(false);
  const [pendingCancelId, setPendingCancelId] = useState('');
  const [showCancelRecDialog, setShowCancelRecDialog] = useState(false);
  const [pendingCancelRecId, setPendingCancelRecId] = useState('');
  const [showReverseTxDialog, setShowReverseTxDialog] = useState(false);
  const [pendingReverseId, setPendingReverseId] = useState('');
  const [reverseLoadingId, setReverseLoadingId] = useState('');
  const [assignBankTx, setAssignBankTx] = useState(null);
  const [assignBankAccount, setAssignBankAccount] = useState('');
  const [assignBankSaving, setAssignBankSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exportingTx, setExportingTx] = useState(false);
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState(() => defaultTxColumnVisibility());
  const loadReqRef = useRef(0);
  const lastNotifiedTxRef = useRef('');
  const highlightRowRef = useRef(null);
  const txFormSnapshotRef = useRef('');
  const highlightDrawerOpenedRef = useRef('');

  useEffect(() => {
    if (academyId) setRegime(getFinanceRegime(academyId));
  }, [academyId]);

  useEffect(() => {
    if (!academyId) return;
    setVisibleCols(loadTxColumnVisibility(academyId));
  }, [academyId]);

  const toggleTxColumn = useCallback(
    (key) => {
      setVisibleCols((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        saveTxColumnVisibility(academyId, next);
        return next;
      });
    },
    [academyId]
  );

  const desktopTableColCount = useMemo(() => {
    const optionalVisible = OPTIONAL_TX_COLUMNS.filter((c) => visibleCols[c.key]).length;
    return 6 + optionalVisible;
  }, [visibleCols]);

  const initialTxForm = useCallback(
    (direction = 'in') =>
      buildInitialTxForm(direction, {
        bankAccount: resolveBankAccountForPayment('', financeConfig),
      }),
    [financeConfig]
  );

  const openNewTxModal = useCallback(
    (opts = {}) => {
      const direction = opts.direction === 'out' ? 'out' : 'in';
      const form = initialTxForm(direction);
      setEditingTxId('');
      setEditPreservedSaleId('');
      setReceiveNow(false);
      setTxForm(form);
      setStudentDisplayName('');
      setTxFormErrors({});
      setTxPaymentSectionOpen(true);
      setTxOptionalSectionOpen(false);
      setRecurrenceOpen(false);
      setShowTxModal(true);
      txFormSnapshotRef.current = JSON.stringify({ form, student: '' });
    },
    [initialTxForm]
  );

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    const direction = searchParams.get('dir') === 'out' ? 'out' : 'in';
    openNewTxModal({ direction });
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    next.delete('dir');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, openNewTxModal]);

  const bankAccountFilter = useMemo(
    () => bankFilterFromContaParam(searchParams.get('conta')),
    [searchParams]
  );

  const setBankAccountFilter = useCallback(
    (value) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const conta = contaParamFromBankFilter(value);
          if (conta) next.set('conta', conta);
          else next.delete('conta');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const recurrenceEndOptions = useMemo(() => buildRecurrenceEndOptions(), []);

  const categoryOptionGroups = useMemo(
    () => getCategoryOptionsByNature(txForm.direction === 'out' ? 'out' : 'in', chartAccounts),
    [txForm.direction, chartAccounts]
  );

  const leadNameById = useMemo(
    () => buildLeadNameById(transactions, leads),
    [transactions, leads]
  );

  const setStatusFilter = useCallback(
    (value) => {
      setSearchParams(
        (prev) => patchFinanceTxUrlParam(prev, 'status', value),
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setDirectionFilter = useCallback(
    (value) => {
      setSearchParams(
        (prev) => patchFinanceTxUrlParam(prev, 'dir', value),
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const q = debouncedTxSearch.trim();
        const current = prev.get('q') || '';
        if (q === current) return prev;
        return patchFinanceTxUrlParam(prev, 'q', q, { omitWhen: [''] });
      },
      { replace: true }
    );
  }, [debouncedTxSearch, setSearchParams]);

  useEffect(() => {
    if (!highlightTxId || txLoading) return;
    if (highlightDrawerOpenedRef.current === highlightTxId) return;
    const tx = transactions.find((t) => String(t.id) === highlightTxId);
    if (tx) {
      highlightDrawerOpenedRef.current = highlightTxId;
      setDetailTx(tx);
    }
  }, [highlightTxId, transactions, txLoading]);

  const bankAccountLabels = useMemo(
    () => listBankAccountLabels(financeConfig),
    [financeConfig]
  );

  const canAssignBankOnTx = useCallback(
    (tx) => {
      if (String(tx?.status || '').toLowerCase() !== 'settled') return false;
      if (!bankAccountLabels.length) return false;
      if (canManageAdvanced) return true;
      return txDirection(tx) !== 'out';
    },
    [bankAccountLabels.length, canManageAdvanced]
  );

  const filteredTransactions = useMemo(
    () =>
      applyFinanceTxFilters(
        transactions,
        {
          statusFilter,
          directionFilter,
          bankAccountFilter:
            bankAccountFilter === BANK_FILTER_UNALLOCATED ? '__unallocated__' : bankAccountFilter,
          search: debouncedTxSearch,
        },
        leadNameById
      ),
    [transactions, statusFilter, directionFilter, bankAccountFilter, debouncedTxSearch, leadNameById]
  );

  const anticipationByParentId = useMemo(() => {
    const map = new Map();
    for (const tx of transactions) {
      if (String(tx.origin_type || '').toLowerCase() !== 'anticipation_fee') continue;
      const parentId = String(tx.origin_id || '').trim();
      if (parentId) map.set(parentId, tx);
    }
    return map;
  }, [transactions]);

  const hasActiveTxFilters =
    statusFilter !== 'all' ||
    directionFilter !== 'all' ||
    bankAccountFilter !== 'all' ||
    txSearch.trim().length > 0;

  const clearTxFilters = useCallback(() => {
    setStatusFilter('all');
    setDirectionFilter('all');
    setBankAccountFilter('all');
    setTxSearch('');
  }, [setBankAccountFilter, setStatusFilter, setDirectionFilter]);

  const openTxDetail = useCallback((tx) => {
    if (!tx) return;
    setDetailTx(tx);
    setMenuOpenId('');
  }, []);

  const closeTxDetail = useCallback(() => {
    setDetailTx(null);
  }, []);

  const handleExportTransactions = useCallback(async () => {
    if (!academyId || exportingTx) return;
    setExportingTx(true);
    try {
      toast.info('Buscando lançamentos do período…');
      const all = await fetchAllFinanceTxInPeriod({
        academyId,
        from: fromDate,
        to: toDate,
        regime,
      });
      const filtered = applyFinanceTxFilters(
        all,
        {
          statusFilter,
          directionFilter,
          bankAccountFilter:
            bankAccountFilter === BANK_FILTER_UNALLOCATED ? '__unallocated__' : bankAccountFilter,
          search: debouncedTxSearch,
        },
        leadNameById
      );
      const csvRows = filtered.map((tx) =>
        financeTxToCsvRow(tx, {
          leadNameById,
          accounts: chartAccounts,
        })
      );
      exportFinanceTransactionsCsv(csvRows, { from: fromDate, to: toDate });
      if (csvRows.length === 0) {
        toast.warning('Nenhum lançamento para exportar com os filtros atuais.');
      } else {
        toast.success(`${csvRows.length} lançamento(s) exportado(s).`);
        if (filtered.length < all.length) {
          toast.info('Exportação respeitou os filtros ativos na tela.');
        }
      }
    } catch (e) {
      console.error('[TransacoesTab] export:', e);
      toast.error('Não foi possível exportar os lançamentos.');
    } finally {
      setExportingTx(false);
    }
  }, [
    academyId,
    exportingTx,
    fromDate,
    toDate,
    regime,
    statusFilter,
    directionFilter,
    bankAccountFilter,
    debouncedTxSearch,
    leadNameById,
    chartAccounts,
    toast,
  ]);

  const resetTxModal = () => {
    setShowTxModal(false);
    setShowDiscardTxModal(false);
    setEditingTxId('');
    setEditingRecurrenceOnly(false);
    setRecurrenceOpen(false);
    setEditPreservedSaleId('');
    setReceiveNow(false);
    setTxForm(initialTxForm('in'));
    setTxPaymentSectionOpen(true);
    setTxOptionalSectionOpen(false);
    setTxFormErrors({});
    setStudentDisplayName('');
    txFormSnapshotRef.current = '';
  };

  const isTxModalDirty = useCallback(() => {
    if (!txFormSnapshotRef.current) return false;
    return (
      JSON.stringify({ form: txForm, student: studentDisplayName }) !== txFormSnapshotRef.current
    );
  }, [txForm, studentDisplayName]);

  const clearTxFieldError = useCallback((field) => {
    setTxFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const applyTxCategory = useCallback(
    (value) => {
      setTxForm((prev) => {
        const dir = prev.direction === 'out' ? 'out' : 'in';
        const prevCat = resolveFinanceCategory(prev.category, chartAccounts, { direction: dir });
        const cat = resolveFinanceCategory(value, chartAccounts, { direction: dir });
        if (!cat) return prev;
        const wasPlan = prevCat?.type === 'plan';
        const isPlan = cat.type === 'plan';
        let planName = prev.planName;
        if (wasPlan !== isPlan) planName = '';
        return {
          ...prev,
          category: value,
          type: cat.type || prev.type,
          planName,
        };
      });
      clearTxFieldError('category');
      clearTxFieldError('planName');
    },
    [chartAccounts, clearTxFieldError]
  );

  const handleTxDirectionChange = useCallback(
    (dir) => {
      setTxForm((prev) =>
        applyDirectionChangeToTxForm(prev, dir, { chartAccounts, receiveNow, editingTxId })
      );
      if (dir === 'out') {
        setStudentDisplayName('');
      }
      clearTxFieldError('category');
      clearTxFieldError('planName');
    },
    [chartAccounts, receiveNow, editingTxId, clearTxFieldError]
  );

  const competenceSynced = useMemo(
    () =>
      shouldSyncCompetenceFromDueDate({
        direction: txForm.direction,
        receiveNow,
        editingTxId,
      }),
    [txForm.direction, receiveNow, editingTxId]
  );

  const showStudentField = useMemo(
    () =>
      shouldShowFinanceTxStudentField(
        txForm.direction,
        resolveFinanceCategory(txForm.category, chartAccounts)?.type
      ),
    [txForm.direction, txForm.category, chartAccounts]
  );

  const txCategoryType = useMemo(
    () => resolveFinanceCategory(txForm.category, chartAccounts)?.type,
    [txForm.category, chartAccounts]
  );

  const categorySuggestionEnabled =
    showTxModal &&
    !editingTxId &&
    !editingRecurrenceOnly &&
    txCategoryType !== 'plan';

  const categorySuggestion = useFinanceCategorySuggestion({
    transactions,
    direction: txForm.direction === 'out' ? 'out' : 'in',
    description: txForm.planName,
    enabled: categorySuggestionEnabled,
  });

  const visibleCategorySuggestion = useMemo(() => {
    if (!categorySuggestion?.category) return null;
    const current = String(txForm.category || '').trim();
    const suggested = String(categorySuggestion.category || '').trim();
    if (!suggested || current === suggested) return null;
    return categorySuggestion;
  }, [categorySuggestion, txForm.category]);

  const loadTransactions = useCallback(
    async (cursor = null, append = false) => {
      if (!academyId) {
        setTransactions([]);
        setHasMore(false);
        setNextCursor(null);
        setListTotal(null);
        return;
      }
      const reqId = ++loadReqRef.current;
      if (append) setLoadingMore(true);
      else setTxLoading(true);
      try {
        const body = await listFinanceTx({
          academyId,
          from: fromDate,
          to: toDate,
          cursor,
          regime,
          limit: append ? FINANCE_TX_LIST_PAGE_SIZE : FINANCE_TX_LIST_INITIAL_PAGE_SIZE,
        });
        if (reqId !== loadReqRef.current) return;
        const items = body.transactions || [];
        setTransactions((prev) => (append ? [...prev, ...items] : items));
        setHasMore(Boolean(body.hasMore));
        setNextCursor(body.nextCursor || null);
        setListTotal(typeof body.total === 'number' ? body.total : null);
        setListTruncated(Boolean(body.truncated));
        setLoadError(false);
      } catch {
        if (reqId !== loadReqRef.current) return;
        if (!append) {
          setTransactions([]);
          setHasMore(false);
          setNextCursor(null);
          setListTotal(null);
          setLoadError(true);
        }
      } finally {
        if (reqId === loadReqRef.current) {
          setTxLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [academyId, fromDate, toDate, regime]
  );

  const confirmAnticipation = useCallback(
    async ({ tx, feeAmount }) => {
      if (!academyId || !tx?.id || anticipateSaving) return;
      setAnticipateSaving(true);
      try {
        await anticipateFinanceTx({
          academyId,
          txId: tx.id,
          feeAmount,
        });
        toast.show({ type: 'success', message: 'Antecipação registrada.' });
        setPendingAnticipation(null);
        setAnticipateTarget(null);
        void loadTransactions();
        onTxMutated?.();
      } catch (e) {
        toast.show({
          type: 'error',
          message: financeTxFriendlyError(e) || 'Não foi possível registrar a antecipação.',
        });
      } finally {
        setAnticipateSaving(false);
      }
    },
    [academyId, anticipateSaving, loadTransactions, onTxMutated, toast]
  );

  const loadMoreTransactions = useCallback(() => {
    if (!hasMore || !nextCursor || txLoading || loadingMore) return;
    void loadTransactions(nextCursor, true);
  }, [hasMore, nextCursor, txLoading, loadingMore, loadTransactions]);

  const notifyPeriodFiltersChange = useCallback(
    (from, to) => {
      if (typeof onPeriodFiltersChange !== 'function') return;
      onPeriodFiltersChange(from, to);
    },
    [onPeriodFiltersChange]
  );

  const handleFromDateChange = useCallback(
    (e) => {
      const next = e.target.value;
      setFromDate(next);
      notifyPeriodFiltersChange(next, toDate);
    },
    [notifyPeriodFiltersChange, toDate]
  );

  const handleToDateChange = useCallback(
    (e) => {
      const next = e.target.value;
      setToDate(next);
      notifyPeriodFiltersChange(fromDate, next);
    },
    [notifyPeriodFiltersChange, fromDate]
  );

  const requestCloseTxModal = useCallback(() => {
    if (savingTx) return;
    if (isTxModalDirty()) {
      setShowDiscardTxModal(true);
      return;
    }
    resetTxModal();
  }, [savingTx, isTxModalDirty]); // eslint-disable-line react-hooks/exhaustive-deps -- resetTxModal stable enough

  useModalA11y({ isOpen: showTxModal, onClose: requestCloseTxModal, lockScroll: true });

  const openEditModal = (tx) => {
    if (String(tx.status || '').toLowerCase() !== 'pending') return;
    const gross = displayGross(tx);
    let feeInput = '';
    if (txDirection(tx) !== 'out' && Number.isFinite(gross) && gross > 0 && displayFee(tx) > 0) {
      const pct = (displayFee(tx) / gross) * 100;
      feeInput = Number.isFinite(pct) ? String(Math.round(pct * 100) / 100) : '';
    }
    setEditingTxId(tx.id);
    setEditPreservedSaleId(String(tx.saleId || '').trim());
    const dir = txDirection(tx) === 'out' ? 'out' : 'in';
    const catLabel = tx.category || defaultCategoryForTxType(tx.type);
    const cat = resolveFinanceCategory(catLabel, chartAccounts);
    const categoryValue =
      parseAccountCategoryValue(catLabel) || cat?.isAccountCategory
        ? encodeAccountCategoryValue(cat?.accountCode || parseAccountCategoryValue(catLabel))
        : catLabel;
    setTxForm({
      direction: dir,
      type: cat?.type || tx.type || 'plan',
      planName: tx.planName || '',
      method: tx.method || 'pix',
      gross: Number.isFinite(gross) && gross > 0 ? gross : '',
      fee: feeInput,
      installments: Math.min(12, Math.max(1, Number(tx.installments) || 1)),
      note: tx.note || '',
      lead_id: tx.lead_id || '',
      competence_month: tx.competence_month || currentCompetenceMonth(),
      category: categoryValue,
      bankAccount:
        String(tx.bankAccount || resolveTxBankAccount(tx) || '').trim() ||
        resolveBankAccountForPayment('', financeConfig),
      due_date: String(tx.due_date || tx.dueDate || '').slice(0, 10) || todayYmdLocal(),
    });
    const leadName = resolveTxLeadName(tx, leadNameById);
    setStudentDisplayName(leadName === 'Aluno não encontrado' ? '' : leadName);
    setTxFormErrors({});
    setShowTxModal(true);
    setTxPaymentSectionOpen(true);
    setTxOptionalSectionOpen(Boolean(tx.lead_id || tx.note || tx.competence_month));
    txFormSnapshotRef.current = JSON.stringify({
      form: {
        direction: dir,
        type: cat?.type || tx.type || 'plan',
        planName: tx.planName || '',
        method: tx.method || 'pix',
        gross: Number.isFinite(gross) && gross > 0 ? gross : '',
        fee: feeInput,
        installments: Math.min(12, Math.max(1, Number(tx.installments) || 1)),
        note: tx.note || '',
        lead_id: tx.lead_id || '',
        competence_month: tx.competence_month || currentCompetenceMonth(),
        category: categoryValue,
        bankAccount:
          String(tx.bankAccount || resolveTxBankAccount(tx) || '').trim() ||
          resolveBankAccountForPayment('', financeConfig),
        due_date: String(tx.due_date || tx.dueDate || '').slice(0, 10) || todayYmdLocal(),
      },
      student: leadName === 'Aluno não encontrado' ? '' : leadName,
    });
  };

  const openEditRecurrenceModal = (tx) => {
    openEditModal(tx);
    setEditingRecurrenceOnly(true);
    setRecurrenceOpen(true);
    setTxOptionalSectionOpen(true);
    setTxForm((f) => ({
      ...f,
      repeat_enabled: true,
      recurrence_type: tx.recurrence_type === RECURRENCE_TYPES.WEEKLY ? RECURRENCE_TYPES.WEEKLY : RECURRENCE_TYPES.MONTHLY,
      recurrence_day: normalizeRecurrenceDay(
        tx.recurrence_type === RECURRENCE_TYPES.WEEKLY ? RECURRENCE_TYPES.WEEKLY : RECURRENCE_TYPES.MONTHLY,
        tx.recurrence_day
      ),
      recurrence_end: tx.recurrence_end || '',
    }));
    setMenuOpenId('');
  };

  const requestCancelRecurrence = (id) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    setPendingCancelRecId(tid);
    setShowCancelRecDialog(true);
    setMenuOpenId('');
  };

  const cancelRecurrence = async (id) => {
    const tid = String(id || pendingCancelRecId || '').trim();
    if (!tid || !academyId) return;
    setRecurrenceCancelLoadingId(tid);
    setShowCancelRecDialog(false);
    setPendingCancelRecId('');
    try {
      const row = await patchFinanceTx({ academyId, id: tid, payload: { action: 'cancel_recurrence' } });
      setTransactions((prev) => prev.map((t) => (String(t.id) === tid ? row : t)));
      toast.success('Recorrência cancelada.');
      if (typeof onTxMutated === 'function') onTxMutated();
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
    } catch (e) {
      toast.error(e, 'action');
    } finally {
      setRecurrenceCancelLoadingId('');
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    setFromDate(periodFrom);
    setToDate(periodTo);
  }, [periodFrom, periodTo]);

  useEffect(() => {
    if (!highlightTxId || txLoading) return;
    const exists = transactions.some((t) => String(t.id) === highlightTxId);
    if (!exists) return;
    const t = window.setTimeout(() => {
      highlightRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [highlightTxId, txLoading, transactions]);

  useEffect(() => {
    if (typeof onTransactionsChange !== 'function') return;
    const pending = (transactions || []).filter(
      (tx) => String(tx.status || '').toLowerCase() === 'pending'
    );
    const signature = pending.map((tx) => String(tx.id || '')).join('|');
    if (signature === lastNotifiedTxRef.current) return;
    lastNotifiedTxRef.current = signature;
    onTransactionsChange(pending);
  }, [transactions, onTransactionsChange]);

  useEffect(() => {
    const onSettled = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      const nowIso = new Date().toISOString();
      setTransactions((prev) =>
        prev.map((t) => (String(t.id) === String(id) ? { ...t, status: 'settled', settledAt: nowIso } : t))
      );
    };
    window.addEventListener('navi-financial-tx-settled', onSettled);
    return () => window.removeEventListener('navi-financial-tx-settled', onSettled);
  }, []);

  const openAssignBankModal = (tx) => {
    if (!tx || !canAssignBankOnTx(tx)) return;
    setAssignBankTx(tx);
    setAssignBankAccount(
      String(tx.bankAccount || resolveTxBankAccount(tx) || '').trim() ||
        resolveBankAccountForPayment('', financeConfig)
    );
  };

  const closeAssignBankModal = () => {
    if (assignBankSaving) return;
    setAssignBankTx(null);
    setAssignBankAccount('');
  };

  const saveAssignBank = async () => {
    if (!assignBankTx?.id || !academyId || assignBankSaving) return;
    const accountCheck = validateBankAccountForPayment(assignBankAccount, financeConfig);
    if (!accountCheck.ok) {
      toast.show({ type: 'error', message: accountCheck.message });
      return;
    }
    setAssignBankSaving(true);
    try {
      const row = await patchFinanceTx({
        academyId,
        id: assignBankTx.id,
        payload: {
          action: 'assign_bank_account',
          bank_account: accountCheck.account || assignBankAccount,
        },
      });
      setTransactions((prev) =>
        prev.map((t) => (String(t.id) === String(assignBankTx.id) ? { ...t, ...row, bankAccount: row.bankAccount || accountCheck.account } : t))
      );
      toast.success('Conta bancária atribuída.');
      setAssignBankTx(null);
      setAssignBankAccount('');
      if (typeof onTxMutated === 'function') onTxMutated();
    } catch (e) {
      console.error(e);
      const code = String(e?.message || '').trim();
      toast.show({
        type: 'error',
        message: financeTxFriendlyError(code, 'action'),
      });
    } finally {
      setAssignBankSaving(false);
    }
  };

  const settle = async (id) => {
    try {
      const row = await patchFinanceTx({ academyId, id, payload: { action: 'settle' } });
      const nowIso = row.settledAt || new Date().toISOString();
      setTransactions((prev) => prev.map((t) => (t.id === id ? { ...row, status: 'settled', settledAt: nowIso } : t)));
      toast.success('Transação liquidada com sucesso');
      if (row && academyId) {
        applySettleAccountingSideEffects(row, academyId);
      }
      if (typeof onTxMutated === 'function') onTxMutated();
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
    } catch (e) {
      console.error(e);
      const code = String(e?.message || '').trim();
      toast.show({
        type: 'error',
        message: financeTxFriendlyError(code, 'action'),
      });
    }
  };

  const requestCancelTx = (id) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    setPendingCancelId(tid);
    setShowCancelTxDialog(true);
  };

  const requestReverseTx = (id) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    setPendingReverseId(tid);
    setShowReverseTxDialog(true);
    setMenuOpenId('');
  };

  const reverseTx = async (id) => {
    const tid = String(id || pendingReverseId || '').trim();
    if (!tid || !academyId) return;
    setReverseLoadingId(tid);
    setShowReverseTxDialog(false);
    setPendingReverseId('');
    try {
      const body = await reverseFinanceTx({ academyId, id: tid });
      const original = body.transaction;
      const reversal = body.reversal;
      setTransactions((prev) => {
        const next = prev.map((t) => (String(t.id) === tid ? original : t));
        if (reversal?.id && !next.some((t) => String(t.id) === String(reversal.id))) {
          return [reversal, ...next];
        }
        return next;
      });
      if (reversal && academyId) {
        applySettleAccountingSideEffects(reversal, academyId);
      }
      toast.success('Lançamento estornado. O original foi cancelado e um estorno foi registrado.');
      if (typeof onTxMutated === 'function') onTxMutated();
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
    } catch (e) {
      const code = String(e?.message || '').trim();
      toast.show({
        type: 'error',
        message: financeTxFriendlyError(code, 'action'),
      });
    } finally {
      setReverseLoadingId('');
    }
  };

  const cancelTx = async (id) => {
    const tid = String(id || pendingCancelId || '').trim();
    if (!tid || !academyId) return;
    setCancelLoadingId(tid);
    setShowCancelTxDialog(false);
    setPendingCancelId('');
    try {
      const row = await patchFinanceTx({ academyId, id: tid, payload: { action: 'cancel' } });
      setTransactions((prev) => prev.map((t) => (String(t.id) === tid ? row : t)));
      toast.success('Lançamento cancelado.');
      if (typeof onTxMutated === 'function') onTxMutated();
    } catch (e) {
      console.error(e);
      const code = String(e?.message || '').trim();
      toast.show({
        type: 'error',
        message: financeTxFriendlyError(code, 'action'),
      });
    } finally {
      setCancelLoadingId('');
    }
  };

  const saveManualTx = async () => {
    if (!academyId) return;
    if (txForm.direction === 'out' && !canManageAdvanced) {
      toast.show({ type: 'error', message: 'Apenas gestores podem registrar saída.' });
      return;
    }

    const fieldErrors = validateTxFormFields({
      txForm,
      bankAccountLabels,
      financeConfig,
      editingRecurrenceOnly,
      accounts: chartAccounts,
    });
    if (Object.keys(fieldErrors).length > 0) {
      setTxFormErrors(fieldErrors);
      focusFirstTxFormError(fieldErrors);
      return;
    }
    const dir = txForm.direction === 'out' ? 'out' : 'in';
    if (dir === 'out' && (!receiveNow || editingTxId) && !editingRecurrenceOnly) {
      const due = String(txForm.due_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        setTxFormErrors({ due_date: 'Informe a data de vencimento.' });
        focusFirstTxFormError({ due_date: 'x' });
        return;
      }
    }
    setTxFormErrors({});

    const grossNum =
      typeof txForm.gross === 'number' && Number.isFinite(txForm.gross)
        ? txForm.gross
        : parseCurrencyBRL(txForm.gross);
    const cat = resolveFinanceCategory(txForm.category, chartAccounts, { direction: dir });
    if (!cat) return;
    let bankAccount = '';
    if (bankAccountLabels.length > 0) {
      const accountCheck = validateBankAccountForPayment(txForm.bankAccount, financeConfig);
      bankAccount = accountCheck.account || txForm.bankAccount || '';
    }
    const feePct =
      txForm.direction === 'out' ? 0 : parseFloat(String(txForm.fee || '').replace(',', '.')) || 0;
    const installments =
      txForm.method === STORAGE_CREDIT_METHOD ? Math.min(12, Math.max(1, Number(txForm.installments) || 1)) : 1;
    setSavingTx(true);
    try {
      const payload = {
        saleId: editPreservedSaleId || '',
        lead_id: txForm.lead_id || '',
        method: txForm.method,
        installments,
        type: cat.type,
        category: cat.isAccountCategory
          ? encodeAccountCategoryValue(cat.accountCode)
          : cat.label,
        direction: dir,
        competence_month: txForm.competence_month || currentCompetenceMonth(),
        planName: txForm.planName || '',
        gross: grossNum,
        fee: feePct > 0 ? grossNum * (feePct / 100) : 0,
        note: txForm.note || '',
        bank_account: bankAccount,
        receive_now: !editingTxId && receiveNow,
        settledAt: receiveNow ? new Date().toISOString() : undefined,
      };

      if (editingTxId && editingRecurrenceOnly) {
        const row = await patchFinanceTx({
          academyId,
          id: editingTxId,
          payload: {
            action: 'update_recurrence',
            recurrence_type: txForm.recurrence_type,
            recurrence_day: normalizeRecurrenceDay(txForm.recurrence_type, txForm.recurrence_day),
            recurrence_end: txForm.recurrence_end || '',
          },
        });
        setTransactions((prev) => prev.map((t) => (t.id === editingTxId ? row : t)));
        toast.success('Recorrência atualizada.');
      } else if (editingTxId) {
        const row = await patchFinanceTx({ academyId, id: editingTxId, payload });
        setTransactions((prev) => prev.map((t) => (t.id === editingTxId ? row : t)));
        toast.success('Lançamento atualizado.');
      } else {
        if (txForm.repeat_enabled) {
          payload.is_recurrence_template = true;
          payload.recurrence_type = txForm.recurrence_type || RECURRENCE_TYPES.MONTHLY;
          payload.recurrence_day = normalizeRecurrenceDay(payload.recurrence_type, txForm.recurrence_day);
          if (txForm.recurrence_end) payload.recurrence_end = txForm.recurrence_end;
        }
        if (dir === 'out') {
          const cm = payload.competence_month || currentCompetenceMonth();
          if (txForm.repeat_enabled && !editingTxId) {
            payload.due_date = dueDateForRecurrenceMonth(payload.recurrence_day, cm);
          } else if (!receiveNow || editingTxId) {
            const due = String(txForm.due_date || '').slice(0, 10) || todayYmdLocal();
            payload.due_date = due;
            if (!editingTxId) payload.competence_month = due.slice(0, 7) || cm;
          }
        }
        const row = await createFinanceTx({ academyId, payload });
        if (receiveNow && row) applyAccountingSideEffectsAuto(row, academyId);
        setTransactions((prev) => [row, ...prev]);
        toast.show({
          type: 'success',
          message: receiveNow ? 'Lançamento registrado e liquidado.' : 'Lançamento registrado.',
        });
      }
      resetTxModal();
      if (typeof onTxMutated === 'function') onTxMutated();
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
      void loadTransactions();
    } catch (e) {
      console.error(e);
      toast.show({ type: 'error', message: financeTxFriendlyError(e, 'save') });
    } finally {
      setSavingTx(false);
    }
  };

  const periodBalanceFormatted =
    periodBalanceLoading
      ? '…'
      : periodBalance != null
        ? Number(periodBalance.periodBalance || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })
        : '—';

  return (
    <>
      <FinanceTabShell panelClassName="finance-tx-section finance-tab-panel--compact">
        <FinanceBankAccountsSetupBanner
          financeConfig={financeConfig}
          canConfigure={canManageAdvanced}
          className="finance-tx-bank-setup-banner"
        />
        <FinanceFiltersBar panel className="finance-tx-toolbar">
          <div className="finance-hub-filters__row finance-tx-toolbar__filters">
            {academyId ? (
              <FinanceRegimeToggle
                academyId={academyId}
                value={regime}
                onChange={setRegime}
                hintStyle="tooltip"
                className="finance-regime-toggle--inline"
              />
            ) : null}
            <FinanceToolbarDate
              id="finance-tx-from"
              label="De"
              value={fromDate}
              onChange={handleFromDateChange}
            />
            <FinanceToolbarDate
              id="finance-tx-to"
              label="Até"
              value={toDate}
              onChange={handleToDateChange}
            />
            <FinanceToolbarSelect
              id="finance-tx-status"
              label="Status"
              className="finance-tx-filter-group--status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="pending">Pendente</option>
              <option value="settled">Liquidado</option>
              <option value="cancelled">Cancelado</option>
            </FinanceToolbarSelect>
            <FinanceToolbarSelect
              id="finance-tx-nature"
              label="Natureza"
              className="finance-tx-filter-group--nature"
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="in">Entrada</option>
              <option value="out">Saída</option>
            </FinanceToolbarSelect>
            {bankAccountLabels.length > 0 ? (
              <FinanceToolbarSelect
                id="finance-tx-bank"
                label="Conta"
                className="finance-tx-filter-group--bank"
                value={bankAccountFilter}
                onChange={(e) => setBankAccountFilter(e.target.value)}
              >
                <option value="all">Todas as contas</option>
                {bankAccountLabels.map((lbl) => (
                  <option key={lbl} value={lbl}>
                    {lbl}
                  </option>
                ))}
                <option value={BANK_FILTER_UNALLOCATED}>{UNALLOCATED_BANK_LABEL}</option>
              </FinanceToolbarSelect>
            ) : null}
            <SearchField
              className="finance-filters-bar__search finance-tx-toolbar__search"
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              placeholder="Buscar aluno, categoria ou nota"
              aria-label="Buscar lançamentos"
            />
            {hasActiveTxFilters ? (
              <button
                type="button"
                className="btn-outline btn-sm filter-clear navi-btn--toolbar"
                onClick={clearTxFilters}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
          <div className="finance-hub-filters__row finance-hub-filters__row--actions finance-tx-toolbar__actions-row">
            <div
              className="finance-tx-period-balance-inline finance-hub-filters__meta"
              role="status"
              title="Mensalidades pagas, parciais ou pendentes espelham no Caixa; meses cobertos por pacote não geram lançamento."
            >
              <span className="finance-tx-period-balance-inline__label">Saldo do período</span>
              <span className="finance-tx-period-balance-inline__value">{periodBalanceFormatted}</span>
            </div>
            <div className="finance-tx-toolbar__actions flex gap-2">
              {canManageAdvanced ? (
                <>
                  <button
                    type="button"
                    className="btn-outline navi-btn--toolbar finance-tx-toolbar__cta finance-tx-toolbar__cta--desktop-only"
                    onClick={() => void handleExportTransactions()}
                    disabled={exportingTx || !academyId}
                  >
                    <Download size={16} aria-hidden />
                    {exportingTx ? 'Exportando…' : 'Exportar CSV'}
                  </button>
                  <button
                    type="button"
                    className="btn-outline navi-btn--toolbar finance-tx-toolbar__cta finance-tx-toolbar__cta--desktop-only"
                    onClick={() => setShowImportModal(true)}
                  >
                    <Upload size={16} aria-hidden />
                    Importar planilha
                  </button>
                </>
              ) : null}
              <DropdownMenu
                open={mobileToolsOpen}
                onOpenChange={setMobileToolsOpen}
                className="finance-tx-toolbar__overflow"
                align="end"
              >
                <button
                  type="button"
                  className="btn-outline btn-sm navi-btn--toolbar finance-tx-toolbar__overflow-trigger"
                  aria-expanded={mobileToolsOpen}
                  aria-haspopup="menu"
                  aria-label="Mais ações"
                  onClick={() => setMobileToolsOpen((o) => !o)}
                >
                  <MoreHorizontal size={18} aria-hidden />
                </button>
                {mobileToolsOpen ? (
                  <DropdownMenuPanel aria-label="Ações de lançamentos">
                    {canManageAdvanced ? (
                      <>
                        <DropdownMenuItemStatic>
                          <button
                            type="button"
                            className="navi-menu__item"
                            disabled={exportingTx}
                            onClick={() => {
                              setMobileToolsOpen(false);
                              void handleExportTransactions();
                            }}
                          >
                            {exportingTx ? 'Exportando…' : 'Exportar CSV'}
                          </button>
                        </DropdownMenuItemStatic>
                        <DropdownMenuItemStatic>
                          <button
                            type="button"
                            className="navi-menu__item"
                            onClick={() => {
                              setShowImportModal(true);
                              setMobileToolsOpen(false);
                            }}
                          >
                            Importar planilha
                          </button>
                        </DropdownMenuItemStatic>
                      </>
                    ) : null}
                    <DropdownMenuLabel>Exibir colunas</DropdownMenuLabel>
                    {OPTIONAL_TX_COLUMNS.map((col) => (
                      <DropdownMenuItemStatic key={col.key}>
                        <label className="finance-tx-cols-option">
                          <input
                            type="checkbox"
                            checked={Boolean(visibleCols[col.key])}
                            onChange={() => toggleTxColumn(col.key)}
                          />
                          <span>{col.label}</span>
                        </label>
                      </DropdownMenuItemStatic>
                    ))}
                  </DropdownMenuPanel>
                ) : null}
              </DropdownMenu>
              <button
                type="button"
                className="btn-primary navi-btn--toolbar finance-tx-toolbar__cta"
                onClick={() => openNewTxModal()}
              >
                + Novo lançamento
              </button>
              {canManageAdvanced ? (
                <button
                  type="button"
                  className="btn-outline navi-btn--toolbar finance-tx-toolbar__cta"
                  onClick={() => openNewTxModal({ direction: 'out' })}
                >
                  + Nova saída
                </button>
              ) : null}
            </div>
          </div>
        </FinanceFiltersBar>
        <div className="card finance-tx-table-card">
          {listTruncated ? (
            <StatusBanner variant="warning" className="mb-3">
              Período com mais de 2.500 lançamentos — a lista e os totais podem estar incompletos. Reduza o
              intervalo de datas.
            </StatusBanner>
          ) : null}
          {loadError ? (
            <ErrorBanner
              message="Não foi possível carregar os lançamentos. Verifique a conexão e tente novamente."
              onRetry={() => void loadTransactions()}
              className="mb-3"
            />
          ) : null}
          <div className="finance-table-wrap">
            {txLoading ? (
              <PageSkeleton variant="table" rows={6} columns={10} />
            ) : loadError ? null : (
            <>
            {isMobileList ? (
            <div className="navi-mobile-list finance-mobile-list" aria-label="Lançamentos">
              {filteredTransactions.length === 0 ? (
                <div className="finance-tx-empty-wrap">
                  <EmptyState
                    variant="compact"
                    tone="solid"
                    icon={Receipt}
                    title={
                      transactions.length === 0
                        ? 'Nenhuma transação encontrada'
                        : 'Nenhum resultado para os filtros aplicados'
                    }
                    description={
                      transactions.length === 0
                        ? "Use '+ Novo lançamento' para registrar uma entrada ou saída."
                        : 'Ajuste os filtros ou limpe a busca.'
                    }
                    secondaryAction={
                      hasActiveTxFilters
                        ? { label: 'Limpar filtros', onClick: clearTxFilters, variant: 'link' }
                        : undefined
                    }
                    role="status"
                  />
                </div>
              ) : (
              filteredTransactions.map((tx) => {
                const descCell = getTxDescriptionCell(tx, chartAccounts);
                const st = String(tx.status || '').toLowerCase();
                const settlementHint = txSettlementSubtitle(tx);
                const dir = txDirection(tx);
                const netFmt = formatSignedMoney(displayNet(tx), dir);
                const alumStr = formatTxLeadCell(tx, leadNameById);
                const rowBusy =
                  cancelLoadingId === tx.id ||
                  recurrenceCancelLoadingId === tx.id ||
                  reverseLoadingId === tx.id ||
                  (assignBankSaving && assignBankTx?.id === tx.id);
                const rec = isRecurrenceTx(tx);
                const showRecMenu = canManageAdvanced && tx.is_recurrence_template === true;
                return (
                  <article
                    key={tx.id}
                    ref={highlightTxId && String(tx.id) === highlightTxId ? highlightRowRef : undefined}
                    role="button"
                    tabIndex={0}
                    className={`navi-mobile-card finance-mobile-card finance-mobile-card--clickable${highlightTxId && String(tx.id) === highlightTxId ? ' finance-tx-row--highlight' : ''}`}
                    onClick={() => openTxDetail(tx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openTxDetail(tx);
                      }
                    }}
                  >
                    <div className="finance-mobile-card__head">
                      <span className="finance-mobile-card__date finance-mobile-card__date--with-icon">
                        {formatTxDateStr(txTemporalIso(tx))}
                        {rec ? <Repeat size={14} title={recurrenceTooltip(tx)} aria-hidden /> : null}
                      </span>
                      <span className={`finance-mobile-card__amount ${dir === 'out' ? 'finance-amount-negative' : 'finance-amount-positive'}`}>
                        {netFmt}
                      </span>
                    </div>
                    <p className="finance-mobile-card__title">
                      {descCell.title}
                    </p>
                    <div className="finance-mobile-card__meta text-small text-muted">{descCell.subtitle}</div>
                    {settlementHint ? (
                      <div className="finance-mobile-card__meta text-small text-muted">{settlementHint}</div>
                    ) : null}
                    {tx.lead_id ? (
                      <div className="finance-mobile-card__student">{alumStr}</div>
                    ) : null}
                    {(() => {
                      const hasRowActions =
                        st === 'pending' ||
                        (st === 'settled' && (canAssignBankOnTx(tx) || canManageAdvanced)) ||
                        showRecMenu;
                      if (!hasRowActions) return null;
                      return (
                        <div
                          className="finance-mobile-card__actions"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <FinanceTxRowActions
                            txId={tx.id}
                            status={st}
                            direction={dir}
                            canManageAdvanced={canManageAdvanced}
                            canAssignBank={canAssignBankOnTx(tx)}
                            showRecMenu={showRecMenu}
                            rowBusy={rowBusy}
                            menuOpen={menuOpenId}
                            onMenuOpenChange={setMenuOpenId}
                            onEdit={() => {
                              closeTxDetail();
                              openEditModal(tx);
                            }}
                            onSettle={() => void settle(tx.id)}
                            onCancel={() => requestCancelTx(tx.id)}
                            onReverse={() => requestReverseTx(tx.id)}
                            onAssignBank={() => openAssignBankModal(tx)}
                            onEditRecurrence={() => openEditRecurrenceModal(tx)}
                            onCancelRecurrence={() => requestCancelRecurrence(tx.id)}
                            recurrenceCancelLoading={recurrenceCancelLoadingId === tx.id}
                            reverseLoading={reverseLoadingId === tx.id}
                          />
                        </div>
                      );
                    })()}
                  </article>
                );
              })
              )}
            </div>
            ) : (
            <div className="navi-desktop-table-wrap finance-desktop-table-wrap">
            <div className="finance-tx-table-toolbar">
              <DropdownMenu
                open={colsMenuOpen}
                onOpenChange={setColsMenuOpen}
                className="finance-tx-cols-menu"
                align="end"
              >
                <button
                  type="button"
                  className="btn-ghost btn-sm finance-tx-cols-trigger"
                  aria-expanded={colsMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Exibir colunas opcionais"
                  onClick={() => setColsMenuOpen((o) => !o)}
                >
                  Colunas +
                </button>
                {colsMenuOpen ? (
                  <DropdownMenuPanel aria-label="Colunas da tabela de lançamentos">
                    <DropdownMenuLabel>Exibir colunas</DropdownMenuLabel>
                    {OPTIONAL_TX_COLUMNS.map((col) => (
                      <DropdownMenuItemStatic key={col.key}>
                        <label className="finance-tx-cols-option">
                          <input
                            type="checkbox"
                            checked={Boolean(visibleCols[col.key])}
                            onChange={() => toggleTxColumn(col.key)}
                          />
                          <span>{col.label}</span>
                        </label>
                      </DropdownMenuItemStatic>
                    ))}
                  </DropdownMenuPanel>
                ) : null}
              </DropdownMenu>
            </div>
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Aluno</th>
                  {visibleCols.nature ? <th>Natureza</th> : null}
                  {visibleCols.sale ? <th>Venda</th> : null}
                  {visibleCols.bank ? <th>Conta</th> : null}
                  {visibleCols.type ? <th>Tipo</th> : null}
                  {visibleCols.method ? <th>Método</th> : null}
                  {visibleCols.gross ? <th className="finance-num">Bruto</th> : null}
                  {visibleCols.fee ? <th className="finance-num">Taxa</th> : null}
                  <th className="finance-num">Líquido</th>
                  <th>Status</th>
                  <th className="finance-num finance-tx-th-action">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={desktopTableColCount} className="finance-tx-empty-cell">
                      <EmptyState
                        variant="table-cell"
                        tone="solid"
                        icon={Receipt}
                        title={
                          transactions.length === 0
                            ? 'Nenhuma transação encontrada'
                            : 'Nenhum resultado para os filtros aplicados'
                        }
                        description={
                          transactions.length === 0
                            ? "Use '+ Novo lançamento' para registrar uma entrada ou saída."
                            : 'Ajuste os filtros ou limpe a busca.'
                        }
                        secondaryAction={
                          hasActiveTxFilters
                            ? { label: 'Limpar filtros', onClick: clearTxFilters, variant: 'link' }
                            : undefined
                        }
                        role="status"
                      />
                    </td>
                  </tr>
                ) : filteredTransactions.map((tx) => {
                  const dateStr = formatTxDateStr(txTemporalIso(tx));
                  const noCompetence =
                    regime === FINANCE_REGIME.COMPETENCE && competenceMonthMissing(tx);
                  const dir = txDirection(tx);
                  const nature = NATURE_STYLES[dir];
                  const descCell = getTxDescriptionCell(tx, chartAccounts);
                  const grossFmt = formatSignedMoney(displayGross(tx), dir);
                  const feeFmt = formatMoneyBRL(displayFee(tx));
                  const netFmt = formatSignedMoney(displayNet(tx), dir);
                  const typeLabel = getTxTypeLabelDesktop(tx);
                  const methodLabel = formatPaymentMethod(tx.method, tx.installments);
                  const alumFull = formatTxLeadCell(tx, leadNameById);
                  const alumStr =
                    alumFull.length > 20 ? `${alumFull.slice(0, 20)}…` : alumFull;
                  const leadId = String(tx.lead_id || '').trim();
                  const st = String(tx.status || '').toLowerCase();
                  const settlementHint = txSettlementSubtitle(tx);
                  const statusBadge =
                    st === 'pending' ? (
                      <span className="finance-badge-pendente">Pendente</span>
                    ) : st === 'settled' ? (
                      <span className="finance-badge-pago">Liquidado</span>
                    ) : st === 'cancelled' ? (
                      <span className="finance-badge-cancelado">Cancelado</span>
                    ) : (
                      <span className="finance-badge-neutro">{tx.status || '—'}</span>
                    );
                  const rowBusy =
                    cancelLoadingId === tx.id ||
                    recurrenceCancelLoadingId === tx.id ||
                    reverseLoadingId === tx.id ||
                    (assignBankSaving && assignBankTx?.id === tx.id);
                  const rec = isRecurrenceTx(tx);
                  const recTip = recurrenceTooltip(tx);
                  const showRecMenu = canManageAdvanced && tx.is_recurrence_template === true;
                  const isHighlighted = highlightTxId && String(tx.id) === highlightTxId;
                  return (
                    <tr
                      key={tx.id}
                      ref={isHighlighted ? highlightRowRef : undefined}
                      tabIndex={0}
                      role="button"
                      className={`finance-tx-row--clickable${isHighlighted ? ' finance-tx-row--highlight' : ''}`}
                      onClick={() => openTxDetail(tx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openTxDetail(tx);
                        }
                      }}
                    >
                      <td>
                        <span className="finance-tx-date-cell">
                          {dateStr}
                          {rec ? (
                            <Repeat
                              size={14}
                              aria-hidden
                              title={recTip || 'Lançamento recorrente — gerado automaticamente'}
                              className="finance-tx-date-cell__icon"
                            />
                          ) : null}
                        </span>
                        {noCompetence ? (
                          <span className="finance-tx-competence-missing" title="Sem competência definida — usando data de pagamento">
                            sem competência
                          </span>
                        ) : null}
                        {settlementHint ? (
                          <span className="finance-tx-settlement-hint text-small text-muted">{settlementHint}</span>
                        ) : null}
                      </td>
                      <td>
                        <div className="finance-tx-desc-cell">
                          <span className={descCell.titleClassName}>
                            {descCell.title}
                          </span>
                          <span className="finance-tx-desc-cell__sub">{descCell.subtitle}</span>
                        </div>
                      </td>
                      <td title={alumFull}>
                        {leadId ? (
                          <button
                            type="button"
                            className="finance-tx-lead-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/student/${leadId}`);
                            }}
                          >
                            {alumStr}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      {visibleCols.nature ? (
                        <td>
                          <span className={dir === 'out' ? 'finance-value-negative finance-tx-nature-label' : 'finance-value-positive finance-tx-nature-label'}>{nature.label}</span>
                        </td>
                      ) : null}
                      {visibleCols.sale ? (
                        <td>{tx.saleId ? formatSaleIdShort(tx.saleId) : '—'}</td>
                      ) : null}
                      {visibleCols.bank ? (
                        <td title={tx.bankAccount || resolveTxBankAccount(tx) || undefined}>
                          {tx.bankAccount || resolveTxBankAccount(tx) || '—'}
                        </td>
                      ) : null}
                      {visibleCols.type ? <td>{typeLabel}</td> : null}
                      {visibleCols.method ? <td>{methodLabel}</td> : null}
                      {visibleCols.gross ? (
                        <td className={`finance-num finance-data ${dir === 'out' ? 'finance-amount-negative' : 'finance-amount-positive'}`}>{grossFmt}</td>
                      ) : null}
                      {visibleCols.fee ? <td className="finance-num finance-data">{feeFmt}</td> : null}
                      <td className={`finance-num finance-data ${dir === 'out' ? 'finance-amount-negative' : 'finance-amount-positive'}`}>{netFmt}</td>
                      <td>{statusBadge}</td>
                      <td
                        className="finance-num finance-tx-row-actions-cell"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <FinanceTxRowActions
                          txId={tx.id}
                          status={st}
                          direction={dir}
                          canManageAdvanced={canManageAdvanced}
                          canAssignBank={canAssignBankOnTx(tx)}
                          showRecMenu={showRecMenu}
                          rowBusy={rowBusy}
                          menuOpen={menuOpenId}
                          onMenuOpenChange={setMenuOpenId}
                          onEdit={() => {
                            closeTxDetail();
                            openEditModal(tx);
                          }}
                          onSettle={() => void settle(tx.id)}
                          onCancel={() => requestCancelTx(tx.id)}
                          onReverse={() => requestReverseTx(tx.id)}
                          onAssignBank={() => openAssignBankModal(tx)}
                          onEditRecurrence={() => openEditRecurrenceModal(tx)}
                          onCancelRecurrence={() => requestCancelRecurrence(tx.id)}
                          recurrenceCancelLoading={recurrenceCancelLoadingId === tx.id}
                          reverseLoading={reverseLoadingId === tx.id}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            )}
            </>
            )}
          </div>
          {!loadError && transactions.length > 0 ? (
            <div className="finance-tx-pagination">
              <p className="text-small text-muted finance-tx-pagination__meta" role="status">
                {hasActiveTxFilters
                  ? `${filteredTransactions.length} resultado(s) nos ${transactions.length} lançamentos carregados`
                  : `${transactions.length} lançamento${transactions.length === 1 ? '' : 's'} carregado${transactions.length === 1 ? '' : 's'}`}
                {listTotal != null ? ` · ${listTotal} no período` : ''}
                {hasActiveTxFilters && hasMore
                  ? ' — carregue mais para ampliar a busca com os filtros ativos'
                  : ''}
              </p>
              {hasMore ? (
                <button
                  type="button"
                  className="btn-outline finance-tx-pagination__btn"
                  onClick={loadMoreTransactions}
                  disabled={loadingMore || txLoading}
                  aria-busy={loadingMore}
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              ) : (
                <p className="text-small text-muted">Todos os lançamentos do período foram carregados.</p>
              )}
            </div>
          ) : null}
          {!loadError && hasActiveTxFilters && filteredTransactions.length === 0 && transactions.length > 0 ? (
            <p className="text-small text-muted finance-tx-pagination__filter-empty">
              Nenhum resultado nos lançamentos já carregados.
              {hasMore ? ' Use “Carregar mais” para buscar no restante do período.' : ' Ajuste os filtros ou limpe a busca.'}
            </p>
          ) : null}
        </div>
      </FinanceTabShell>

      <ModalShell
        open={showTxModal}
        title={getTxModalTitle({ editingRecurrenceOnly, editingTxId, direction: txForm.direction })}
        onClose={requestCloseTxModal}
        closeOnEsc
        maxWidth={520}
        dialogClassName="finance-tx-modal"
        ariaLabelledBy="finance-tx-modal-title"
        ariaDescribedBy={
          !editingTxId || (editingTxId && !editingRecurrenceOnly) ? 'finance-tx-modal-desc' : undefined
        }
        footer={
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-outline" disabled={savingTx} onClick={requestCloseTxModal}>
              Cancelar
            </button>
            <button
              type="submit"
              form={FINANCE_TX_FORM_ID}
              className="btn-primary"
              disabled={savingTx}
            >
              {getTxModalSaveLabel({ savingTx, editingRecurrenceOnly, editingTxId, receiveNow })}
            </button>
          </div>
        }
      >
        {!editingTxId && !editingRecurrenceOnly ? (
          <p id="finance-tx-modal-desc" className="finance-tx-modal__intro">
            {getTxModalIntro(txForm.direction)}
          </p>
        ) : null}
        {editingTxId && !editingRecurrenceOnly ? (
          <p id="finance-tx-modal-desc" className="finance-tx-modal__hint">
            Só é possível editar enquanto o lançamento estiver pendente. Valores liquidados no razão não são
            alterados automaticamente.
          </p>
        ) : null}
        <form
          id={FINANCE_TX_FORM_ID}
          className="flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveManualTx();
          }}
        >
              {!editingRecurrenceOnly ? (
              <>
              <FinanceTxDirectionToggle
                value={txForm.direction}
                onChange={handleTxDirectionChange}
                disabled={Boolean(editingTxId)}
                showOut={canManageAdvanced}
              />
              <div className="form-group">
                <label htmlFor="finance-tx-category">Categoria</label>
                <SearchableGroupedSelect
                  id="finance-tx-category"
                  value={txForm.category}
                  groups={categoryOptionGroups}
                  getOptionValue={(c) => c.value || c.label}
                  getOptionLabel={(c) => c.label}
                  getOptionTitle={(c) => c.title || ''}
                  placeholder="Digite para buscar categoria…"
                  hint="Aporte, empréstimo e transferência não entram no faturamento operacional."
                  hintId="finance-tx-category-hint"
                  emptyMessage="Nenhuma categoria encontrada para essa busca."
                  aria-invalid={txFormErrors.category ? 'true' : undefined}
                  aria-describedby={
                    txFormErrors.category ? 'finance-tx-category-error finance-tx-category-hint' : 'finance-tx-category-hint'
                  }
                  onChange={applyTxCategory}
                />
                <FieldError id="finance-tx-category-error">{txFormErrors.category}</FieldError>
                {visibleCategorySuggestion ? (
                  <FinanceCategorySuggestionChip
                    category={visibleCategorySuggestion.category}
                    confidence={visibleCategorySuggestion.confidence}
                    onApply={() => applyTxCategory(visibleCategorySuggestion.category)}
                  />
                ) : null}
              </div>
              {resolveFinanceCategory(txForm.category, chartAccounts)?.type === 'plan' ? (
                <div className="form-group">
                  <label htmlFor="finance-tx-plan">Plano</label>
                  <PlanSelect
                    id="finance-tx-plan"
                    financeConfig={financeConfig}
                    value={txForm.planName}
                    emptyLabel="Digite para buscar plano…"
                    showConfigHint={false}
                    aria-invalid={txFormErrors.planName ? 'true' : undefined}
                    aria-describedby={txFormErrors.planName ? 'finance-tx-plan-error' : undefined}
                    onChange={(name) => {
                      setTxForm((prev) => ({ ...prev, planName: name }));
                      clearTxFieldError('planName');
                      if (name) clearTxFieldError('gross');
                    }}
                    onPlanPick={(plan) => {
                      const amount = plan ? planPriceToPayAmountString(plan) : '';
                      setTxForm((prev) => ({
                        ...prev,
                        gross: amount || prev.gross,
                      }));
                    }}
                  />
                  <FieldError id="finance-tx-plan-error">{txFormErrors.planName}</FieldError>
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="finance-tx-description">
                    Descrição <span className="text-danger">*</span>
                  </label>
                  <input
                    id="finance-tx-description"
                    className="form-input"
                    type="text"
                    maxLength={200}
                    required
                    aria-required="true"
                    placeholder="Ex.: Salário Hugo, Compra de frutas"
                    value={txForm.planName}
                    aria-invalid={txFormErrors.planName ? 'true' : undefined}
                    aria-describedby={txFormErrors.planName ? 'finance-tx-description-error' : undefined}
                    onChange={(e) => {
                      setTxForm((prev) => ({ ...prev, planName: e.target.value }));
                      clearTxFieldError('planName');
                    }}
                  />
                  <FieldError id="finance-tx-description-error">{txFormErrors.planName}</FieldError>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="finance-tx-gross">Valor (R$)</label>
                <input
                  id="finance-tx-gross"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  aria-invalid={txFormErrors.gross ? 'true' : undefined}
                  aria-describedby={txFormErrors.gross ? 'finance-tx-gross-error' : undefined}
                  value={
                    txForm.gross === '' || txForm.gross === null || txForm.gross === undefined
                      ? ''
                      : maskCurrency(String(Math.round(Number(txForm.gross) * 100)))
                  }
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '');
                    if (!d) {
                      setTxForm((f) => ({ ...f, gross: '' }));
                      clearTxFieldError('gross');
                      return;
                    }
                    const n = parseInt(d, 10) / 100;
                    setTxForm((f) => ({ ...f, gross: n }));
                    clearTxFieldError('gross');
                  }}
                />
                <FieldError id="finance-tx-gross-error">{txFormErrors.gross}</FieldError>
              </div>
              {!editingTxId ? (
                <label className="flex items-center gap-2 text-small finance-tx-modal__checkbox">
                  <input
                    type="checkbox"
                    checked={receiveNow}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setReceiveNow(checked);
                      if (
                        !checked &&
                        txForm.direction === 'out' &&
                        !editingTxId
                      ) {
                        setTxForm((prev) => {
                          const cm = competenceMonthFromDueDate(prev.due_date);
                          return cm ? { ...prev, competence_month: cm } : prev;
                        });
                      }
                    }}
                  />
                  {txForm.direction === 'out' ? 'Pago agora (já liquidado)' : 'Recebido agora (já liquidado no caixa)'}
                </label>
              ) : null}
              {txForm.direction === 'out' && (!receiveNow || editingTxId) ? (
                <div className="form-group">
                  <label htmlFor="finance-tx-due">Vencimento</label>
                  <input
                    id="finance-tx-due"
                    type="date"
                    className="form-input"
                    value={String(txForm.due_date || '').slice(0, 10)}
                    aria-invalid={txFormErrors.due_date ? 'true' : undefined}
                    aria-describedby={txFormErrors.due_date ? 'finance-tx-due-error' : undefined}
                    onChange={(e) => {
                      const due = e.target.value;
                      setTxForm((prev) => {
                        const next = { ...prev, due_date: due };
                        if (
                          shouldSyncCompetenceFromDueDate({
                            direction: prev.direction,
                            receiveNow,
                            editingTxId,
                          })
                        ) {
                          const cm = competenceMonthFromDueDate(due);
                          if (cm) next.competence_month = cm;
                        }
                        return next;
                      });
                      clearTxFieldError('due_date');
                    }}
                  />
                  <FieldError id="finance-tx-due-error">{txFormErrors.due_date}</FieldError>
                </div>
              ) : null}
              <FinanceTxFormSection
                id="finance-tx-payment"
                title="Pagamento"
                open={txPaymentSectionOpen}
                onToggle={() => setTxPaymentSectionOpen((o) => !o)}
              >
                {txForm.direction !== 'out' ? (
                  <div className="form-group">
                    <label htmlFor="finance-tx-fee">Taxa (%)</label>
                    <input
                      id="finance-tx-fee"
                      className="form-input"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0"
                      value={txForm.fee}
                      onChange={(e) => setTxForm({ ...txForm, fee: e.target.value })}
                    />
                  </div>
                ) : null}
                {bankAccountLabels.length > 0 ? (
                  <>
                    <BankAccountSelect
                      academyId={academyId}
                      financeConfig={financeConfig}
                      id="finance-tx-bank-account"
                      label="Conta bancária"
                      required
                      value={txForm.bankAccount || ''}
                      onChange={(v) => {
                        setTxForm((f) => ({ ...f, bankAccount: v }));
                        clearTxFieldError('bankAccount');
                      }}
                    />
                    <FieldError id="finance-tx-bank-account-error">{txFormErrors.bankAccount}</FieldError>
                  </>
                ) : null}
                <div className="form-group">
                  <label htmlFor="finance-tx-method">Método</label>
                  <select
                    id="finance-tx-method"
                    className="form-input"
                    value={txForm.method}
                    onChange={(e) => {
                      const m = e.target.value;
                      setTxForm({
                        ...txForm,
                        method: m,
                        installments: isStorageCreditMethod(m) ? (txForm.installments || 1) : 1,
                        bankAccount: accountWhenPaymentMethodChanges(financeConfig, m) || txForm.bankAccount,
                      });
                    }}
                  >
                    {activePaymentMethodOptions.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                {isStorageCreditMethod(txForm.method) ? (
                  <div className="form-group">
                    <label htmlFor="finance-tx-installments">Parcelas</label>
                    <select
                      id="finance-tx-installments"
                      className="form-input"
                      value={String(txForm.installments || 1)}
                      onChange={(e) => setTxForm({ ...txForm, installments: Number(e.target.value) || 1 })}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={String(n)}>{n}x</option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </FinanceTxFormSection>
              <FinanceTxFormSection
                id="finance-tx-optional"
                title="Detalhes opcionais"
                open={txOptionalSectionOpen}
                onToggle={() => setTxOptionalSectionOpen((o) => !o)}
              >
                {showStudentField ? (
                  <FinanceTxStudentField
                    academyId={academyId}
                    value={studentDisplayName}
                    leadId={txForm.lead_id}
                    disabled={Boolean(editingTxId) && !editingRecurrenceOnly}
                    onChange={({ lead_id, name }) => {
                      setTxForm((f) => ({ ...f, lead_id: lead_id || '' }));
                      setStudentDisplayName(name || '');
                    }}
                  />
                ) : null}
                <div className="form-group">
                  <label htmlFor="finance-tx-competence-month">Mês de competência</label>
                  <DateInputField
                    id="finance-tx-competence-month"
                    type="month"
                    className="form-input"
                    disabled={competenceSynced}
                    aria-describedby={competenceSynced ? 'finance-tx-competence-hint' : undefined}
                    value={txForm.competence_month || currentCompetenceMonth()}
                    onChange={(e) => setTxForm({ ...txForm, competence_month: e.target.value })}
                  />
                  {competenceSynced ? (
                    <p id="finance-tx-competence-hint" className="finance-tx-modal__field-hint">
                      Competência acompanha o mês do vencimento.
                    </p>
                  ) : null}
                </div>
                <div className="form-group">
                  <label htmlFor="finance-tx-note">Observação</label>
                  <textarea
                    id="finance-tx-note"
                    className="form-input"
                    rows={3}
                    value={txForm.note}
                    onChange={(e) => setTxForm({ ...txForm, note: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                {!editingTxId ? (
                  <div className="finance-tx-recurrence-group">
                    <button
                      id="finance-tx-recurrence-toggle"
                      type="button"
                      className="btn-ghost finance-tx-recurrence-toggle"
                      aria-expanded={recurrenceOpen}
                      aria-controls="finance-tx-recurrence-panel"
                      onClick={() => setRecurrenceOpen((o) => !o)}
                    >
                      <span>Repetir lançamento</span>
                      <ChevronDown
                        size={18}
                        aria-hidden
                        className={`finance-tx-recurrence-toggle__icon${recurrenceOpen ? ' finance-tx-recurrence-toggle__icon--open' : ''}`}
                      />
                    </button>
                    <FieldError id="finance-tx-recurrence-error">{txFormErrors.recurrence}</FieldError>
                    {recurrenceOpen ? (
                      <div id="finance-tx-recurrence-panel" className="flex-col gap-3 finance-tx-recurrence-body">
                        <label className="flex items-center gap-2 text-small finance-tx-modal__checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(txForm.repeat_enabled)}
                            onChange={(e) => {
                              setTxForm((f) => ({
                                ...f,
                                repeat_enabled: e.target.checked,
                                recurrence_type: f.recurrence_type || RECURRENCE_TYPES.MONTHLY,
                                recurrence_day: f.recurrence_day || 1,
                              }));
                              if (e.target.checked) clearTxFieldError('recurrence');
                            }}
                          />
                          Repetir automaticamente
                        </label>
                        {txForm.repeat_enabled ? (
                          <>
                            <div className="form-group">
                              <label>Frequência</label>
                              <select
                                className="form-input"
                                value={txForm.recurrence_type || RECURRENCE_TYPES.MONTHLY}
                                onChange={(e) => {
                                  const recurrence_type = e.target.value;
                                  setTxForm((f) => ({
                                    ...f,
                                    recurrence_type,
                                    recurrence_day: normalizeRecurrenceDay(recurrence_type, f.recurrence_day),
                                  }));
                                }}
                              >
                                <option value={RECURRENCE_TYPES.MONTHLY}>Mensal</option>
                                <option value={RECURRENCE_TYPES.WEEKLY}>Semanal</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label>
                                {txForm.recurrence_type === RECURRENCE_TYPES.WEEKLY ? 'Dia da semana' : 'Dia do mês (1–28)'}
                              </label>
                              {txForm.recurrence_type === RECURRENCE_TYPES.WEEKLY ? (
                                <select
                                  className="form-input"
                                  value={String(txForm.recurrence_day ?? 1)}
                                  onChange={(e) =>
                                    setTxForm((f) => ({ ...f, recurrence_day: Number(e.target.value) }))
                                  }
                                >
                                  {WEEKDAY_OPTIONS.map((w) => (
                                    <option key={w.value} value={w.value}>
                                      {w.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="number"
                                  className="form-input"
                                  min={1}
                                  max={28}
                                  value={txForm.recurrence_day ?? 1}
                                  onChange={(e) =>
                                    setTxForm((f) => ({
                                      ...f,
                                      recurrence_day: normalizeRecurrenceDay(RECURRENCE_TYPES.MONTHLY, e.target.value),
                                    }))
                                  }
                                />
                              )}
                            </div>
                            <div className="form-group">
                              <label>Até (opcional)</label>
                              <select
                                className="form-input"
                                value={txForm.recurrence_end || ''}
                                onChange={(e) => setTxForm((f) => ({ ...f, recurrence_end: e.target.value }))}
                              >
                                {recurrenceEndOptions.map((o) => (
                                  <option key={o.value || 'none'} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </FinanceTxFormSection>
              </>
              ) : null}
              {editingRecurrenceOnly ? (
                <div className={`form-group finance-tx-recurrence-group${editingRecurrenceOnly ? ' finance-tx-recurrence-group--editing-only' : ''}`}>
                  <button
                    id="finance-tx-recurrence-toggle"
                    type="button"
                    className="btn-ghost finance-tx-recurrence-toggle"
                    aria-expanded={recurrenceOpen}
                    aria-controls="finance-tx-recurrence-panel"
                    onClick={() => setRecurrenceOpen((o) => !o)}
                  >
                    <span>Repetir lançamento</span>
                    <ChevronDown
                      size={18}
                      aria-hidden
                      className={`finance-tx-recurrence-toggle__icon${recurrenceOpen ? ' finance-tx-recurrence-toggle__icon--open' : ''}`}
                    />
                  </button>
                  <FieldError id="finance-tx-recurrence-error">{txFormErrors.recurrence}</FieldError>
                  {recurrenceOpen ? (
                    <div id="finance-tx-recurrence-panel" className="flex-col gap-3 finance-tx-recurrence-body">
                      <label className="flex items-center gap-2 text-small finance-tx-modal__checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(txForm.repeat_enabled)}
                          onChange={(e) => {
                            setTxForm((f) => ({
                              ...f,
                              repeat_enabled: e.target.checked,
                              recurrence_type: f.recurrence_type || RECURRENCE_TYPES.MONTHLY,
                              recurrence_day: f.recurrence_day || 1,
                            }));
                            if (e.target.checked) clearTxFieldError('recurrence');
                          }}
                        />
                        Repetir automaticamente
                      </label>
                      {txForm.repeat_enabled ? (
                        <>
                          <div className="form-group">
                            <label>Frequência</label>
                            <select
                              className="form-input"
                              value={txForm.recurrence_type || RECURRENCE_TYPES.MONTHLY}
                              onChange={(e) => {
                                const recurrence_type = e.target.value;
                                setTxForm((f) => ({
                                  ...f,
                                  recurrence_type,
                                  recurrence_day: normalizeRecurrenceDay(recurrence_type, f.recurrence_day),
                                }));
                              }}
                            >
                              <option value={RECURRENCE_TYPES.MONTHLY}>Mensal</option>
                              <option value={RECURRENCE_TYPES.WEEKLY}>Semanal</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label>
                              {txForm.recurrence_type === RECURRENCE_TYPES.WEEKLY ? 'Dia da semana' : 'Dia do mês (1–28)'}
                            </label>
                            {txForm.recurrence_type === RECURRENCE_TYPES.WEEKLY ? (
                              <select
                                className="form-input"
                                value={String(txForm.recurrence_day ?? 1)}
                                onChange={(e) =>
                                  setTxForm((f) => ({ ...f, recurrence_day: Number(e.target.value) }))
                                }
                              >
                                {WEEKDAY_OPTIONS.map((w) => (
                                  <option key={w.value} value={w.value}>
                                    {w.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="number"
                                className="form-input"
                                min={1}
                                max={28}
                                value={txForm.recurrence_day ?? 1}
                                onChange={(e) =>
                                  setTxForm((f) => ({
                                    ...f,
                                    recurrence_day: normalizeRecurrenceDay(RECURRENCE_TYPES.MONTHLY, e.target.value),
                                  }))
                                }
                              />
                            )}
                          </div>
                          <div className="form-group">
                            <label>Até (opcional)</label>
                            <select
                              className="form-input"
                              value={txForm.recurrence_end || ''}
                              onChange={(e) => setTxForm((f) => ({ ...f, recurrence_end: e.target.value }))}
                            >
                              {recurrenceEndOptions.map((o) => (
                                <option key={o.value || 'none'} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
        </form>
      </ModalShell>

      <ModalShell
        open={Boolean(assignBankTx)}
        title="Atribuir conta bancária"
        onClose={closeAssignBankModal}
        maxWidth={440}
        footer={
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-outline" disabled={assignBankSaving} onClick={closeAssignBankModal}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" disabled={assignBankSaving} onClick={() => void saveAssignBank()}>
              {assignBankSaving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <p className="text-small text-muted mb-3">
          Ajusta apenas a conta do lançamento liquidado. Valores e datas não são alterados.
        </p>
        {assignBankTx ? (
          <p className="text-small mb-3">
            <strong>{formatTxDateStr(txTemporalIso(assignBankTx))}</strong>
            {' · '}
            {formatSignedMoney(displayGross(assignBankTx), txDirection(assignBankTx))}
            {assignBankTx.planName ? ` · ${assignBankTx.planName}` : ''}
          </p>
        ) : null}
        {bankAccountLabels.length > 0 ? (
          <BankAccountSelect
            academyId={academyId}
            financeConfig={financeConfig}
            id="finance-tx-assign-bank-account"
            label="Conta bancária"
            required
            value={assignBankAccount || ''}
            onChange={setAssignBankAccount}
          />
        ) : (
          <p className="text-small text-muted" role="alert">
            Cadastre contas em Minha academia → Financeiro antes de atribuir.
          </p>
        )}
      </ModalShell>

      {detailTx ? (
        <FinanceTxDetailDrawer
          tx={transactions.find((t) => String(t.id) === String(detailTx.id)) || detailTx}
          academyId={academyId}
          journalEntries={journalEntries}
          leadNameById={leadNameById}
          chartAccounts={chartAccounts}
          canManageAdvanced={canManageAdvanced}
          canAssignBankOnTx={canAssignBankOnTx}
          rowBusy={
            cancelLoadingId === detailTx.id ||
            recurrenceCancelLoadingId === detailTx.id ||
            reverseLoadingId === detailTx.id ||
            (assignBankSaving && assignBankTx?.id === detailTx.id)
          }
          menuOpenId={menuOpenId}
          onMenuOpenChange={setMenuOpenId}
          onClose={closeTxDetail}
          onEdit={() => {
            closeTxDetail();
            openEditModal(detailTx);
          }}
          onSettle={() => void settle(detailTx.id)}
          onCancel={() => requestCancelTx(detailTx.id)}
          onReverse={() => requestReverseTx(detailTx.id)}
          onAssignBank={() => openAssignBankModal(detailTx)}
          onEditRecurrence={() => openEditRecurrenceModal(detailTx)}
          onCancelRecurrence={() => requestCancelRecurrence(detailTx.id)}
          recurrenceCancelLoadingId={recurrenceCancelLoadingId}
          reverseLoadingId={reverseLoadingId}
          anticipationTx={anticipationByParentId.get(String(detailTx.id)) || null}
          onAnticipate={(tx) => setAnticipateTarget(tx)}
        />
      ) : null}

      <FinanceTxAnticipationDialog
        open={Boolean(anticipateTarget)}
        tx={anticipateTarget}
        financeConfig={financeConfig}
        saving={anticipateSaving}
        onClose={() => !anticipateSaving && setAnticipateTarget(null)}
        onConfirm={({ feeAmount }) => {
          setPendingAnticipation({ tx: anticipateTarget, feeAmount });
          setAnticipateTarget(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingAnticipation)}
        title="Confirmar antecipação"
        description={
          pendingAnticipation
            ? `Será criada uma despesa de taxa de antecipação de ${Number(pendingAnticipation.feeAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} vinculada a este recebimento. Deseja continuar?`
            : ''
        }
        confirmLabel="Registrar antecipação"
        onConfirm={() => {
          if (!pendingAnticipation) return;
          void confirmAnticipation(pendingAnticipation);
        }}
        onClose={() => !anticipateSaving && setPendingAnticipation(null)}
      />

      <ConfirmDialog
        open={showDiscardTxModal}
        title="Descartar alterações?"
        description="As informações preenchidas serão perdidas."
        confirmLabel="Descartar"
        confirmVariant="danger"
        onConfirm={() => resetTxModal()}
        onClose={() => setShowDiscardTxModal(false)}
      />

      <ConfirmDialog
        open={showCancelTxDialog}
        title="Cancelar lançamento"
        description="Este lançamento será cancelado e não poderá ser revertido. Confirmar?"
        confirmLabel="Confirmar"
        confirmVariant="danger"
        loading={Boolean(cancelLoadingId)}
        onConfirm={() => void cancelTx(pendingCancelId)}
        onClose={() => {
          if (!cancelLoadingId) {
            setShowCancelTxDialog(false);
            setPendingCancelId('');
          }
        }}
      />

      <ConfirmDialog
        open={showReverseTxDialog}
        title="Estornar lançamento liquidado"
        description="O lançamento original será cancelado e um novo lançamento de estorno será registrado no caixa, com efeito contábil oposto. Esta ação é para gestores. Confirmar?"
        confirmLabel="Estornar"
        confirmVariant="danger"
        loading={Boolean(reverseLoadingId)}
        onConfirm={() => void reverseTx(pendingReverseId)}
        onClose={() => {
          if (!reverseLoadingId) {
            setShowReverseTxDialog(false);
            setPendingReverseId('');
          }
        }}
      />

      <ConfirmDialog
        open={showCancelRecDialog}
        title="Cancelar recorrência"
        description="Os próximos lançamentos desta recorrência não serão gerados. Confirmar?"
        confirmLabel="Confirmar"
        confirmVariant="danger"
        loading={Boolean(recurrenceCancelLoadingId)}
        onConfirm={() => void cancelRecurrence(pendingCancelRecId)}
        onClose={() => {
          if (!recurrenceCancelLoadingId) {
            setShowCancelRecDialog(false);
            setPendingCancelRecId('');
          }
        }}
      />
      <ImportFinanceTxModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        academyId={academyId}
        onImported={({ ok, fail }) => {
          toast.show({
            type: fail ? 'warning' : 'success',
            message:
              fail > 0
                ? `${ok} lançamento(s) importado(s), ${fail} falha(s).`
                : `${ok} lançamento(s) importado(s) com sucesso.`,
          });
          if (typeof onTxMutated === 'function') onTxMutated();
          window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
          void loadTransactions();
        }}
      />
    </>
  );
}

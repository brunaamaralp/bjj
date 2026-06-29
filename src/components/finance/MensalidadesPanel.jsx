import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ModalShell from '../shared/ModalShell.jsx';
import PaymentFormErrorBanner from '../shared/PaymentFormErrorBanner.jsx';
import PaymentModalFooterHint from '../shared/PaymentModalFooterHint.jsx';
import { useLeadStore, LEAD_STATUS } from '../../store/useLeadStore';
import { useToast } from '../../hooks/useToast';
import { account } from '../../lib/appwrite';
import { reverseFinanceTx } from '../../lib/financeTxApi.js';
import { getMonthlyPayments, createPayment, updatePayment, PAYMENT_CATEGORY } from '../../lib/studentPayments';
import { BUNDLE_DURATION_OPTIONS } from '../../lib/paymentCategories.js';
import { bundlePlanShortLabel } from '../../lib/bundleCoverage.js';
import { findPlanByName, planPriceToPayAmountString } from '../../lib/academyPlans.js';
import { loadMergedFinanceConfigForAcademy } from '../../lib/prefetchFinanceConfig.js';
import { resolveGridDisplayStatus } from '../../lib/paymentStatus';
import MonthlyPaymentGrid from './MonthlyPaymentGrid.jsx';
import PaymentExceptionsView from './PaymentExceptionsView.jsx';
import { maskCurrency, parseCurrencyBRL } from '../../lib/masks';
import useDebounce from '../../hooks/useDebounce';
import { friendlyError, studentPaymentFriendlyError } from '../../lib/errorMessages';
import { AlertCircle, Calendar, CalendarClock, Check, ChevronDown, CheckCircle2, Download } from 'lucide-react';
import PageHeader from '../layout/PageHeader.jsx';
import MensalidadesListTable from './MensalidadesListTable.jsx';
import { isRealPaymentException } from '../../lib/paymentExceptions.js';
import MensalidadesStatusFilter from './MensalidadesStatusFilter.jsx';
import {
  isStorageCreditMethod,
  MENSALIDADES_CREDIT_METHOD,
  normalizeMensalidadesInstallments,
  validateMensalidadesPaymentForm,
  focusFirstMensalidadesPaymentError,
  MENSALIDADES_PAY_FIELD_IDS,
} from '../../lib/mensalidadesPaymentForm.js';
import {
  storageDialectMethodLabelsMap,
} from '../../lib/paymentMethods.js';
import { orderedActiveStorageDialectMethodsForModal } from '../../lib/paymentMethodSettings.js';
import { formatBRL } from '../../lib/moneyBr.js';
import {
  buildReceivablesPath,
  RECEIVABLES_SECTIONS,
} from '../../lib/financeiroReceivablesSections.js';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import FieldError from '../shared/FieldError.jsx';
import './finance.css';
import { useUserRole } from '../../lib/useUserRole.js';
import { useNlPageContext } from '../../hooks/useNlPageContext.js';
import { NL_PAYMENT_PREFILL_EVENT } from '../../lib/nlCorrect.js';
import { DateInput } from '../DateInput';
import { useTerms } from '../../lib/terminology.js';
import { isActiveStudent } from '../../lib/studentStatus.js';
import { useStudentStore } from '../../store/useStudentStore';
import { ensureAllStudentsLoaded } from '../../lib/ensureAllStudentsLoaded.js';
import {
  resolveCollectionStage,
  readCollectionSettingsFromFinanceConfig,
} from '../../lib/collectionRules.js';
import { getPaymentRowStatus, getReceptionDueBucket, openAmountForStudent } from '../../lib/collectionOverdue.js';
import {
  hasConfiguredBankAccounts,
} from '../../lib/bankAccounts.js';
import {
  pickInitialBankAccountForPayment,
  accountWhenPaymentMethodChanges,
} from '../../lib/paymentMethodBankDefaults.js';
import {
  resolveCaptureFieldsForPayment,
  whenCaptureMethodChanges,
  whenPaymentMethodChangesWithCapture,
} from '../../lib/captureMethodPaymentForm.js';
import CaptureMethodSelect from './CaptureMethodSelect.jsx';
import CardBrandSelect from './CardBrandSelect.jsx';
import { EMPRESA_FINANCE_ACCOUNTS_PATH } from '../../lib/financeiroHubTabs.js';
import BankAccountSelect from './BankAccountSelect.jsx';
import { useAcademyTurmas } from '../../hooks/useAcademyTurmas.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import FinanceBankAccountsSetupBanner from './FinanceBankAccountsSetupBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import { buildBankReconReturnPath } from '../../lib/bankReconPaymentHintLink.js';
import SearchField from '../shared/SearchField.jsx';
import HubTabBar from '../shared/HubTabBar.jsx';
import FinanceFiltersBar, { FinanceToolbarSelect } from './FinanceFiltersBar.jsx';
import CompactStatusFilter from '../shared/CompactStatusFilter.jsx';
import {
  buildMensalidadesGridRows,
  filterSortMensalidadesRows,
  exportMensalidadesGridCsv,
} from '../../lib/mensalidadesExport.js';
import {
  buildMensalidadesFilterCounts,
  matchesMensalidadesStatusFilter,
  matchesMensalidadesStudentFilters,
  parseMensalidadesFiltroParam,
} from '../../lib/mensalidadesFilters.js';
import {
  buildExceptionStatusFilterOptions,
  listExceptionRows,
  readExceptionStatusLabels,
  studentTurma,
} from '../../lib/paymentExceptions.js';
import { formatPaymentDateLabel, isPaymentDateInFuture } from '../../lib/validations.js';
import {
  suggestPaidAtYmd,
  paidAtMonthDivergesFromCoverage,
  paidAtCoverageDivergenceConfirmDescription,
} from '../../lib/paymentReceiptDate.js';
import PaymentReceiptDateBanner from './PaymentReceiptDateBanner.jsx';
import { computeMensalidadesMonthKpis } from '../../lib/financeiroOverview.js';
import CashTrocoFields from './CashTrocoFields.jsx';
import { isCashPaymentMethod, trocoFieldsForPaymentPayload } from '../../lib/studentPaymentTroco.js';
import { isStudentOnExemptPlan } from '../../lib/planBilling.js';

const METHOD_LABELS = storageDialectMethodLabelsMap();

const PAY_METHOD_MODAL_ICONS = {
  pix: 'ti-qrcode',
  dinheiro: 'ti-cash',
  cartão_débito: 'ti-credit-card',
  cartão_crédito: 'ti-credit-card',
  transferência: 'ti-building-bank',
};

function orderedPayMethodsForModal(financeConfig) {
  return orderedActiveStorageDialectMethodsForModal(financeConfig);
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function parseYmdLocal(ymd) {
  if (!ymd) return null;
  const s = String(ymd).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return new Date(`${iso[1]}T12:00:00`);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00`);
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}

function studentDueDay(student) {
  const n = Number(student?.dueDay);
  if (Number.isFinite(n) && n >= 1 && n <= 31) return Math.trunc(n);
  return null;
}

function dueDateInMonth(currentMonth, dayOfMonth) {
  if (!dayOfMonth || !currentMonth) return null;
  const d = new Date(`${currentMonth}-${String(dayOfMonth).padStart(2, '0')}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @returns {{ status: 'paid'|'pending'|'soon'|'none', dueDate: Date|null, paidAt: Date|null }} */
function getRowStatus(student, payment, currentMonth, financeConfig) {
  if (isStudentOnExemptPlan(student, financeConfig, payment)) {
    return { status: 'exempt', dueDate: null, paidAt: null };
  }
  const today0 = startOfLocalDay(new Date());

  if (payment && payment.status === 'paid') {
    const paidAt = payment.paid_at ? parseYmdLocal(String(payment.paid_at).slice(0, 10)) : null;
    return { status: 'paid', dueDate: null, paidAt };
  }

  if (payment && payment.status === 'pending') {
    const dueRaw = payment.due_date ? parseYmdLocal(String(payment.due_date).slice(0, 10)) : null;
    if (dueRaw && startOfLocalDay(dueRaw) < today0) {
      return { status: 'pending', dueDate: dueRaw, paidAt: null };
    }
    return { status: 'soon', dueDate: dueRaw, paidAt: null };
  }

  const day = studentDueDay(student);
  const defaultDue = dueDateInMonth(currentMonth, day);
  if (defaultDue) {
    const due0 = startOfLocalDay(defaultDue);
    if (due0 < today0) return { status: 'pending', dueDate: defaultDue, paidAt: null };
    const daysUntil = Math.ceil((due0 - today0) / 86400000);
    if (daysUntil >= 0 && daysUntil <= 7) return { status: 'soon', dueDate: defaultDue, paidAt: null };
  }
  return { status: 'none', dueDate: defaultDue || null, paidAt: null };
}

function formatDdMm(d) {
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatMonthTitle(ym) {
  try {
    return new Date(`${ym}-02T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch {
    return ym;
  }
}

function formatMonthTitleCapitalized(ym) {
  const raw = formatMonthTitle(ym);
  const s = String(raw || '').trim();
  if (!s) return ym;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Conteúdo de mensalidades (grade, lista, pendências, régua).
 * @param {{ embedded?: boolean, sectionMode?: boolean, referenceMonth?: string, onReferenceMonthChange?: (ym: string) => void }} props
 */
export default function MensalidadesPanel({
  embedded = false,
  sectionMode = false,
  referenceMonth: referenceMonthProp,
  onReferenceMonthChange,
}) {
  const allStudents = useStudentStore((s) => s.students);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const storeTeamId = useLeadStore((s) => s.teamId);
  const userId = useLeadStore((s) => s.userId);
  const updateStudent = useStudentStore((s) => s.updateStudent);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const modules = useLeadStore((s) => s.modules);
  const toast = useToast();
  const terms = useTerms();
  const { turmas: configuredTurmas } = useAcademyTurmas(academyId);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const reconStatementId = String(searchParams.get('recon_statement') || '').trim();

  const [currentMonth, setCurrentMonth] = useState(
    () => String(referenceMonthProp || '').trim() || new Date().toISOString().slice(0, 7)
  );

  useEffect(() => {
    const ext = String(referenceMonthProp || '').trim();
    if (!ext) return;
    setCurrentMonth((cur) => (cur === ext ? cur : ext));
  }, [referenceMonthProp]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(false);
  const [studentsBootstrapDone, setStudentsBootstrapDone] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);

  useEffect(() => {
    const q = searchParams.get('search');
    setSearch(q || '');
    const filtroParam = searchParams.get('filtro') || searchParams.get('filter');
    setFilter(parseMensalidadesFiltroParam(filtroParam));
  }, [searchParams]);
  const [dueSortOrder, setDueSortOrder] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [payForm, setPayForm] = useState({});
  const [payFormErrors, setPayFormErrors] = useState({});
  const [paymentFormError, setPaymentFormError] = useState('');
  const [futurePaidDateLabel, setFuturePaidDateLabel] = useState(null);
  const [paidAtDivergenceConfirm, setPaidAtDivergenceConfirm] = useState(null);
  const skipFuturePaidDateRef = useRef(false);
  const skipPaidAtDivergenceRef = useRef(false);
  const paidAtTouchedRef = useRef(false);
  const [sessionUserName, setSessionUserName] = useState('Usuário');
  const [viewMode, setViewMode] = useState('list');
  const [turmaFilter, setTurmaFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [gridSortBy, setGridSortBy] = useState('name');
  const [exStatusFilter, setExStatusFilter] = useState('all');
  const [exTurmaFilter, setExTurmaFilter] = useState('all');
  const [exPlatformFilter, setExPlatformFilter] = useState('all');
  const [exOnlyWithDiff, setExOnlyWithDiff] = useState(false);
  const [exSortBy, setExSortBy] = useState('difference');
  const [estornoCaixaWarning, setEstornoCaixaWarning] = useState('');
  const [exportingGrid, setExportingGrid] = useState(false);

  useEffect(() => {
    if (!showModal || typeof document === 'undefined') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal]);

  const academyDoc = useMemo(
    () => (academyList || []).find((a) => a.id === academyId) || null,
    [academyList, academyId]
  );
  const navRole = useUserRole(academyDoc);
  const academyName = useMemo(() => String(academyDoc?.name || '').trim(), [academyDoc]);

  const teamIdForPayments = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId);
    return String(cur?.teamId || storeTeamId || '').trim();
  }, [academyList, academyId, storeTeamId]);

  const students = useMemo(
    () => allStudents.filter((l) => isActiveStudent(l)),
    [allStudents]
  );

  const gridLoading = loading || !studentsBootstrapDone;

  const recarregarMes = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setLoadingError(false);
    try {
      const docs = await getMonthlyPayments(academyId, currentMonth, {
        activeStudentCount: students.length,
      });
      setPayments(docs);
    } catch (err) {
      console.error('getMonthlyPayments error:', err);
      setLoadingError(true);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [academyId, currentMonth, students.length]);

  const { collectionRules } = useMemo(
    () => readCollectionSettingsFromFinanceConfig(financeConfig),
    [financeConfig]
  );

  useEffect(() => {
    if (!academyId) return;
    void loadMergedFinanceConfigForAcademy(academyId);
  }, [academyId]);

  useEffect(() => {
    if (!academyId) {
      setStudentsBootstrapDone(false);
      return undefined;
    }
    const controller = new AbortController();
    setStudentsBootstrapDone(false);
    (async () => {
      try {
        await ensureAllStudentsLoaded({ signal: controller.signal });
      } catch (err) {
        console.warn('[MensalidadesPanel] ensureAllStudentsLoaded:', err?.message || err);
      } finally {
        if (!controller.signal.aborted) setStudentsBootstrapDone(true);
      }
    })();
    return () => controller.abort();
  }, [academyId]);

  useEffect(() => {
    let c = false;
    account
      .get()
      .then((u) => {
        if (c) return;
        setSessionUserName(String(u.name || u.email || '').trim() || 'Usuário');
      })
      .catch(() => {
        if (!c) setSessionUserName('Usuário');
      });
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (!academyId) {
      setPayments([]);
      setLoading(false);
      setLoadingError(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadingError(false);
    (async () => {
      try {
        const docs = await getMonthlyPayments(academyId, currentMonth, {
        activeStudentCount: students.length,
      });
        if (!active) return;
        setPayments(docs);
      } catch (err) {
        if (!active) return;
        console.error('getMonthlyPayments error:', err);
        setLoadingError(true);
        setPayments([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [academyId, currentMonth, students.length]);

  useEffect(() => {
    function onStudentPaymentUpdated(e) {
      const ym = String(e?.detail?.referenceMonth || '').trim();
      if (ym && ym !== currentMonth) return;
      if (!academyId) return;
      void recarregarMes();
    }
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('navi-student-payment-updated', onStudentPaymentUpdated);
    return () => window.removeEventListener('navi-student-payment-updated', onStudentPaymentUpdated);
  }, [academyId, currentMonth, recarregarMes]);

  const paymentMap = useMemo(() => {
    const map = {};
    const list = (payments || []).filter((p) => String(p.status || '').toLowerCase() !== 'cancelled');
    for (const p of list) {
      const lid = String(p.lead_id || '').trim();
      if (!lid) continue;
      const cur = map[lid];
      if (!cur) {
        map[lid] = p;
        continue;
      }
      const rank = (st) => {
        const s = String(st || '').toLowerCase();
        if (s === 'paid') return 5;
        if (s === 'covered') return 5;
        if (s === 'partial') return 4;
        if (s === 'awaiting') return 3;
        if (s === 'pending') return 2;
        return 1;
      };
      if (!cur || rank(p.status) >= rank(cur.status)) map[lid] = p;
    }
    return map;
  }, [payments]);

  const recentPaymentsForNl = useMemo(() => {
    const nameByLead = {};
    for (const s of students) {
      nameByLead[String(s.id || '').trim()] = String(s.name || '').trim();
    }
    return (payments || [])
      .filter((p) => String(p.status || '').toLowerCase() !== 'cancelled')
      .map((p) => {
        const lid = String(p.lead_id || '').trim();
        return {
          id: p.$id,
          lead_id: lid,
          student_id: lid,
          student_name: nameByLead[lid] || '',
          reference_month: String(p.reference_month || '').trim(),
          amount: Number(p.amount),
          status: String(p.status || ''),
          method: String(p.method || ''),
          note: String(p.note || ''),
          plan_name: String(p.plan_name || ''),
          account: String(p.account || '')
        };
      });
  }, [payments, students]);

  const nlPageCtx = useMemo(
    () => ({ context: 'financeiro', recentPayments: recentPaymentsForNl }),
    [recentPaymentsForNl]
  );
  useNlPageContext(nlPageCtx);


  const getStatus = useCallback(
    (student) => {
      const p = paymentMap[student.id];
      return resolveGridDisplayStatus(student, p, currentMonth, new Date(), financeConfig).key;
    },
    [paymentMap, currentMonth, financeConfig]
  );

  const studentOverdueMeta = useMemo(() => {
    const map = {};
    for (const s of students) {
      const p = paymentMap[s.id];
      const row = getPaymentRowStatus(s, p, currentMonth, new Date(), financeConfig);
      if (row.status !== 'pending' || row.daysOverdue < 1) continue;
      const stage = resolveCollectionStage(row.daysOverdue, collectionRules);
      map[s.id] = {
        daysOverdue: row.daysOverdue,
        stage,
        amount: openAmountForStudent(s, p, financeConfig),
      };
    }
    return map;
  }, [students, paymentMap, currentMonth, collectionRules, financeConfig]);

  const collectionDashboard = useMemo(() => {
    const byStage = {};
    let total = 0;
    let totalOpen = 0;
    for (const s of students) {
      const meta = studentOverdueMeta[s.id];
      if (!meta) continue;
      total += 1;
      totalOpen += meta.amount || 0;
      const key = String(meta.stage?.day ?? 'outros');
      byStage[key] = (byStage[key] || 0) + 1;
    }
    return { total, totalOpen, byStage };
  }, [students, studentOverdueMeta]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (
        !matchesMensalidadesStatusFilter({
          filter,
          statusKey: getStatus(s),
          student: s,
          payment: paymentMap[s.id],
          currentMonth,
          financeConfig,
          studentOverdueMeta,
        })
      ) {
        return false;
      }
      return matchesMensalidadesStudentFilters({
        student: s,
        search: debouncedSearch,
        turmaFilter,
        planFilter,
      });
    });
  }, [
    students,
    filter,
    debouncedSearch,
    turmaFilter,
    planFilter,
    getStatus,
    studentOverdueMeta,
    paymentMap,
    currentMonth,
    financeConfig,
  ]);

  const displayedStudents = useMemo(() => {
    if (!dueSortOrder) return filteredStudents;
    const copy = [...filteredStudents];
    copy.sort((a, b) => {
      const aDay = studentDueDay(a);
      const bDay = studentDueDay(b);
      const aMissing = !Number.isFinite(aDay);
      const bMissing = !Number.isFinite(bDay);
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return dueSortOrder === 'asc' ? aDay - bDay : bDay - aDay;
    });
    return copy;
  }, [filteredStudents, dueSortOrder]);

  const receptionSummary = useMemo(() => {
    let dueToday = 0;
    let dueWeek = 0;
    let overdue = 0;
    let paid = 0;
    for (const s of students) {
      const st = getStatus(s);
      if (st === 'paid' || st === 'covered') {
        paid += 1;
        continue;
      }
      const bucket = getReceptionDueBucket(s, paymentMap[s.id], currentMonth, new Date(), financeConfig);
      if (bucket === 'due_today') dueToday += 1;
      else if (bucket === 'due_week') dueWeek += 1;
      else if (bucket === 'overdue') overdue += 1;
    }
    return { dueToday, dueWeek, overdue, paid };
  }, [students, paymentMap, currentMonth, getStatus, financeConfig]);

  const toggleReceptionFilter = useCallback(
    (next) => {
      if (next === 'overdue' && sectionMode) {
        navigate(buildReceivablesPath({ section: RECEIVABLES_SECTIONS.COBRANCA }));
        return;
      }
      setFilter((cur) => (cur === next ? 'all' : next));
    },
    [sectionMode, navigate]
  );

  const filterCounts = useMemo(
    () => buildMensalidadesFilterCounts(students, getStatus),
    [students, getStatus]
  );

  const reguaFilterChips = useMemo(() => {
    const rules = (collectionRules || []).filter((r) => r.day >= 1 && r.day <= 30);
    const pick = rules.length ? rules.slice(0, 3) : [{ day: 1 }, { day: 7 }, { day: 15 }];
    return pick.map((rule) => {
      const day = rule.day;
      const count = students.filter((s) => {
        const meta = studentOverdueMeta[s.id];
        return meta && Number(meta.stage?.day) === day;
      }).length;
      return { id: `regua_${day}`, label: `D+${day}`, count };
    });
  }, [collectionRules, students, studentOverdueMeta]);

  const exceptionCount = useMemo(
    () =>
      students.filter((s) =>
        isRealPaymentException(s, paymentMap[s.id], currentMonth, financeConfig)
      ).length,
    [students, paymentMap, currentMonth, financeConfig]
  );

  const viewTabs = useMemo(
    () => [
      { id: 'list', label: 'Lista' },
      { id: 'grid', label: 'Resumo' },
      {
        id: 'exceptions',
        label: exceptionCount > 0 ? `Pendências (${exceptionCount})` : 'Pendências',
        shortLabel: 'Pendências',
      },
    ],
    [exceptionCount]
  );

  const monthKpis = useMemo(
    () => computeMensalidadesMonthKpis(students, payments, financeConfig, currentMonth),
    [students, payments, financeConfig, currentMonth]
  );

  const monthOpenTotal = useMemo(
    () => Math.max(0, Math.round((monthKpis.expectedTotal - monthKpis.receivedTotal) * 100) / 100),
    [monthKpis.expectedTotal, monthKpis.receivedTotal]
  );

  const canReversePayment = navRole === 'owner' || navRole === 'admin';
  const linkStudentProfile = navRole === 'owner' || navRole === 'admin';
  const canConfigureFinance = canReversePayment;
  const hasBankAccounts = hasConfiguredBankAccounts(financeConfig);

  const clearPayFieldError = useCallback((field) => {
    setPayFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setPaymentFormError('');
  }, []);

  const setPayFormTroco = useCallback((updater) => {
    setPayFormErrors((prev) => {
      if (!prev.cash_received && !prev.trocoAccount) return prev;
      const next = { ...prev };
      delete next.cash_received;
      delete next.trocoAccount;
      return next;
    });
    setPaymentFormError('');
    setPayForm(updater);
  }, []);

  const openPaymentModal = useCallback((student, preset = {}) => {
    const refMonth = String(preset.reference_month || preset.bundle_start_month || currentMonth).trim() || currentMonth;
    const day = studentDueDay(student);
    const dueDate = dueDateInMonth(refMonth, day);
    const paymentType = preset.payment_type || PAYMENT_CATEGORY.PLAN;
    const isBundle = paymentType === PAYMENT_CATEGORY.BUNDLE;
    setSelectedStudent(student);
    const amountNum = Number(preset.amount);
    const hasPresetAmount = Object.prototype.hasOwnProperty.call(preset || {}, 'amount');
    const method = preset.method || student.preferredPaymentMethod || 'pix';
    const captureDefaults = whenPaymentMethodChangesWithCapture(financeConfig, method);
    const planName = preset.plan_name || student.plan || '';
    const plan = findPlanByName(financeConfig, planName);
    const planAmount = openAmountForStudent(student, { plan_name: planName }, financeConfig);
    const bundleStart = String(preset.bundle_start_month || refMonth).trim() || refMonth;
    const coverageYm = isBundle ? bundleStart : refMonth;
    paidAtTouchedRef.current = false;
    setPayForm({
      payment_type: paymentType,
      reference_month: refMonth,
      bundle_start_month: bundleStart,
      bundle_months: Number(preset.bundle_months) || 12,
      amount:
        hasPresetAmount && preset.amount != null && Number.isFinite(amountNum) && amountNum >= 0
          ? maskCurrency(String(Math.round(amountNum * 100)))
          : isBundle && planAmount > 0
            ? maskCurrency(String(Math.round(planAmount * 100)))
            : '',
      method,
      ...captureDefaults,
      account: captureDefaults.account || pickInitialBankAccountForPayment(
        financeConfig,
        student.preferredPaymentAccount || '',
        method
      ),
      status: 'paid',
      paid_at: suggestPaidAtYmd({ coverageMonth: coverageYm }),
      due_date: dueDate ? dueDate.toISOString().slice(0, 10) : '',
      due_day: day ? String(day) : '',
      plan_name: planName,
      note: preset.note || '',
      saveAsPreferred: !String(student.preferredPaymentMethod || '').trim(),
      cash_received: '',
      formaTroco: 'pix',
      trocoAccount: '',
      installments: Math.min(12, Math.max(1, Number(preset.installments) || 1)),
      card_brand: '',
    });
    setPayFormErrors({});
    setPaymentFormError('');
    setShowModal(true);
  }, [currentMonth, financeConfig]);

  useEffect(() => {
    const onNlPaymentPrefill = (ev) => {
      const d = ev?.detail || {};
      const sid = String(d.student_id || '').trim();
      const student = students.find((s) => String(s.id || '').trim() === sid);
      if (!student) return;
      openPaymentModal(student, d);
    };
    window.addEventListener(NL_PAYMENT_PREFILL_EVENT, onNlPaymentPrefill);
    return () => window.removeEventListener(NL_PAYMENT_PREFILL_EVENT, onNlPaymentPrefill);
  }, [students, currentMonth, openPaymentModal]);

  const payDeepLinkHandled = useRef('');
  useEffect(() => {
    const payStudent = String(searchParams.get('pay_student') || '').trim();
    const payMonth = String(searchParams.get('pay_month') || '').trim().slice(0, 7);
    const payAmountRaw = String(searchParams.get('pay_amount') || '').trim();
    const payAmount = Number(payAmountRaw.replace(',', '.'));
    if (!payStudent || !students.length) return;
    const key = `${payStudent}|${payMonth}`;
    if (payDeepLinkHandled.current === key) return;
    const student = students.find((s) => String(s.id || '').trim() === payStudent);
    if (!student) return;
    payDeepLinkHandled.current = key;
    if (payMonth && /^\d{4}-\d{2}$/.test(payMonth)) {
      setCurrentMonth(payMonth);
      onReferenceMonthChange?.(payMonth);
    }
    openPaymentModal(student, {
      reference_month: payMonth || currentMonth,
      ...(Number.isFinite(payAmount) && payAmount >= 0 ? { amount: payAmount } : {}),
    });
  }, [searchParams, students, openPaymentModal, currentMonth, onReferenceMonthChange]);

  const handleSavePayment = async () => {
    if (!selectedStudent || !academyId || savingPayment) return;
    const isBundle = payForm.payment_type === PAYMENT_CATEGORY.BUNDLE;
    const bundleMonths = Number(payForm.bundle_months) || 12;
    const coverageStart = String(payForm.bundle_start_month || '').trim();

    const { errors, amountNum, paymentAccount } = validateMensalidadesPaymentForm({
      payForm,
      financeConfig,
      student: selectedStudent,
      existingPayment: paymentMap[selectedStudent.id],
    });
    if (Object.keys(errors).length > 0) {
      setPayFormErrors(errors);
      setPaymentFormError('');
      focusFirstMensalidadesPaymentError(errors);
      return;
    }
    setPayFormErrors({});
    setPaymentFormError('');

    const installments = normalizeMensalidadesInstallments(payForm.method, payForm.installments);
    const paidAtMs = new Date(String(payForm.paid_at || '').trim()).getTime();
    const dueDayNum = Number(String(payForm.due_day || '').replace(/[^\d]/g, ''));
    const dueDayValid = Number.isFinite(dueDayNum) && dueDayNum >= 1 && dueDayNum <= 31;

    const paidAtYmd = String(payForm.paid_at || '').trim();
    if (!skipFuturePaidDateRef.current && isPaymentDateInFuture(paidAtYmd)) {
      setFuturePaidDateLabel(formatPaymentDateLabel(paidAtYmd));
      return;
    }
    skipFuturePaidDateRef.current = false;

    if (
      !skipPaidAtDivergenceRef.current &&
      paidAtMonthDivergesFromCoverage(payForm, { referenceMonth: currentMonth })
    ) {
      setPaidAtDivergenceConfirm(
        paidAtCoverageDivergenceConfirmDescription(payForm, { referenceMonth: currentMonth })
      );
      return;
    }
    skipPaidAtDivergenceRef.current = false;

    const student = selectedStudent;
    const payFormSnapshot = { ...payForm };
    const previousPayments = payments;
    const optimisticId = `optimistic-${student.id}-${Date.now()}`;
    const paidAtIso = new Date(paidAtMs).toISOString();
    const refMonth = isBundle ? coverageStart : currentMonth;
    const optimisticDoc = {
      $id: optimisticId,
      lead_id: student.id,
      academy_id: academyId,
      team_id: teamIdForPayments,
      amount: amountNum,
      paid_amount: amountNum,
      method: payForm.method,
      account: paymentAccount,
      installments,
      status: 'paid',
      payment_category: isBundle ? PAYMENT_CATEGORY.BUNDLE : PAYMENT_CATEGORY.PLAN,
      bundle_months: isBundle ? bundleMonths : null,
      reference_month: refMonth,
      paid_at: paidAtIso,
      plan_name: payForm.plan_name || student.plan || '',
      note: payForm.note || '',
      registered_by: userId || '',
      registered_by_name: sessionUserName,
    };

    setShowModal(false);
    setSelectedStudent(null);
    setPayments((prev) => {
      const next = (prev || []).filter((p) => String(p.lead_id) !== String(student.id));
      if (!isBundle || refMonth === currentMonth) next.push(optimisticDoc);
      return next;
    });
    setSavingPayment(true);

    try {
      const paymentPayload = {
        lead_id: student.id,
        academy_id: academyId,
        team_id: teamIdForPayments,
        amount: amountNum,
        method: payForm.method,
        account: paymentAccount,
        installments,
        ...resolveCaptureFieldsForPayment(financeConfig, payForm.method, payForm.capture_method_id),
        ...(payForm.card_brand ? { card_brand: String(payForm.card_brand).trim() } : {}),
        status: 'paid',
        paid_at: paidAtIso,
        due_date: null,
        registered_by: userId || '',
        registered_by_name: sessionUserName,
        plan_name: payForm.plan_name || student.plan || '',
        note: payForm.note || '',
        payment_category: isBundle ? PAYMENT_CATEGORY.BUNDLE : PAYMENT_CATEGORY.PLAN,
        ...trocoFieldsForPaymentPayload(payForm, amountNum, financeConfig),
      };
      if (isBundle) {
        paymentPayload.bundle_months = bundleMonths;
        paymentPayload.coverage_start_month = coverageStart;
        paymentPayload.reference_month = coverageStart;
      } else {
        paymentPayload.reference_month = currentMonth;
      }

      const doc = await createPayment(paymentPayload, { financeConfig, toast });
      if (isBundle) {
        await recarregarMes();
      } else {
        setPayments((prev) => {
          const next = (prev || []).filter(
            (p) => String(p.lead_id) !== String(student.id) && p.$id !== optimisticId
          );
          next.push(doc);
          return next;
        });
      }
      let studentPrefsWarning = '';
      try {
        if (payForm.saveAsPreferred) {
          await updateStudent(student.id, {
            preferredPaymentMethod: payForm.method,
            preferredPaymentAccount: paymentAccount,
            ...(!isBundle ? { dueDay: dueDayValid ? dueDayNum : null } : {}),
          });
        } else if (!isBundle && (dueDayValid || String(student?.dueDay || '').trim())) {
          await updateStudent(student.id, { dueDay: dueDayValid ? dueDayNum : null });
        }
      } catch (prefErr) {
        console.warn('[Mensalidades] updateStudent após pagamento:', prefErr);
        studentPrefsWarning =
          ' Pagamento salvo; preferências do aluno (forma de pagamento/vencimento) não foram gravadas no cadastro.';
      }
      const bundleLabel = bundlePlanShortLabel(bundleMonths);
      const successMsg = isBundle
        ? `Plano ${bundleLabel} registrado — ${bundleMonths} meses cobertos a partir de ${formatMonthTitleCapitalized(coverageStart)}.${studentPrefsWarning}`
        : `Pagamento registrado.${studentPrefsWarning}`;
      toast.show({
        type: studentPrefsWarning ? 'warning' : 'success',
        message: successMsg,
      });
      if (doc?.warning) {
        toast.show({
          type: 'warning',
          message: String(doc.warning || '').trim() || 'Pagamento registrado, mas houve um problema ao atualizar o caixa.',
          duration: 10000,
        });
      }
    } catch (e) {
      setPayments(previousPayments);
      setSelectedStudent(student);
      setPayForm(payFormSnapshot);
      setShowModal(true);
      const msg = studentPaymentFriendlyError(e, 'save');
      if (/já existe um lançamento/i.test(msg)) {
        setPayFormErrors({ amount: msg });
        setPaymentFormError('');
      } else {
        setPaymentFormError(msg);
      }
    } finally {
      setSavingPayment(false);
    }
  };

  const handleEstornar = async (payment) => {
    const id = payment?.$id;
    if (!id) return;
    const previousPayments = payments;
    setPayments((prev) => prev.map((p) => (p.$id === id ? { ...p, status: 'cancelled' } : p)));
    try {
      await updatePayment(id, { status: 'cancelled', academy_id: payment.academy_id });
      const txId = String(payment?.financial_tx_id || '').trim();
      const aid = String(payment?.academy_id || academyId || '').trim();
      if (txId && aid) {
        try {
          await reverseFinanceTx({ academyId: aid, id: txId, reason: 'Estorno mensalidade' });
        } catch (err) {
          console.error('Falha no sync financeiro após estorno:', err);
          setEstornoCaixaWarning(
            'Mensalidade estornada, mas o estorno no caixa pode não ter sido concluído. Verifique em Financeiro → Lançamentos.'
          );
        }
      }
      toast.success('Pagamento estornado.');
    } catch (e) {
      setPayments(previousPayments);
      toast.show({
        type: 'error',
        message: 'Não foi possível estornar o pagamento.',
      });
      throw e;
    }
  };

  const turmas = useMemo(() => {
    const set = new Set();
    for (const s of students) {
      const t = studentTurma(s);
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [students]);

  const studentPlans = useMemo(() => {
    const set = new Set();
    for (const s of students) {
      const p = String(s.plan || '').trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [students]);

  const exceptionStatusLabels = useMemo(
    () => readExceptionStatusLabels(financeConfig),
    [financeConfig]
  );

  const exceptionRows = useMemo(
    () => listExceptionRows(students, paymentMap, currentMonth, financeConfig),
    [students, paymentMap, currentMonth, financeConfig]
  );

  const exTurmas = useMemo(() => {
    const set = new Set();
    for (const r of exceptionRows) {
      if (r.turma) set.add(r.turma);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [exceptionRows]);

  const exPlatforms = useMemo(() => {
    const set = new Set();
    for (const r of exceptionRows) {
      if (r.platform && r.platform !== '—') set.add(r.platform);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [exceptionRows]);

  const exStatusFilterOptions = useMemo(
    () => buildExceptionStatusFilterOptions(exceptionRows, exceptionStatusLabels),
    [exceptionRows, exceptionStatusLabels]
  );

  const clearFilters = useCallback(() => {
    setFilter('all');
    setSearch('');
    setDueSortOrder(null);
    setTurmaFilter('all');
    setPlanFilter('all');
    setGridSortBy('name');
    setExStatusFilter('all');
    setExTurmaFilter('all');
    setExPlatformFilter('all');
    setExOnlyWithDiff(false);
    setExSortBy('difference');
  }, []);

  const handleExportGrid = useCallback(() => {
    if (exportingGrid) return;
    setExportingGrid(true);
    try {
      const rows = buildMensalidadesGridRows(students, paymentMap, financeConfig, currentMonth);
      const sorted = filterSortMensalidadesRows(rows, {
        search,
        filter,
        turmaFilter,
        planFilter,
        sortBy: gridSortBy,
        currentMonth,
        financeConfig,
        studentOverdueMeta,
      });
      const count = exportMensalidadesGridCsv(sorted, currentMonth);
      if (count === 0) {
        toast.warning('Nenhum aluno na grade com os filtros atuais.');
      } else {
        toast.success(`${count} linha(s) exportada(s).`);
      }
    } catch (e) {
      console.error('[MensalidadesPanel] export grid:', e);
      toast.error('Não foi possível exportar a grade.');
    } finally {
      setExportingGrid(false);
    }
  }, [
    exportingGrid,
    students,
    paymentMap,
    financeConfig,
    currentMonth,
    search,
    filter,
    turmaFilter,
    planFilter,
    gridSortBy,
    studentOverdueMeta,
    toast,
  ]);

  const hasStudentsWithPlan = useMemo(
    () => students.some((s) => String(s.plan || '').trim()),
    [students]
  );

  const hasActiveFilters = useMemo(() => {
    if (search.trim().length > 0) return true;
    if ((viewMode === 'list' || viewMode === 'grid') && filter !== 'all') return true;
    if ((viewMode === 'list' || viewMode === 'grid') && turmaFilter !== 'all') return true;
    if ((viewMode === 'list' || viewMode === 'grid') && planFilter !== 'all') return true;
    if (viewMode === 'list' && dueSortOrder) return true;
    if (viewMode === 'grid' && gridSortBy !== 'name') return true;
    if (viewMode === 'exceptions') {
      return (
        exStatusFilter !== 'all' ||
        exTurmaFilter !== 'all' ||
        exPlatformFilter !== 'all' ||
        exOnlyWithDiff ||
        exSortBy !== 'difference'
      );
    }
    return false;
  }, [
    search,
    filter,
    viewMode,
    turmaFilter,
    planFilter,
    dueSortOrder,
    gridSortBy,
    exStatusFilter,
    exTurmaFilter,
    exPlatformFilter,
    exOnlyWithDiff,
    exSortBy,
  ]);

  const fmtMoney = formatBRL;

  const handleMonthChange = useCallback(
    (ym) => {
      setCurrentMonth(ym);
      onReferenceMonthChange?.(ym);
    },
    [onReferenceMonthChange]
  );

  return (
    <div
      className={`mensalidades-page animate-in${embedded ? ' mensalidades-panel--embedded mensalidades-page--embedded' : ' mensalidades-page--standalone'}`}
    >
      <header className="mensal-header">
        {!embedded && !sectionMode ? (
          <div className="mensal-header__top">
            <PageHeader
              className="navi-page-header--flush mensal-header__page-title"
              title="Mensalidades"
              subtitle="Controle cobranças e pagamentos dos alunos."
              meta={`Referência do mês${academyName ? ` · ${academyName}` : ''}`}
              metaClassName="mensal-header__eyebrow"
              animate={false}
              actions={
                <FinanceMonthPicker value={currentMonth} onChange={handleMonthChange} />
              }
            />
          </div>
        ) : null}

        {modules?.finance === true ? (
          <HubTabBar
            tabs={viewTabs}
            activeId={viewMode}
            onChange={setViewMode}
            ariaLabel="Visualização de mensalidades"
            variant="underline"
            size="sm"
            className={`mensalidades-panel__view-tabs${embedded ? ' mensalidades-panel__view-tabs--embedded' : ''}`}
          />
        ) : null}

        <FinanceBankAccountsSetupBanner
          financeConfig={financeConfig}
          canConfigure={canConfigureFinance}
          className="mensal-bank-setup-banner"
        />

        {reconStatementId ? (
          <StatusBanner variant="info" className="mb-3">
            Você veio da conciliação bancária. Após registrar o pagamento,{' '}
            <Link to={buildBankReconReturnPath(reconStatementId)}>volte ao extrato</Link> para vincular a linha.
          </StatusBanner>
        ) : null}

        <FinanceFiltersBar className="mensal-toolbar">
          <SearchField
            className="finance-filters-bar__search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar ${terms.student.toLowerCase()}...`}
            aria-label={`Buscar ${terms.student.toLowerCase()}`}
          />
          {(viewMode === 'list' || viewMode === 'grid') ? (
            <MensalidadesStatusFilter
              filter={filter}
              onFilterChange={setFilter}
              filterCounts={filterCounts}
              reguaFilterChips={reguaFilterChips}
              collectionRules={collectionRules}
            />
          ) : null}
          {(viewMode === 'list' || viewMode === 'grid') && turmas.length > 0 ? (
            <FinanceToolbarSelect
              id="mensal-turma"
              label="Turma"
              className="finance-filters-bar__field--turma"
              value={turmaFilter}
              onChange={(e) => setTurmaFilter(e.target.value)}
            >
              <option value="all">Todas as turmas</option>
              {turmas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FinanceToolbarSelect>
          ) : null}
          {(viewMode === 'list' || viewMode === 'grid') && studentPlans.length > 0 ? (
            <FinanceToolbarSelect
              id="mensal-plano"
              label="Plano"
              className="finance-filters-bar__field--plano"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
            >
              <option value="all">Todos os planos</option>
              {studentPlans.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </FinanceToolbarSelect>
          ) : null}
          {viewMode === 'grid' ? (
            <FinanceToolbarSelect
              id="mensal-grid-sort"
              label="Ordenar por"
              className="finance-filters-bar__field--sort"
              value={gridSortBy}
              onChange={(e) => setGridSortBy(e.target.value)}
            >
              <option value="name">Nome</option>
              <option value="due">Vencimento</option>
              <option value="status">Status</option>
              <option value="amount">Valor esperado</option>
            </FinanceToolbarSelect>
          ) : null}
          {viewMode === 'list' || viewMode === 'grid' ? (
            <button
              type="button"
              className="btn-outline btn-sm navi-btn--toolbar"
              onClick={handleExportGrid}
              disabled={exportingGrid || gridLoading}
            >
              <Download size={14} aria-hidden />
              {exportingGrid ? 'Exportando…' : 'Exportar CSV'}
            </button>
          ) : null}
          {viewMode === 'exceptions' ? (
            <>
              <CompactStatusFilter
                value={exStatusFilter}
                onChange={setExStatusFilter}
                options={exStatusFilterOptions}
                placeholder="Todos os tipos"
                showCounts={false}
              />
              {exTurmas.length > 0 ? (
                <FinanceToolbarSelect
                  id="mensal-ex-turma"
                  label="Turma"
                  className="finance-filters-bar__field--turma"
                  value={exTurmaFilter}
                  onChange={(e) => setExTurmaFilter(e.target.value)}
                >
                  <option value="all">Todas</option>
                  {exTurmas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </FinanceToolbarSelect>
              ) : null}
              {exPlatforms.length > 0 ? (
                <FinanceToolbarSelect
                  id="mensal-ex-platform"
                  label="Plataforma"
                  className="finance-filters-bar__field--platform"
                  value={exPlatformFilter}
                  onChange={(e) => setExPlatformFilter(e.target.value)}
                >
                  <option value="all">Todas</option>
                  {exPlatforms.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </FinanceToolbarSelect>
              ) : null}
              <label className="finance-filters-bar__check">
                <input
                  type="checkbox"
                  checked={exOnlyWithDiff}
                  onChange={(e) => setExOnlyWithDiff(e.target.checked)}
                />
                Só com diferença &gt; 0
              </label>
              <FinanceToolbarSelect
                id="mensal-ex-sort"
                label="Ordenar por"
                className="finance-filters-bar__field--sort"
                value={exSortBy}
                onChange={(e) => setExSortBy(e.target.value)}
              >
                <option value="difference">Diferença (maior)</option>
                <option value="due">Vencimento (atraso)</option>
                <option value="name">Nome</option>
                <option value="status">Status</option>
              </FinanceToolbarSelect>
            </>
          ) : null}
          {hasActiveFilters ? (
            <button
              type="button"
              className="btn-outline btn-sm filter-clear navi-btn--toolbar"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          ) : null}
        </FinanceFiltersBar>

      </header>

      {viewMode === 'grid' && modules?.finance === true ? (
        <MonthlyPaymentGrid
          students={students}
          paymentMap={paymentMap}
          payments={payments}
          setPayments={setPayments}
          currentMonth={currentMonth}
          financeConfig={financeConfig}
          academyId={academyId}
          teamIdForPayments={teamIdForPayments}
          userId={userId}
          sessionUserName={sessionUserName}
          search={search}
          filter={filter}
          turmaFilter={turmaFilter}
          planFilter={planFilter}
          sortBy={gridSortBy}
          studentOverdueMeta={studentOverdueMeta}
          terms={terms}
          addToast={toast.addToast}
          friendlyError={friendlyError}
          loading={gridLoading}
        />
      ) : null}

      {viewMode === 'exceptions' && modules?.finance === true ? (
        <PaymentExceptionsView
          students={students}
          paymentMap={paymentMap}
          setPayments={setPayments}
          currentMonth={currentMonth}
          financeConfig={financeConfig}
          academyId={academyId}
          teamIdForPayments={teamIdForPayments}
          userId={userId}
          sessionUserName={sessionUserName}
          search={search}
          statusFilter={exStatusFilter}
          turmaFilter={exTurmaFilter}
          platformFilter={exPlatformFilter}
          onlyWithDiff={exOnlyWithDiff}
          sortBy={exSortBy}
          terms={terms}
          addToast={toast.addToast}
          friendlyError={friendlyError}
          loading={gridLoading}
        />
      ) : null}

      {viewMode === 'list' ? (
      <>
      <section className="mensal-priorities-block" aria-label="Prioridades do dia">
        {gridLoading ? (
          <div className="mensal-priorities-strip mensal-priorities-strip--skeleton" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="mensal-priorities-strip__skeleton" />
            ))}
          </div>
        ) : (
          <div className="mensal-priorities-strip" role="list">
            {[
              {
                key: 'due_today',
                filterKey: 'due_today',
                count: receptionSummary.dueToday,
                label: 'Vencendo hoje',
                icon: Calendar,
                tone: 'warn',
              },
              {
                key: 'due_week',
                filterKey: 'due_week',
                count: receptionSummary.dueWeek,
                label: 'Vence em até 7 dias',
                icon: CalendarClock,
                tone: 'warn',
              },
              {
                key: 'overdue',
                filterKey: 'overdue',
                count: receptionSummary.overdue,
                label: 'Atraso · recepção',
                icon: AlertCircle,
                tone: 'danger',
              },
              {
                key: 'paid_in_month',
                filterKey: 'paid_in_month',
                count: receptionSummary.paid,
                label: 'Pagos no mês',
                icon: CheckCircle2,
                tone: 'success',
              },
            ].map((item, index) => {
              const Icon = item.icon;
              const isZero = Number(item.count) === 0;
              const isActive = filter === item.filterKey;
              return (
                <React.Fragment key={item.key}>
                  {index > 0 ? (
                    <span className="mensal-priorities-strip__divider" aria-hidden />
                  ) : null}
                  <button
                    type="button"
                    role="listitem"
                    aria-pressed={isActive}
                    className={[
                      'mensal-priorities-chip',
                      `mensal-priorities-chip--${item.tone}`,
                      isZero ? 'mensal-priorities-chip--zero' : '',
                      isActive ? 'mensal-priorities-chip--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => toggleReceptionFilter(item.filterKey)}
                  >
                    <Icon size={15} className="mensal-priorities-chip__icon" aria-hidden />
                    <span className="mensal-priorities-chip__value">{item.count}</span>
                    <span className="mensal-priorities-chip__label">{item.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
        {sectionMode && !gridLoading ? (
          <p className="mensal-cobranca-link-wrap">
            <Link
              to={buildReceivablesPath({ section: RECEIVABLES_SECTIONS.COBRANCA })}
              className="finance-config-context-link"
            >
              Abrir fila de cobrança
              {collectionDashboard.total > 0
                ? ` · ${collectionDashboard.total} inadimplente${collectionDashboard.total !== 1 ? 's' : ''}`
                : ''}{' '}
              →
            </Link>
          </p>
        ) : null}
      </section>

      {loadingError ? (
        <ErrorBanner
          message="Erro ao carregar pagamentos do mês."
          onRetry={() => void recarregarMes()}
        />
      ) : null}

      {estornoCaixaWarning ? (
        <div className="mensal-estorno-caixa-banner" role="alert">
          <span className="mensal-estorno-caixa-banner__message">{estornoCaixaWarning}</span>
          <Link to="/financeiro?tab=movimentacoes" className="mensal-estorno-caixa-banner__link">
            Ver lançamentos →
          </Link>
          <button
            type="button"
            className="btn-outline btn-sm mensal-estorno-caixa-banner__close"
            onClick={() => setEstornoCaixaWarning('')}
          >
            Fechar
          </button>
        </div>
      ) : null}

      <MensalidadesListTable
        loading={gridLoading}
        displayedStudents={displayedStudents}
        hasStudentsWithPlan={hasStudentsWithPlan}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        terms={terms}
        paymentMap={paymentMap}
        currentMonth={currentMonth}
        getRowStatus={(student, payment, month) => getRowStatus(student, payment, month, financeConfig)}
        startOfLocalDay={startOfLocalDay}
        formatDdMm={formatDdMm}
        parseYmdLocal={parseYmdLocal}
        fmtMoney={fmtMoney}
        METHOD_LABELS={METHOD_LABELS}
        dueSortOrder={dueSortOrder}
        setDueSortOrder={setDueSortOrder}
        openPaymentModal={openPaymentModal}
        handleEstornar={handleEstornar}
        configuredTurmas={configuredTurmas}
        canReverse={canReversePayment}
        linkStudentProfile={linkStudentProfile}
        navRole={navRole}
      />

      {!gridLoading ? (
        <details className="mensal-collapsible-section">
          <summary className="mensal-collapsible-section__summary">
            <span>Resumo do mês · {formatMonthTitleCapitalized(currentMonth)}</span>
            <ChevronDown size={16} className="mensal-collapsible-section__chevron" aria-hidden />
          </summary>
          <section className="mensal-summary-block mensal-month-kpis" aria-label="Resumo do mês">
            <div className="mensal-summary-grid mensal-summary-grid--month-kpis">
              <div className="mensal-summary-card mensal-summary-card--static mensal-summary-card--total">
                <div className="mensal-summary-card__value mensal-summary-card__value--money finance-data">
                  {fmtMoney(monthKpis.expectedTotal)}
                </div>
                <div className="mensal-summary-card__label">Esperado</div>
              </div>
              <div className="mensal-summary-card mensal-summary-card--static mensal-summary-card--paid">
                <div className="mensal-summary-card__value mensal-summary-card__value--money finance-data">
                  {fmtMoney(monthKpis.receivedTotal)}
                </div>
                <div className="mensal-summary-card__label">Recebido</div>
              </div>
              <div className="mensal-summary-card mensal-summary-card--static mensal-summary-card--pending">
                <div className="mensal-summary-card__value mensal-summary-card__value--money finance-data">
                  {fmtMoney(monthOpenTotal)}
                </div>
                <div className="mensal-summary-card__label">Em aberto</div>
              </div>
            </div>
          </section>
        </details>
      ) : null}

      </>
      ) : null}

      <ModalShell
        open={showModal && Boolean(selectedStudent)}
        title={selectedStudent?.name || ''}
        onClose={() => {
          if (!savingPayment) setShowModal(false);
        }}
        closeOnOverlay={!savingPayment}
        closeOnEsc={!savingPayment}
        showCloseButton={!savingPayment}
        maxWidth={480}
        className="navi-modal-overlay--form mensalidades-modal-overlay"
        dialogClassName="mensalidades-modal-scope"
        ariaLabelledBy="mensalidades-modal-title"
        footer={
          <footer className="mensalidades-modal-footer">
            {!hasBankAccounts ? (
              <PaymentModalFooterHint variant="error" id="mensal-pay-footer-hint">
                {canConfigureFinance ? (
                  <>
                    Cadastre uma conta de recebimento antes de confirmar.{' '}
                    <Link to={EMPRESA_FINANCE_ACCOUNTS_PATH}>Configurar agora →</Link>
                  </>
                ) : (
                  'Peça ao titular ou administrador que cadastre uma conta em Minha academia → Financeiro → Recebimento.'
                )}
              </PaymentModalFooterHint>
            ) : null}
            <div className="mensalidades-modal-footer__actions">
              <button
                type="button"
                className={`btn-outline mensalidades-modal-footer__cancel${savingPayment ? ' mensalidades-modal-footer__btn--disabled' : ''}`}
                onClick={() => setShowModal(false)}
                disabled={savingPayment}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingPayment || !hasBankAccounts}
                onClick={() => void handleSavePayment()}
                className={`btn-primary mensalidades-modal-footer__confirm${savingPayment || !hasBankAccounts ? ' mensalidades-modal-footer__btn--disabled' : ''}`}
                aria-describedby={!hasBankAccounts ? 'mensal-pay-footer-hint' : undefined}
              >
                <span className="ti ti-check mensalidades-modal-footer__confirm-icon" aria-hidden />
                {savingPayment
                  ? 'Salvando…'
                  : payForm.payment_type === PAYMENT_CATEGORY.BUNDLE
                    ? 'Confirmar plano'
                    : 'Confirmar pagamento'}
              </button>
            </div>
          </footer>
        }
      >
                <div className="mensalidades-modal-header__month" id="mensalidades-modal-title">
                  <span className="ti ti-calendar mensalidades-modal-header__month-icon" aria-hidden />
                  {formatMonthTitleCapitalized(currentMonth)}
                </div>

                <div className="mensalidades-modal-body">
                  <PaymentFormErrorBanner message={paymentFormError} />
                  <PaymentReceiptDateBanner
                    payForm={payForm}
                    referenceMonth={currentMonth}
                    className="mensal-modal-receipt-banner"
                    onUseCoverageDate={() => {
                      const isBundleType = payForm.payment_type === PAYMENT_CATEGORY.BUNDLE;
                      const coverageYm = isBundleType
                        ? String(payForm.bundle_start_month || currentMonth).trim()
                        : currentMonth;
                      paidAtTouchedRef.current = false;
                      setPayForm((f) => ({
                        ...f,
                        paid_at: suggestPaidAtYmd({ coverageMonth: coverageYm }),
                      }));
                    }}
                  />
                  <div>
                    <div className="mensal-modal-field-label mensal-modal-field-label--spaced">
                      Tipo de pagamento
                    </div>
                    <div className="mensal-modal-type-grid" role="group" aria-label="Tipo de pagamento">
                      <button
                        type="button"
                        aria-pressed={payForm.payment_type !== PAYMENT_CATEGORY.BUNDLE}
                        className={`mensal-modal-type-btn${payForm.payment_type !== PAYMENT_CATEGORY.BUNDLE ? ' mensal-modal-type-btn--active' : ''}`}
                        onClick={() =>
                          setPayForm((f) => ({
                            ...f,
                            payment_type: PAYMENT_CATEGORY.PLAN,
                          }))
                        }
                      >
                        Mensalidade
                      </button>
                      <button
                        type="button"
                        aria-pressed={payForm.payment_type === PAYMENT_CATEGORY.BUNDLE}
                        className={`mensal-modal-type-btn${payForm.payment_type === PAYMENT_CATEGORY.BUNDLE ? ' mensal-modal-type-btn--active' : ''}`}
                        onClick={() => {
                          const planAmount = openAmountForStudent(
                            selectedStudent,
                            { plan_name: payForm.plan_name || selectedStudent.plan },
                            financeConfig
                          );
                          const bundleStart = payForm.bundle_start_month || currentMonth;
                          setPayForm((f) => ({
                            ...f,
                            payment_type: PAYMENT_CATEGORY.BUNDLE,
                            bundle_start_month: bundleStart,
                            amount:
                              f.amount ||
                              (planAmount > 0
                                ? maskCurrency(String(Math.round(planAmount * 100)))
                                : ''),
                            ...(paidAtTouchedRef.current
                              ? {}
                              : { paid_at: suggestPaidAtYmd({ coverageMonth: bundleStart }) }),
                          }));
                        }}
                      >
                        Plano com cobertura
                      </button>
                    </div>
                    {payForm.payment_type === PAYMENT_CATEGORY.BUNDLE ? (
                      <p className="text-xs text-muted mensal-modal-bundle-hint" role="note">
                        O valor entra no Caixa agora; os meses cobertos não aparecem em A receber.
                      </p>
                    ) : null}
                  </div>

                  {payForm.payment_type === PAYMENT_CATEGORY.BUNDLE ? (
                    <div className="mensal-pay-top-grid">
                      <div className="mensal-modal-col">
                        <label className="mensal-modal-field-label" htmlFor="mensal-bundle-months">
                          Duração
                        </label>
                        <select
                          id="mensal-bundle-months"
                          className="mensal-modal-in"
                          value={payForm.bundle_months || 12}
                          onChange={(e) =>
                            setPayForm((f) => ({ ...f, bundle_months: Number(e.target.value) }))
                          }
                        >
                          {BUNDLE_DURATION_OPTIONS.map((o) => (
                            <option key={o.months} value={o.months}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mensal-modal-col">
                        <DateInput
                          id={MENSALIDADES_PAY_FIELD_IDS.bundle_start_month}
                          label="Início da cobertura"
                          type="month"
                          value={payForm.bundle_start_month || currentMonth}
                          onChange={(e) => {
                            clearPayFieldError('bundle_start_month');
                            const ym = e.target.value;
                            setPayForm((f) => ({
                              ...f,
                              bundle_start_month: ym,
                              ...(paidAtTouchedRef.current
                                ? {}
                                : { paid_at: suggestPaidAtYmd({ coverageMonth: ym }) }),
                            }));
                          }}
                          required
                          className="mensal-modal-in"
                          aria-invalid={payFormErrors.bundle_start_month ? 'true' : undefined}
                          aria-describedby={
                            payFormErrors.bundle_start_month ? 'mensal-bundle-start-error' : undefined
                          }
                        />
                        <FieldError id="mensal-bundle-start-error">
                          {payFormErrors.bundle_start_month}
                        </FieldError>
                      </div>
                    </div>
                  ) : null}

                  <div className="mensal-pay-top-grid">
                    <div className="mensal-modal-col">
                      <label className="mensal-modal-field-label" htmlFor="mensal-pay-amount">
                        Valor (R$)
                      </label>
                      <div className="mensal-modal-amount-wrap">
                        <span className="mensal-modal-amount-prefix" aria-hidden>
                          R$
                        </span>
                        <input
                          id={MENSALIDADES_PAY_FIELD_IDS.amount}
                          className="mensal-modal-in mensal-modal-in--amount"
                          type="text"
                          inputMode="decimal"
                          value={payForm.amount}
                          onChange={(e) => {
                            clearPayFieldError('amount');
                            setPayForm((f) => ({ ...f, amount: maskCurrency(e.target.value) }));
                          }}
                          placeholder="0,00"
                          aria-invalid={payFormErrors.amount ? 'true' : undefined}
                          aria-describedby={payFormErrors.amount ? 'mensal-pay-amount-error' : undefined}
                        />
                      </div>
                      <FieldError id="mensal-pay-amount-error">{payFormErrors.amount}</FieldError>
                    </div>
                    <div className="mensal-modal-col">
                      <DateInput
                        id={MENSALIDADES_PAY_FIELD_IDS.paid_at}
                        label="Data em que o dinheiro entrou na conta"
                        type="date"
                        value={payForm.paid_at}
                        onChange={(e) => {
                          paidAtTouchedRef.current = true;
                          clearPayFieldError('paid_at');
                          setPayForm((f) => ({ ...f, paid_at: e.target.value }));
                        }}
                        required
                        className="mensal-modal-in"
                        aria-invalid={payFormErrors.paid_at ? 'true' : undefined}
                        aria-describedby={payFormErrors.paid_at ? 'mensal-pay-paid-at-error' : undefined}
                      />
                      <FieldError id="mensal-pay-paid-at-error">{payFormErrors.paid_at}</FieldError>
                    </div>
                  </div>
                  {payForm.payment_type !== PAYMENT_CATEGORY.BUNDLE ? (
                    <div>
                      <label className="mensal-modal-field-label" htmlFor="mensal-pay-due-day">
                        Dia de vencimento
                      </label>
                      <input
                        id={MENSALIDADES_PAY_FIELD_IDS.due_day}
                        className="mensal-modal-in"
                        type="number"
                        min={1}
                        max={31}
                        value={payForm.due_day || ''}
                        onChange={(e) => {
                          clearPayFieldError('due_day');
                          setPayForm((f) => ({ ...f, due_day: e.target.value }));
                        }}
                        placeholder="1 a 31"
                        aria-invalid={payFormErrors.due_day ? 'true' : undefined}
                        aria-describedby={payFormErrors.due_day ? 'mensal-pay-due-day-error' : undefined}
                      />
                      <FieldError id="mensal-pay-due-day-error">{payFormErrors.due_day}</FieldError>
                    </div>
                  ) : null}
                  <div>
                    <div className="mensal-modal-field-label mensal-modal-field-label--spaced">
                      Forma de pagamento
                    </div>
                    <div className="mensal-modal-method-grid">
                      {(() => {
                        const list = orderedPayMethodsForModal(financeConfig);
                        return list.map((o, idx) => {
                          const active = payForm.method === o.value;
                          const iconClass = PAY_METHOD_MODAL_ICONS[o.value] || 'ti-cash';
                          return (
                            <button
                              key={o.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                setPayForm((f) => ({
                                  ...f,
                                  method: o.value,
                                  installments:
                                    o.value === MENSALIDADES_CREDIT_METHOD ? f.installments || 1 : 1,
                                  ...whenPaymentMethodChangesWithCapture(financeConfig, o.value),
                                  ...(isCashPaymentMethod(o.value) && !f.cash_received
                                    ? { cash_received: f.amount || '' }
                                    : !isCashPaymentMethod(o.value)
                                      ? { cash_received: '', formaTroco: 'pix', trocoAccount: '' }
                                      : {}),
                                }))
                              }
                              className={`mensal-modal-method-btn${active ? ' mensal-modal-method-btn--active' : ''}${idx === list.length - 1 ? ' mensal-modal-method-btn--full' : ''}`}
                            >
                              <span className={`ti ${iconClass} mensal-modal-method-btn__icon`} aria-hidden />
                              <span className="mensal-modal-method-btn__label">{o.label}</span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  {isStorageCreditMethod(payForm.method) ? (
                    <div className="form-group mensal-modal-installments">
                      <label htmlFor="mensal-pay-installments" className="mensal-modal-field-label">
                        Parcelas
                      </label>
                      <select
                        id="mensal-pay-installments"
                        className="form-input finance-compact-input mensal-modal-in"
                        value={String(payForm.installments || 1)}
                        onChange={(e) =>
                          setPayForm((f) => ({
                            ...f,
                            installments: Number(e.target.value) || 1,
                            card_brand: '',
                          }))
                        }
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={String(n)}>
                            {n}x
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <CaptureMethodSelect
                    financeConfig={financeConfig}
                    method={payForm.method}
                    value={payForm.capture_method_id}
                    id={MENSALIDADES_PAY_FIELD_IDS.capture_method_id}
                    className="form-input mensal-modal-in"
                    labelClassName="mensal-modal-field-label"
                    disabled={savingPayment}
                    error={payFormErrors.capture_method_id}
                    onChange={(captureId) =>
                      setPayForm((f) => ({
                        ...f,
                        ...whenCaptureMethodChanges(financeConfig, captureId, f.method),
                      }))
                    }
                  />
                  {isCashPaymentMethod(payForm.method) ? (
                    <>
                      <CashTrocoFields
                        payForm={payForm}
                        setPayForm={setPayFormTroco}
                        amountNum={parseCurrencyBRL(payForm.amount)}
                        academyId={academyId}
                        financeConfig={financeConfig}
                        disabled={savingPayment}
                        className="mensal-modal-troco"
                        inputClassName="mensal-modal-in"
                        labelClassName="mensal-modal-field-label"
                        cashReceivedId={MENSALIDADES_PAY_FIELD_IDS.cash_received}
                        trocoAccountId={MENSALIDADES_PAY_FIELD_IDS.trocoAccount}
                      />
                      <FieldError id="mensal-pay-cash-received-error">
                        {payFormErrors.cash_received}
                      </FieldError>
                      <FieldError id="mensal-pay-troco-account-error">
                        {payFormErrors.trocoAccount}
                      </FieldError>
                    </>
                  ) : null}
                  {hasBankAccounts ? (
                    <>
                      <BankAccountSelect
                        id={MENSALIDADES_PAY_FIELD_IDS.account}
                        academyId={academyId}
                        financeConfig={financeConfig}
                        value={payForm.account}
                        onChange={(v) => {
                          clearPayFieldError('account');
                          setPayForm((f) => ({ ...f, account: v, card_brand: '' }));
                        }}
                        label="Conta"
                        required
                        className="mensal-modal-in mensal-modal-account"
                      />
                      <FieldError id="mensal-pay-account-error">{payFormErrors.account}</FieldError>
                    </>
                  ) : (
                    <p className="text-small mensal-modal-no-accounts" role="alert">
                      Nenhuma conta configurada.{' '}
                      <Link to={EMPRESA_FINANCE_ACCOUNTS_PATH}>Configurar agora →</Link>
                    </p>
                  )}
                  <CardBrandSelect
                    financeConfig={financeConfig}
                    method={payForm.method}
                    installments={normalizeMensalidadesInstallments(payForm.method, payForm.installments)}
                    captureMethodId={payForm.capture_method_id}
                    feeReceiverId={payForm.fee_receiver_id}
                    bankAccount={payForm.account}
                    value={payForm.card_brand}
                    id={MENSALIDADES_PAY_FIELD_IDS.card_brand}
                    className="form-input mensal-modal-in"
                    labelClassName="mensal-modal-field-label"
                    disabled={savingPayment}
                    error={payFormErrors.card_brand}
                    onChange={(brand) => setPayForm((f) => ({ ...f, card_brand: brand }))}
                  />
                  <label className="mensal-modal-checkbox-row">
                    <input
                      type="checkbox"
                      checked={Boolean(payForm.saveAsPreferred)}
                      onChange={(e) => setPayForm((f) => ({ ...f, saveAsPreferred: e.target.checked }))}
                    />
                    <span>
                      Salvar como pagamento habitual deste {terms.student.toLowerCase()}
                    </span>
                  </label>
                  <div>
                    <label className="mensal-modal-field-label" htmlFor="mensal-pay-note">
                      Observação{' '}
                      <span className="mensal-modal-field-label-opt">(opcional)</span>
                    </label>
                    <textarea
                      id="mensal-pay-note"
                      className="mensal-modal-in mensal-modal-textarea"
                      value={payForm.note}
                      onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                      placeholder="Algum detalhe sobre este pagamento…"
                    />
                  </div>
                </div>
      </ModalShell>
      <ConfirmDialog
        open={Boolean(futurePaidDateLabel)}
        title="Data de pagamento futura"
        description={`A data de pagamento (${futurePaidDateLabel}) é futura. Confirma o registro mesmo assim?`}
        confirmLabel="Confirmar registro"
        confirmVariant="primary"
        loading={savingPayment}
        onConfirm={() => {
          setFuturePaidDateLabel(null);
          skipFuturePaidDateRef.current = true;
          void handleSavePayment();
        }}
        onClose={() => !savingPayment && setFuturePaidDateLabel(null)}
      />
      <ConfirmDialog
        open={Boolean(paidAtDivergenceConfirm)}
        title="Data de recebimento diferente da cobertura"
        description={paidAtDivergenceConfirm || ''}
        confirmLabel="Registrar assim mesmo"
        confirmVariant="primary"
        loading={savingPayment}
        onConfirm={() => {
          setPaidAtDivergenceConfirm(null);
          skipPaidAtDivergenceRef.current = true;
          void handleSavePayment();
        }}
        onClose={() => !savingPayment && setPaidAtDivergenceConfirm(null)}
      />
    </div>
  );
}

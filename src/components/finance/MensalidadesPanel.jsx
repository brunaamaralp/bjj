import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useLeadStore, LEAD_STATUS } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { account, databases, DB_ID, FINANCIAL_TX_COL, ACADEMIES_COL } from '../../lib/appwrite';
import { getMonthlyPayments, createPayment, updatePayment } from '../../lib/studentPayments';
import { resolveGridDisplayStatus } from '../../lib/paymentStatus';
import MonthlyPaymentGrid from './MonthlyPaymentGrid.jsx';
import PaymentExceptionsView from './PaymentExceptionsView.jsx';
import { maskCurrency, parseCurrencyBRL } from '../../lib/masks';
import useDebounce from '../../hooks/useDebounce';
import { friendlyError } from '../../lib/errorMessages';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import MensalidadesListTable from './MensalidadesListTable.jsx';
import { isRealPaymentException } from '../../lib/paymentExceptions.js';
import MensalidadesStatusFilter from './MensalidadesStatusFilter.jsx';
import { expectedAmountForStudent, expectedAmountWithCardFee } from '../../lib/paymentStatus.js';
import { formatBRL } from '../../lib/moneyBr.js';
import CollectionInadimplenciaPanel from './CollectionInadimplenciaPanel.jsx';
import './finance.css';
import { useUserRole } from '../../lib/useUserRole.js';
import NlCommandBar, { NlCommandBarTrigger } from '../NlCommandBar';
import { DateInput } from '../DateInput';
import { useTerms } from '../../lib/terminology.js';
import { isActiveStudent } from '../../lib/studentStatus.js';
import { useStudentStore } from '../../store/useStudentStore';
import {
  parseOverdueLabel,
  resolveCollectionStage,
  readCollectionSettingsFromFinanceConfig,
  readCollectionSettingsFromAcademy,
  mergeCollectionIntoFinanceConfig,
} from '../../lib/collectionRules.js';
import { getPaymentRowStatus, getReceptionDueBucket, openAmountForStudent } from '../../lib/collectionOverdue.js';
import { useAcademyLabels } from '../../hooks/useAcademyLabels.js';
import { validateBankAccountForPayment } from '../../lib/bankAccounts.js';
import BankAccountSelect from './BankAccountSelect.jsx';
import { useAcademyTurmas } from '../../hooks/useAcademyTurmas.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import { formatPaymentDateLabel, isPaymentDateInFuture } from '../../lib/validations.js';

const PAY_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartão_débito', label: 'Cartão débito' },
  { value: 'cartão_crédito', label: 'Cartão crédito' },
  { value: 'transferência', label: 'Transferência' },
];

const METHOD_LABELS = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartão_débito: 'Cartão débito',
  cartão_crédito: 'Cartão crédito',
  transferência: 'Transferência',
};

/** Ordem visual no modal (mesmos `value` do <select> anterior). */
const PAY_METHOD_MODAL_ORDER = ['pix', 'cartão_débito', 'cartão_crédito', 'dinheiro', 'transferência'];

const PAY_METHOD_MODAL_ICONS = {
  pix: 'ti-qrcode',
  dinheiro: 'ti-cash',
  cartão_débito: 'ti-credit-card',
  cartão_crédito: 'ti-credit-card',
  transferência: 'ti-building-bank',
};

function orderedPayMethodsForModal() {
  const byVal = Object.fromEntries(PAY_METHODS.map((o) => [o.value, o]));
  return PAY_METHOD_MODAL_ORDER.map((v) => byVal[v]).filter(Boolean);
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
function getRowStatus(student, payment, currentMonth) {
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
 * @param {{ embedded?: boolean }} props — embedded: dentro do hub /financeiro (sem título de página)
 */
export default function MensalidadesPanel({ embedded = false }) {
  const allStudents = useStudentStore((s) => s.students);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const storeTeamId = useLeadStore((s) => s.teamId);
  const userId = useLeadStore((s) => s.userId);
  const updateStudent = useStudentStore((s) => s.updateStudent);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const financeConfigAcademyId = useLeadStore((s) => s.financeConfigAcademyId);
  const modules = useLeadStore((s) => s.modules);
  const addToast = useUiStore((s) => s.addToast);
  const terms = useTerms();
  const { allLabels: academyLabels } = useAcademyLabels(academyId);
  const { turmas: configuredTurmas } = useAcademyTurmas(academyId);
  const [searchParams] = useSearchParams();

  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) setSearch(q);
  }, [searchParams]);
  const [dueSortOrder, setDueSortOrder] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [payForm, setPayForm] = useState({});
  const [futurePaidDateLabel, setFuturePaidDateLabel] = useState(null);
  const skipFuturePaidDateRef = useRef(false);
  const [sessionUserName, setSessionUserName] = useState('Usuário');
  const [nlOpen, setNlOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list');

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

  const isCurrentMonth = currentMonth === new Date().toISOString().slice(0, 7);

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
  }, [academyId, currentMonth]);

  const { collectionRules, overdueLabel: overdueLabelName } = useMemo(
    () => readCollectionSettingsFromFinanceConfig(financeConfig),
    [financeConfig]
  );

  useEffect(() => {
    if (!academyId || financeConfigAcademyId === academyId) return;
    let active = true;
    databases
      .getDocument(DB_ID, ACADEMIES_COL, academyId)
      .then((doc) => {
        if (!active || academyId !== useLeadStore.getState().academyId) return;
        let cfg = null;
        try {
          cfg = doc.financeConfig
            ? typeof doc.financeConfig === 'string'
              ? JSON.parse(doc.financeConfig)
              : doc.financeConfig
            : null;
        } catch {
          cfg = null;
        }
        const coll = readCollectionSettingsFromAcademy(doc);
        const merged = mergeCollectionIntoFinanceConfig(cfg || {}, coll);
        useLeadStore.getState().setFinanceConfig(merged);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [academyId, financeConfigAcademyId]);

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
  }, [academyId, currentMonth]);

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

  const prevMonth = useCallback(() => {
    const d = new Date(`${currentMonth}-02T12:00:00`);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(d.toISOString().slice(0, 7));
  }, [currentMonth]);

  const nextMonth = useCallback(() => {
    if (isCurrentMonth) return;
    const d = new Date(`${currentMonth}-02T12:00:00`);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(d.toISOString().slice(0, 7));
  }, [currentMonth, isCurrentMonth]);

  const getStatus = useCallback(
    (student) => {
      const p = paymentMap[student.id];
      return resolveGridDisplayStatus(student, p, currentMonth).key;
    },
    [paymentMap, currentMonth]
  );

  const overdueLabelId = useMemo(() => {
    const name = parseOverdueLabel(overdueLabelName).toLowerCase();
    const found = (academyLabels || []).find((l) => String(l.name || '').trim().toLowerCase() === name);
    return found?.$id || found?.id || null;
  }, [academyLabels, overdueLabelName]);

  const studentOverdueMeta = useMemo(() => {
    const map = {};
    for (const s of students) {
      const p = paymentMap[s.id];
      const row = getPaymentRowStatus(s, p, currentMonth);
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
    const q = debouncedSearch.trim().toLowerCase();
    return students
      .filter((s) => {
        if (filter === 'overdue_label') {
          if (!overdueLabelId) return false;
          return (s.labelIds || []).includes(overdueLabelId);
        }
        if (String(filter || '').startsWith('regua_')) {
          const day = Number(String(filter).replace('regua_', ''));
          const meta = studentOverdueMeta[s.id];
          if (!meta || !Number.isFinite(day)) return false;
          return Number(meta.stage?.day) === day;
        }
        if (filter === 'due_today' || filter === 'due_week' || filter === 'overdue') {
          const bucket = getReceptionDueBucket(s, paymentMap[s.id], currentMonth);
          if (filter === 'overdue') return bucket === 'overdue';
          return bucket === filter;
        }
        return filter === 'all' || getStatus(s) === filter;
      })
      .filter((s) => !q || String(s.name || '').toLowerCase().includes(q));
  }, [students, filter, debouncedSearch, getStatus, overdueLabelId, studentOverdueMeta]);

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
      const bucket = getReceptionDueBucket(s, paymentMap[s.id], currentMonth);
      if (bucket === 'due_today') dueToday += 1;
      else if (bucket === 'due_week') dueWeek += 1;
      else if (bucket === 'overdue') overdue += 1;
    }
    return { dueToday, dueWeek, overdue, paid };
  }, [students, paymentMap, currentMonth, getStatus]);

  const toggleReceptionFilter = useCallback((next) => {
    setFilter((cur) => (cur === next ? 'all' : next));
  }, []);

  const filterCounts = useMemo(() => {
    const c = {
      all: students.length,
      paid: 0,
      covered: 0,
      awaiting: 0,
      partial: 0,
      pending: 0,
      soon: 0,
      none: 0,
    };
    for (const s of students) {
      const st = getStatus(s);
      if (c[st] != null) c[st] += 1;
    }
    return c;
  }, [students, getStatus]);

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

  const expectedTotal = useMemo(() => {
    let sum = 0;
    for (const s of students) {
      const p = paymentMap[s.id];
      const amt = expectedAmountForStudent(s, financeConfig, p);
      if (Number.isFinite(amt) && amt > 0) sum += amt;
    }
    return sum;
  }, [students, financeConfig, paymentMap]);

  const openPaymentModal = (student, preset = {}) => {
    const refMonth = String(preset.reference_month || currentMonth).trim() || currentMonth;
    const day = studentDueDay(student);
    const dueDate = dueDateInMonth(refMonth, day);
    setSelectedStudent(student);
    const amountNum = Number(preset.amount);
    setPayForm({
      reference_month: refMonth,
      amount:
        Number.isFinite(amountNum) && amountNum > 0
          ? maskCurrency(String(Math.round(amountNum * 100)))
          : '',
      method: preset.method || student.preferredPaymentMethod || 'pix',
      account: student.preferredPaymentAccount || '',
      status: 'paid',
      paid_at: new Date().toISOString().slice(0, 10),
      due_date: dueDate ? dueDate.toISOString().slice(0, 10) : '',
      due_day: day ? String(day) : '',
      plan_name: preset.plan_name || student.plan || '',
      note: preset.note || '',
      saveAsPreferred: !String(student.preferredPaymentMethod || '').trim(),
    });
    setShowModal(true);
  };

  const handleNlCorrect = useCallback(
    (_parsed, detail) => {
      const sid = String(detail?.student_id || '').trim();
      const student = students.find((s) => String(s.id || '').trim() === sid);
      if (!student) return;
      openPaymentModal(student, detail);
      setNlOpen(false);
    },
    [students, currentMonth]
  );

  const handleSavePayment = async () => {
    if (!selectedStudent || !academyId || savingPayment) return;
    let amountNum = parseCurrencyBRL(payForm.amount);
    const withFee = expectedAmountWithCardFee(
      selectedStudent,
      financeConfig,
      payForm.method,
      payForm.installments,
      paymentMap[selectedStudent.id]
    );
    if (Number.isFinite(withFee) && withFee > amountNum) amountNum = withFee;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      addToast({ type: 'error', message: 'Informe um valor maior que zero.' });
      return;
    }
    const paidAtMs = new Date(String(payForm.paid_at || '').trim()).getTime();
    if (!Number.isFinite(paidAtMs)) {
      addToast({ type: 'error', message: 'Informe uma data de pagamento válida.' });
      return;
    }
    const dueDayNum = Number(String(payForm.due_day || '').replace(/[^\d]/g, ''));
    const dueDayValid = Number.isFinite(dueDayNum) && dueDayNum >= 1 && dueDayNum <= 31;
    if (String(payForm.due_day || '').trim() && !dueDayValid) {
      addToast({ type: 'error', message: 'Informe um dia de vencimento entre 1 e 31.' });
      return;
    }
    const accountCheck = validateBankAccountForPayment(payForm.account, financeConfig);
    if (!accountCheck.ok) {
      addToast({ type: 'error', message: accountCheck.message });
      return;
    }

    const paidAtYmd = String(payForm.paid_at || '').trim();
    if (!skipFuturePaidDateRef.current && isPaymentDateInFuture(paidAtYmd)) {
      setFuturePaidDateLabel(formatPaymentDateLabel(paidAtYmd));
      return;
    }
    skipFuturePaidDateRef.current = false;

    const student = selectedStudent;
    const payFormSnapshot = { ...payForm };
    const previousPayments = payments;
    const optimisticId = `optimistic-${student.id}-${Date.now()}`;
    const paidAtIso = new Date(paidAtMs).toISOString();
    const optimisticDoc = {
      $id: optimisticId,
      lead_id: student.id,
      academy_id: academyId,
      team_id: teamIdForPayments,
      amount: amountNum,
      paid_amount: amountNum,
      method: payForm.method,
      account: payForm.account || '',
      status: 'paid',
      reference_month: currentMonth,
      paid_at: paidAtIso,
      plan_name: payForm.plan_name || student.plan || '',
      note: payForm.note || '',
      registered_by: userId || '',
      registered_by_name: sessionUserName,
    };

    setShowModal(false);
    setSelectedStudent(null);
    setPayments((prev) => [
      ...(prev || []).filter((p) => String(p.lead_id) !== String(student.id)),
      optimisticDoc,
    ]);
    setSavingPayment(true);

    try {
      const doc = await createPayment({
        lead_id: student.id,
        academy_id: academyId,
        team_id: teamIdForPayments,
        amount: amountNum,
        method: payForm.method,
        account: payForm.account || '',
        status: 'paid',
        reference_month: currentMonth,
        paid_at: paidAtIso,
        due_date: null,
        registered_by: userId || '',
        registered_by_name: sessionUserName,
        plan_name: payForm.plan_name || student.plan || '',
        note: payForm.note || '',
      });
      setPayments((prev) => [
        ...(prev || []).filter(
          (p) => String(p.lead_id) !== String(student.id) && p.$id !== optimisticId
        ),
        doc,
      ]);
      let studentPrefsWarning = '';
      try {
        if (payForm.saveAsPreferred) {
          await updateStudent(student.id, {
            preferredPaymentMethod: payForm.method,
            preferredPaymentAccount: payForm.account || '',
            dueDay: dueDayValid ? dueDayNum : null,
          });
        } else if (dueDayValid || String(student?.dueDay || '').trim()) {
          await updateStudent(student.id, { dueDay: dueDayValid ? dueDayNum : null });
        }
      } catch (prefErr) {
        console.warn('[Mensalidades] updateStudent após pagamento:', prefErr);
        studentPrefsWarning =
          ' Pagamento salvo; preferências do aluno (forma de pagamento/vencimento) não foram gravadas no cadastro.';
      }
      addToast({
        type: studentPrefsWarning ? 'warning' : 'success',
        message: `Pagamento registrado.${studentPrefsWarning}`,
      });
      if (doc?.warning) {
        addToast({
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
      addToast({
        type: 'error',
        message: 'Não foi possível registrar o pagamento. Tente novamente.',
      });
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
      if (txId && FINANCIAL_TX_COL) {
        try {
          await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, { status: 'cancelled' });
        } catch (err) {
          console.error('Falha no sync financeiro após estorno:', err);
          addToast({
            type: 'warning',
            message:
              'Pagamento estornado, mas houve um problema ao atualizar o caixa. Verifique os lançamentos financeiros.',
            duration: 10000,
          });
        }
      }
      addToast({ type: 'success', message: 'Pagamento estornado.' });
    } catch (e) {
      setPayments(previousPayments);
      addToast({
        type: 'error',
        message: 'Não foi possível estornar o pagamento.',
      });
      throw e;
    }
  };

  const clearFilters = useCallback(() => {
    setFilter('all');
    setSearch('');
    setDueSortOrder(null);
  }, []);

  const hasStudentsWithPlan = useMemo(
    () => students.some((s) => String(s.plan || '').trim()),
    [students]
  );

  const hasActiveFilters = useMemo(
    () => filter !== 'all' || search.trim().length > 0,
    [filter, search]
  );

  const fmtMoney = formatBRL;

  return (
    <div
      className={`mensalidades-page animate-in${embedded ? ' mensalidades-panel--embedded' : ''}`}
      style={
        embedded
          ? { width: '100%', boxSizing: 'border-box' }
          : {
              padding: 24,
              maxWidth: 1040,
              margin: '0 auto',
              boxSizing: 'border-box',
              background: 'var(--surface, #fff)',
              width: '100%',
            }
      }
    >
      <style>
        {`
          @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.17.0/dist/tabler-icons.min.css');
          .mensalidades-page .mensal-modal-field-label,
          .mensalidades-modal-scope .mensal-modal-field-label {
            display: block;
            margin-bottom: 6px;
            font-size: 12px;
            font-weight: 500;
            color: var(--color-text-secondary, var(--text-secondary));
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .mensalidades-page .mensal-modal-field-label-opt,
          .mensalidades-modal-scope .mensal-modal-field-label-opt {
            font-weight: 400;
            text-transform: none;
            letter-spacing: normal;
          }
          .mensalidades-page .mensal-table-wrap {
            background: var(--surface, #fff);
            border: 0.5px solid var(--border-light, #e8e8ef);
            border-radius: 10px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .mensalidades-page .mensal-table { width: 100%; border-collapse: collapse; min-width: 720px; }
          .mensalidades-page .mensal-table thead { background: var(--surface-hover, #f4f4f8); }
          .mensalidades-page .mensal-table th {
            font-size: 10px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em;
            padding: 10px 16px; text-align: left;
          }
          .mensalidades-page .mensal-table td {
            padding: 12px 16px; font-size: 12px; color: var(--text-primary, var(--text, #1a1a1a));
            border-top: 0.5px solid var(--border-light, #e8e8ef); vertical-align: middle;
          }
          .mensalidades-page .mensal-table tbody tr:hover td { background: var(--surface-hover, #f4f4f8); }
          .mensalidades-page .mensal-chip {
            font-size: 11px;
            padding: 5px 12px;
            border-radius: 20px;
            border: 0.5px solid var(--border-light, #e8e8ef);
            background: var(--surface, #fff);
            color: var(--text-secondary);
            cursor: pointer;
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            box-sizing: border-box;
          }
          .mensalidades-page .mensal-chip--active { background: #5B3FBF; color: #fff; border-color: #5B3FBF; }
          .mensalidades-page .mensal-search:focus { border-color: #5B3FBF !important; outline: none; }
          .mensalidades-page .mensal-btn-pay { background: #5B3FBF; color: #fff; border: none; font-size: 11px; font-weight: 500; padding: 6px 14px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
          .mensalidades-page .mensal-btn-pay:hover { background: #4a31a0; }
          .mensalidades-page .mensal-btn-estornar { background: var(--surface, #fff); color: var(--text-secondary); border: 0.5px solid var(--border-light, #e8e8ef); font-size: 11px; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
          .mensalidades-page .mensal-btn-estornar:hover { background: #fef2f2; color: #A32D2D; border-color: #F7C1C1; }
          .mensalidades-page .mensal-modal-in,
          .mensalidades-modal-scope .mensal-modal-in {
            border: 0.5px solid var(--color-border-secondary, var(--border-light, #e8e8ef));
            border-radius: var(--border-radius-md, var(--radius-sm));
            padding: 10px 12px;
            font-size: 14px;
            width: 100%;
            box-sizing: border-box;
            background: var(--color-background-secondary, var(--surface-hover, #f4f4f8));
            color: var(--text-primary, inherit);
            font-family: inherit;
            line-height: 1.35;
          }
          .mensalidades-page .mensal-modal-in--amount,
          .mensalidades-modal-scope .mensal-modal-in--amount {
            padding-left: 36px;
            font-size: 20px;
            font-weight: 500;
            color: var(--color-text-primary, var(--text-primary, inherit));
            background: var(--color-background-secondary, var(--surface-hover, #f4f4f8));
            border: 0.5px solid var(--color-border-secondary, var(--border-light, #e8e8ef));
            border-radius: var(--border-radius-md, var(--radius-sm));
            height: 48px;
            width: 100%;
          }
          .mensalidades-page .mensal-modal-in[type="number"],
          .mensalidades-modal-scope .mensal-modal-in[type="number"] {
            height: 48px;
            font-size: 15px;
            font-weight: 500;
          }
          .mensalidades-page .mensal-modal-account,
          .mensalidades-modal-scope .mensal-modal-account {
            background: var(--color-background-secondary, var(--surface-hover, #f4f4f8));
            border: 0.5px solid var(--color-border-secondary, var(--border-light, #e8e8ef));
            border-radius: var(--border-radius-md, var(--radius-sm));
            padding: 10px 12px;
            font-size: 14px;
            color: var(--color-text-primary, var(--text-primary, inherit));
            height: 48px;
            width: 100%;
            outline: none;
            font-family: inherit;
          }
          .mensalidades-page .mensal-modal-account::placeholder,
          .mensalidades-modal-scope .mensal-modal-account::placeholder {
            color: var(--color-text-tertiary, var(--text-secondary));
          }
          .mensalidades-page .mensal-modal-textarea,
          .mensalidades-modal-scope .mensal-modal-textarea {
            background: var(--color-background-secondary, var(--surface-hover, #f4f4f8));
            border: 0.5px solid var(--color-border-secondary, var(--border-light, #e8e8ef));
            border-radius: var(--border-radius-md, var(--radius-sm));
            padding: 10px 12px;
            font-size: 14px;
            color: var(--color-text-primary, var(--text-primary, inherit));
            min-height: 88px;
            width: 100%;
            resize: vertical;
            max-height: 160px;
            outline: none;
            font-family: inherit;
            line-height: 1.45;
          }
          .mensalidades-page .mensal-modal-textarea::placeholder,
          .mensalidades-modal-scope .mensal-modal-textarea::placeholder {
            color: var(--color-text-tertiary, var(--text-secondary));
          }
          .mensalidades-page .mensal-modal-in:focus,
          .mensalidades-page .mensal-modal-account:focus,
          .mensalidades-page .mensal-modal-textarea:focus,
          .mensalidades-modal-scope .mensal-modal-in:focus,
          .mensalidades-modal-scope .mensal-modal-account:focus,
          .mensalidades-modal-scope .mensal-modal-textarea:focus {
            border-color: #5B3FBF;
            background: var(--color-background-primary, var(--surface, #fff));
            outline: none;
          }
          .mensalidades-modal-scope .mensal-modal-checkbox-row {
            margin-top: 2px;
            padding: 12px 14px;
            border-radius: var(--border-radius-md, var(--radius-sm));
            background: var(--surface-hover, #f4f4f8);
            border: 0.5px solid var(--border-light, #e8e8ef);
            font-size: 13px;
            color: var(--text-primary, var(--text));
            line-height: 1.4;
          }
          .mensalidades-modal-scope .mensal-modal-checkbox-row input[type="checkbox"] {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
            accent-color: #5B3FBF;
            cursor: pointer;
            margin-top: 2px;
          }
          .mensalidades-page input[type="date"].mensal-modal-in,
          .mensalidades-modal-scope input[type="date"].mensal-modal-in {
            min-height: 48px;
          }
          .mensalidades-modal-scope .mensal-pay-top-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            align-items: start;
          }
          @media (max-width: 420px) {
            .mensalidades-modal-scope .mensal-pay-top-grid {
              grid-template-columns: 1fr;
            }
            .mensalidades-modal-scope .mensalidades-modal-footer {
              flex-direction: column;
            }
            .mensalidades-modal-scope .mensalidades-modal-footer button {
              flex: 1 1 auto !important;
              width: 100%;
            }
          }
          @media (max-width: 900px) {
            .mensalidades-page .mensal-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          }
          @media (max-width: 720px) {
            .mensalidades-page .mensal-table-wrap { border-radius: 0; }
            .mensalidades-page .mensal-table th,
            .mensalidades-page .mensal-table td { padding: 10px 10px; }
          }
          @media (max-width: 480px) {
            .mensalidades-page .mensal-summary-grid { grid-template-columns: 1fr !important; }
          }
        `}
      </style>

      <header className="mensal-header">
        <div className="mensal-header__top">
          <div>
            {!embedded ? (
              <>
                <h1 className="navi-page-title">Mensalidades</h1>
                <p className="navi-eyebrow mensal-header__eyebrow">
                  Controle de pagamentos{academyName ? ` · ${academyName}` : ''}
                </p>
              </>
            ) : (
              <p className="navi-eyebrow mensal-header__eyebrow" style={{ margin: 0 }}>
                Mês de referência
                {academyName ? ` · ${academyName}` : ''}
              </p>
            )}
          </div>
          <div className="mensal-month-picker" aria-label="Selecionar mês">
            <button type="button" className="mensal-month-picker__btn" onClick={prevMonth} aria-label="Mês anterior">
              <ChevronLeft size={18} strokeWidth={2} />
            </button>
            <span className="mensal-month-picker__label">{formatMonthTitleCapitalized(currentMonth)}</span>
            <button
              type="button"
              className="mensal-month-picker__btn"
              onClick={nextMonth}
              disabled={isCurrentMonth}
              aria-label="Próximo mês"
            >
              <ChevronRight size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        {modules?.finance === true ? (
          <div className="mensal-page-tabs" role="tablist" aria-label="Visualização">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'list'}
              className={`mensal-page-tab${viewMode === 'list' ? ' mensal-page-tab--active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              Lista
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'grid'}
              className={`mensal-page-tab${viewMode === 'grid' ? ' mensal-page-tab--active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              Grade do mês
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'exceptions'}
              className={`mensal-page-tab${viewMode === 'exceptions' ? ' mensal-page-tab--active' : ''}`}
              onClick={() => setViewMode('exceptions')}
              title="Alunos com pagamento em atraso, parcial ou divergente"
            >
              Pendências
              {exceptionCount > 0 ? (
                <span className="mensal-page-tab__badge" title="Alunos com pagamento em atraso, parcial ou divergente">
                  {exceptionCount}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}

        <div className="mensal-toolbar">
          <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
          <input
            type="search"
            className="form-input mensal-search"
            placeholder={`Buscar ${terms.student.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {viewMode === 'list' ? (
            <MensalidadesStatusFilter
              filter={filter}
              onFilterChange={setFilter}
              filterCounts={filterCounts}
              reguaFilterChips={reguaFilterChips}
              collectionRules={collectionRules}
              overdueLabelName={parseOverdueLabel(overdueLabelName)}
              overdueLabelCount={students.filter((s) => (s.labelIds || []).includes(overdueLabelId)).length}
              overdueLabelId={overdueLabelId}
            />
          ) : null}
        </div>

      </header>

      {viewMode === 'list' && collectionDashboard.total > 0 ? (
        <section
          style={{
            marginBottom: 20,
            padding: '14px 16px',
            borderRadius: 10,
            border: '0.5px solid var(--border-light, #e8e8ef)',
            background: 'var(--surface, #fff)',
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: 'var(--text)' }}>
            Régua de cobrança · {formatMonthTitleCapitalized(currentMonth)}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: '#A32D2D' }}>{collectionDashboard.total}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Inadimplentes (D+1+)</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{fmtMoney(collectionDashboard.totalOpen)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Valor em aberto</div>
            </div>
            {collectionRules.map((rule) => (
              <div key={rule.day}>
                <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>
                  {collectionDashboard.byStage[String(rule.day)] || 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  D+{rule.day} · {rule.label}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {viewMode === 'list' && collectionDashboard.total > 0 ? (
        <CollectionInadimplenciaPanel
          students={students}
          studentOverdueMeta={studentOverdueMeta}
          paymentMap={paymentMap}
          collectionRules={collectionRules}
          currentMonth={currentMonth}
          financeConfig={financeConfig}
        />
      ) : null}

      {viewMode === 'grid' && modules?.finance === true ? (
        <>
        <p className="mensal-tab-subtitle">Marque pagamentos enquanto confere o extrato</p>
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
          terms={terms}
          addToast={addToast}
          friendlyError={friendlyError}
          loading={loading}
        />
        </>
      ) : null}

      {viewMode === 'exceptions' && modules?.finance === true ? (
        <>
        <p className="mensal-tab-subtitle">Casos que precisam de atenção ativa</p>
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
          terms={terms}
          addToast={addToast}
          friendlyError={friendlyError}
          loading={loading}
        />
        </>
      ) : null}

      {viewMode === 'list' ? (
      <>
      <p className="mensal-tab-subtitle">Prioridades do dia — clique no card para ver na lista</p>
      {!loading ? (
      <section className="mensal-summary-block">
﻿        <div className="mensal-summary-grid mensal-summary-grid--reception">
          <button
            type="button"
            className={`mensal-summary-card mensal-summary-card--clickable mensal-summary-card--today${filter === 'due_today' ? ' mensal-summary-card--active' : ''}`}
            onClick={() => toggleReceptionFilter('due_today')}
          >
            <div className="mensal-summary-card__value">{receptionSummary.dueToday}</div>
            <div className="mensal-summary-card__label">Vencendo hoje</div>
          </button>
          <button
            type="button"
            className={`mensal-summary-card mensal-summary-card--clickable mensal-summary-card--soon${filter === 'due_week' ? ' mensal-summary-card--active' : ''}`}
            onClick={() => toggleReceptionFilter('due_week')}
          >
            <div className="mensal-summary-card__value">{receptionSummary.dueWeek}</div>
            <div className="mensal-summary-card__label">Vence em até 7 dias</div>
          </button>
          <button
            type="button"
            className={`mensal-summary-card mensal-summary-card--clickable mensal-summary-card--pending${filter === 'overdue' ? ' mensal-summary-card--active' : ''}`}
            onClick={() => toggleReceptionFilter('overdue')}
          >
            <div className="mensal-summary-card__value">{receptionSummary.overdue}</div>
            <div className="mensal-summary-card__label">Inadimplentes</div>
          </button>
          <button
            type="button"
            className={`mensal-summary-card mensal-summary-card--clickable mensal-summary-card--paid${filter === 'paid' ? ' mensal-summary-card--active' : ''}`}
            onClick={() => toggleReceptionFilter('paid')}
          >
            <div className="mensal-summary-card__value">{receptionSummary.paid}</div>
            <div className="mensal-summary-card__label">Pagos no mês</div>
          </button>
        </div>
        <p className="mensal-reception-hint">
          Para alterar um pagamento já registrado: use <strong>Estornar</strong> na linha paga e registre de novo.
          Na aba <strong>Grade</strong>, clique no status para ajustar valor e data.
          Totais recebidos: <strong>Relatórios</strong> ou <strong>Caixa</strong>.
        </p>
      </section>
      ) : null}

      {loadingError ? (
        <div className="mensal-error-banner">
          <span>Erro ao carregar pagamentos do mês.</span>
          <button type="button" onClick={() => void recarregarMes()}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      <MensalidadesListTable
        loading={loading}
        displayedStudents={displayedStudents}
        hasStudentsWithPlan={hasStudentsWithPlan}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        terms={terms}
        paymentMap={paymentMap}
        currentMonth={currentMonth}
        getRowStatus={getRowStatus}
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
        canReverse={navRole === 'owner'}
      />      </>
      ) : null}

      {showModal && selectedStudent && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="navi-modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mensalidades-modal-title"
              onClick={() => {
                if (!savingPayment) setShowModal(false);
              }}
              style={{
                zIndex: 2500,
              }}
            >
              <div
                className="mensalidades-modal-scope"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'var(--surface, #fff)',
                  borderRadius: 14,
                  padding: 0,
                  width: '100%',
                  maxWidth: 440,
                  maxHeight: 'calc(100vh - 32px)',
                  overflowY: 'auto',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                  boxSizing: 'border-box',
                }}
              >
                <header
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16,
                    padding: '24px 24px 20px',
                    borderBottom: '0.5px solid var(--color-border-tertiary, var(--border-light, #e8e8ef))',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      id="mensalidades-modal-title"
                      style={{
                        fontSize: 17,
                        fontWeight: 500,
                        color: 'var(--text-primary, var(--text))',
                        lineHeight: 1.3,
                      }}
                    >
                      {selectedStudent.name}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 6,
                        fontSize: 13,
                        color: 'var(--color-text-secondary, var(--text-secondary))',
                      }}
                    >
                      <span className="ti ti-calendar" style={{ fontSize: 13, lineHeight: 1 }} aria-hidden />
                      {formatMonthTitleCapitalized(currentMonth)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar"
                    disabled={savingPayment}
                    onClick={() => {
                      if (!savingPayment) setShowModal(false);
                    }}
                    style={{
                      flexShrink: 0,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: 'none',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--color-background-secondary, var(--surface-hover, #f4f4f8))',
                      color: 'var(--color-text-secondary, var(--text-secondary))',
                      cursor: savingPayment ? 'not-allowed' : 'pointer',
                      opacity: savingPayment ? 0.5 : 1,
                    }}
                  >
                    <span className="ti ti-x" style={{ fontSize: 16, lineHeight: 1 }} aria-hidden />
                  </button>
                </header>

                <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="mensal-pay-top-grid">
                    <div style={{ minWidth: 0 }}>
                      <label className="mensal-modal-field-label" htmlFor="mensal-pay-amount">
                        Valor (R$)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: 12,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--color-text-secondary, var(--text-secondary))',
                            fontSize: 14,
                            pointerEvents: 'none',
                            lineHeight: 1,
                          }}
                          aria-hidden
                        >
                          R$
                        </span>
                        <input
                          id="mensal-pay-amount"
                          className="mensal-modal-in mensal-modal-in--amount"
                          type="text"
                          inputMode="decimal"
                          value={payForm.amount}
                          onChange={(e) => setPayForm((f) => ({ ...f, amount: maskCurrency(e.target.value) }))}
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <DateInput
                        label="Data do pagamento"
                        type="date"
                        value={payForm.paid_at}
                        onChange={(e) => setPayForm((f) => ({ ...f, paid_at: e.target.value }))}
                        required
                        className="mensal-modal-in"
                        labelStyle={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--color-text-secondary, var(--text-secondary))',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mensal-modal-field-label" htmlFor="mensal-pay-due-day">
                      Dia de vencimento
                    </label>
                    <input
                      id="mensal-pay-due-day"
                      className="mensal-modal-in"
                      type="number"
                      min={1}
                      max={31}
                      value={payForm.due_day || ''}
                      onChange={(e) => setPayForm((f) => ({ ...f, due_day: e.target.value }))}
                      placeholder="1 a 31"
                    />
                  </div>
                  <div>
                    <div className="mensal-modal-field-label" style={{ marginBottom: 6 }}>
                      Forma de pagamento
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 6,
                      }}
                    >
                      {(() => {
                        const list = orderedPayMethodsForModal();
                        return list.map((o, idx) => {
                          const active = payForm.method === o.value;
                          const iconClass = PAY_METHOD_MODAL_ICONS[o.value] || 'ti-cash';
                          return (
                            <button
                              key={o.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setPayForm((f) => ({ ...f, method: o.value }))}
                              style={{
                                gridColumn: idx === list.length - 1 ? '1 / -1' : undefined,
                                background: active ? '#EEEDFE' : 'var(--color-background-secondary, var(--surface-hover, #f4f4f8))',
                                border: active ? '0.5px solid #5B3FBF' : '0.5px solid var(--color-border-tertiary, var(--border-light, #e8e8ef))',
                                borderRadius: 'var(--border-radius-md, var(--radius-sm))',
                                padding: '8px 4px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                                color: active ? '#3C3489' : 'var(--text-primary, var(--text))',
                                font: 'inherit',
                              }}
                            >
                              <span className={`ti ${iconClass}`} style={{ fontSize: 18, lineHeight: 1 }} aria-hidden />
                              <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>{o.label}</span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  <BankAccountSelect
                    id="mensal-pay-account"
                    academyId={academyId}
                    financeConfig={financeConfig}
                    value={payForm.account}
                    onChange={(v) => setPayForm((f) => ({ ...f, account: v }))}
                    label="Conta"
                    required
                    className="mensal-modal-in mensal-modal-account"
                    labelStyle={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-secondary, var(--text-muted))',
                      marginBottom: 6,
                    }}
                  />
                  <label className="mensal-modal-checkbox-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', margin: 0 }}>
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

                <footer
                  className="mensalidades-modal-footer"
                  style={{
                    borderTop: '0.5px solid var(--color-border-tertiary, var(--border-light, #e8e8ef))',
                    padding: '16px 24px 24px',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'stretch',
                  }}
                >
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setShowModal(false)}
                    disabled={savingPayment}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      fontWeight: 600,
                      opacity: savingPayment ? 0.55 : 1,
                      cursor: savingPayment ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={savingPayment}
                    onClick={() => void handleSavePayment()}
                    style={{
                      flex: 2,
                      minHeight: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontWeight: 600,
                      cursor: savingPayment ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span className="ti ti-check" style={{ fontSize: 18, lineHeight: 1 }} aria-hidden />
                    {savingPayment ? 'Salvando…' : 'Confirmar pagamento'}
                  </button>
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}
      <NlCommandBar
        open={nlOpen}
        onOpenChange={setNlOpen}
        academyName={academyName}
        recentPayments={recentPaymentsForNl}
        onCorrect={handleNlCorrect}
      />

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
    </div>
  );
}

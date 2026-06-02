import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EMPRESA_FINANCE_CONFIG_PATH } from '../../lib/financeiroHubTabs.js';
import { CASH_CLOSING_UPDATED_EVENT } from '../../lib/financeTermHints.js';
import { fetchMonthlyClosing, createFinanceTx, recordCashClosing } from '../../lib/financeTxApi.js';
import { getMonthlyPayments } from '../../lib/studentPayments';
import { useLeadStore } from '../../store/useLeadStore';
import { useStudentStore } from '../../store/useStudentStore';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { maskCurrency, parseCurrencyBRL } from '../../lib/masks';
import { isStudentRecord, isActiveStudent } from '../../lib/studentStatus.js';
import useDebounce from '../../hooks/useDebounce.js';
import useMatchMobile from '../../hooks/useMatchMobile.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import { DateInputField } from '../DateInput';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import SearchField from '../shared/SearchField.jsx';
import FinanceFiltersBar, { FinanceToolbarSelect } from './FinanceFiltersBar.jsx';
import { formatPaymentMethod as formatPaymentMethodLabel } from '../../lib/paymentMethodLabels.js';
import {
  buildClosingRows,
  filterClosingRows,
  sortClosingRows,
  computeClosingTotals,
  exportClosingCsv,
  CLOSING_ORIGINS,
  CLOSING_ORIGIN_LABELS,
  CLOSING_SITUATIONS,
  CLOSING_SITUATION_LABELS,
  mapOriginToTxType,
} from '../../lib/monthlyClosing.js';
import FinanceRegimeToggle from './FinanceRegimeToggle.jsx';
import { FINANCE_REGIME, getFinanceRegime } from '../../lib/financeCompetence.js';
import { fetchReportsFinanceLight } from '../../lib/reportsLightApi.js';
import { useUserRole } from '../../lib/useUserRole.js';
import {
  CheckCircle,
  Clock,
  Download,
  Plus,
  Receipt,
} from 'lucide-react';

const PAY_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartão_débito', label: 'Cartão de débito' },
  { value: 'cartão_crédito', label: 'Cartão de crédito' },
  { value: 'transferência', label: 'Transferência' },
];

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ClosingSituationBadge({ situation, table = false }) {
  const sit = String(situation || 'pendente');
  return (
    <span
      className={[
        'monthly-closing-sit-badge',
        `monthly-closing-sit-badge--${sit}`,
        table ? 'monthly-closing-sit-badge--table' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {CLOSING_SITUATION_LABELS[sit] || sit}
    </span>
  );
}

export default function MonthlyClosingTab({
  academyId,
  academyName,
  financeConfig,
  modules,
  referenceMonth: referenceMonthProp,
  onReferenceMonthChange,
}) {
  const leads = useStudentStore((s) => s.students);
  const academyList = useLeadStore((s) => s.academyList);
  const addToast = useUiStore((s) => s.addToast);
  const isMobile = useMatchMobile();
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);

  const [referenceMonthInternal, setReferenceMonthInternal] = useState(currentYm);
  const referenceMonth = referenceMonthProp ?? referenceMonthInternal;
  const setReferenceMonth = onReferenceMonthChange ?? setReferenceMonthInternal;
  const [regime, setRegime] = useState(() => (academyId ? getFinanceRegime(academyId) : FINANCE_REGIME.CASH));
  const [operationalReceived, setOperationalReceived] = useState(null);
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [originFilter, setOriginFilter] = useState(() => new Set(CLOSING_ORIGINS));
  const [situationFilter, setSituationFilter] = useState(() => new Set(CLOSING_SITUATIONS));
  const [methodFilter, setMethodFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);
  const [showManual, setShowManual] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [closingPartialWarning, setClosingPartialWarning] = useState(false);
  const [cashClosing, setCashClosing] = useState(null);
  const [savingClosing, setSavingClosing] = useState(false);
  const [manualForm, setManualForm] = useState({
    lead_id: '',
    studentQuery: '',
    description: '',
    gross: '',
    method: 'pix',
    account: '',
    date: new Date().toISOString().slice(0, 10),
    origin: 'outro',
  });

  const salesEnabled = modules?.sales === true;

  const availableOrigins = useMemo(() => {
    if (salesEnabled) return CLOSING_ORIGINS;
    return CLOSING_ORIGINS.filter((o) => o !== 'produto');
  }, [salesEnabled]);

  const leadById = useMemo(() => {
    const map = new Map();
    for (const l of leads || []) {
      if (l?.id) map.set(String(l.id), l);
    }
    return map;
  }, [leads]);

  const [pendingInMonth, setPendingInMonth] = useState(0);
  const academyDoc = useMemo(
    () => (academyList || []).find((a) => a.id === academyId) || null,
    [academyList, academyId]
  );
  const navRole = useUserRole(academyDoc);
  const canRegisterClosing = navRole === 'owner' || navRole === 'admin';

  const loadData = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    try {
      const ym = referenceMonth;
      try {
        const data = await fetchMonthlyClosing({ academyId, month: ym, regime });
        setPayments(data.payments || []);
        setTransactions(data.transactions || []);
        setPendingInMonth(Number(data.pendingInMonth) || 0);
        setCashClosing(data.cashClosing || null);
        setClosingPartialWarning(false);
      } catch {
        const payDocs = await getMonthlyPayments(academyId, ym);
        setPayments(payDocs);
        setTransactions([]);
        setPendingInMonth(0);
        setCashClosing(null);
        setClosingPartialWarning(true);
      }
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: friendlyError(e, 'load') });
      setPayments([]);
      setTransactions([]);
      setCashClosing(null);
    } finally {
      setLoading(false);
    }
  }, [academyId, referenceMonth, regime, addToast]);

  useEffect(() => {
    if (academyId) setRegime(getFinanceRegime(academyId));
  }, [academyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const onPayment = () => void loadData();
    window.addEventListener('navi-student-payment-updated', onPayment);
    return () => window.removeEventListener('navi-student-payment-updated', onPayment);
  }, [loadData]);

  const allRows = useMemo(() => {
    const { rows } = buildClosingRows({
      payments,
      transactions,
      leadById,
      financeConfig,
      referenceMonth,
      regime,
    });
    return rows.filter((r) => r.origin !== 'produto' || salesEnabled);
  }, [payments, transactions, leadById, financeConfig, referenceMonth, salesEnabled, regime]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!academyId || !referenceMonth) {
        setOperationalReceived(null);
        return;
      }
      const [y, m] = referenceMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const from = `${referenceMonth}-01`;
      const to = `${referenceMonth}-${String(lastDay).padStart(2, '0')}`;
      try {
        const body = await fetchReportsFinanceLight({ academyId, from, to, regime });
        if (active) setOperationalReceived(Number(body.received) || 0);
      } catch {
        if (active) setOperationalReceived(null);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [academyId, referenceMonth, regime]);

  const methodOptions = useMemo(() => {
    const set = new Set();
    for (const r of allRows) {
      if (r.paymentMethodKey) set.add(r.paymentMethodKey);
    }
    return Array.from(set).sort();
  }, [allRows]);

  const unclassifiedCount = useMemo(
    () => allRows.filter((r) => r.categoryUnclassified).length,
    [allRows]
  );

  const filteredRows = useMemo(() => {
    const origins = new Set(
      [...originFilter].filter((o) => availableOrigins.includes(o))
    );
    return filterClosingRows(allRows, {
      origins,
      situations: situationFilter,
      paymentMethodKey: methodFilter,
      search: debouncedSearch,
    });
  }, [allRows, originFilter, situationFilter, methodFilter, debouncedSearch, availableOrigins]);

  const sortedRows = useMemo(() => sortClosingRows(filteredRows, sortBy), [filteredRows, sortBy]);
  const totals = useMemo(() => computeClosingTotals(sortedRows), [sortedRows]);

  const totalsDiverge =
    operationalReceived != null && Math.abs(totals.received - operationalReceived) > 0.01;

  const studentMatches = useMemo(() => {
    const q = String(manualForm.studentQuery || '').trim().toLowerCase();
    if (q.length < 2) return [];
    return (leads || [])
      .filter((l) => isStudentRecord(l) && isActiveStudent(l))
      .filter((l) => String(l.name || '').toLowerCase().includes(q))
      .slice(0, 10);
  }, [leads, manualForm.studentQuery]);

  const fmtMoney = (n) => {
    try {
      return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${Number(n || 0).toFixed(2)}`;
    }
  };


  const toggleOrigin = (key) => {
    setOriginFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) return new Set(availableOrigins);
      return next;
    });
  };

  const toggleSituation = (key) => {
    setSituationFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) return new Set(CLOSING_SITUATIONS);
      return next;
    });
  };

  const handleExport = () => {
    const { body, fileName } = exportClosingCsv(sortedRows, { academyName, referenceMonth });
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: 'success', message: 'CSV exportado.' });
  };

  const saveManualReceipt = async () => {
    const grossNum = parseCurrencyBRL(manualForm.gross);
    if (!academyId || !Number.isFinite(grossNum) || grossNum <= 0) {
      addToast({ type: 'error', message: 'Informe um valor válido.' });
      return;
    }
    const desc = String(manualForm.description || '').trim();
    if (!desc) {
      addToast({ type: 'error', message: 'Informe a descrição.' });
      return;
    }
    setSavingManual(true);
    try {
      const settledAt = manualForm.date
        ? new Date(`${manualForm.date}T12:00:00`).toISOString()
        : new Date().toISOString();
      const txType = mapOriginToTxType(manualForm.origin);
      const row = await createFinanceTx({
        academyId,
        payload: {
          lead_id: manualForm.lead_id || '',
          method: manualForm.method,
          type: txType,
          planName: desc,
          gross: grossNum,
          note: desc,
          receive_now: true,
          settledAt,
        },
      });
      setTransactions((prev) => [row, ...prev]);
      setShowManual(false);
      setManualForm({
        lead_id: '',
        studentQuery: '',
        description: '',
        gross: '',
        method: 'pix',
        account: '',
        date: new Date().toISOString().slice(0, 10),
        origin: 'outro',
      });
      addToast({ type: 'success', message: 'Recebimento lançado.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingManual(false);
    }
  };

  const registerClosing = async () => {
    if (!academyId || savingClosing || cashClosing) return;
    setSavingClosing(true);
    try {
      const snapshot = {
        referenceMonth,
        regime,
        totals: computeClosingTotals(sortedRows),
      };
      await recordCashClosing({ academyId, referenceMonth, snapshot });
      addToast({ type: 'success', message: 'Mês marcado como conferido.' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(CASH_CLOSING_UPDATED_EVENT, {
            detail: { referenceMonth, academyId },
          })
        );
      }
      setShowRegisterDialog(false);
      await loadData();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingClosing(false);
    }
  };

  const cashClosingLabel = useMemo(() => {
    const iso = String(cashClosing?.closed_at || '').trim();
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [cashClosing?.closed_at]);

  return (
    <section className="mt-4 animate-in monthly-closing-tab">
      <div className="monthly-closing-tab__head">
        <div className="monthly-closing-tab__head-main">
          <h3 className="navi-section-heading monthly-closing-tab__head-title">Conferência do mês</h3>
          <p className="text-small text-muted monthly-closing-tab__lead">
            Painel de conferência — não trava lançamentos nem gera documento de fechamento.
          </p>
          <div className="monthly-closing-status-badge">
            {cashClosing ? (
              <>
                <CheckCircle size={14} aria-hidden />
                <span>Conferido em {cashClosingLabel}</span>
              </>
            ) : (
              <>
                <Clock size={14} aria-hidden />
                <span>Não conferido</span>
              </>
            )}
          </div>
        </div>
        <div className="monthly-closing-tab__head-actions">
          <button type="button" className="btn-outline btn-sm" onClick={handleExport} disabled={!sortedRows.length}>
            <Download size={14} className="monthly-closing-btn-icon" aria-hidden />
            Exportar CSV
          </button>
          {canRegisterClosing ? (
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => setShowRegisterDialog(true)}
              disabled={Boolean(cashClosing) || savingClosing}
            >
              Marcar mês como conferido
            </button>
          ) : null}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowManual((v) => !v)}>
            <Plus size={14} className="monthly-closing-btn-icon--sm" aria-hidden />
            Lançar recebimento
          </button>
        </div>
      </div>

      {cashClosing ? (
        <p className="text-small monthly-closing-dre-hint" role="status">
          Confira o DRE do mês em{' '}
          <Link to="/reports?tab=financeiro">Relatórios →</Link>
        </p>
      ) : null}
      {academyId ? (
        <FinanceRegimeToggle academyId={academyId} value={regime} onChange={setRegime} className="mb-2" />
      ) : null}
      <p className="text-xs text-muted monthly-closing-regime-note" role="status">
        {regime === FINANCE_REGIME.COMPETENCE
          ? 'Na conferência: mensalidades pelo mês de referência; demais lançamentos por competência (fallback: data de pagamento).'
          : 'Na conferência: transações pelo mês de liquidação (data de recebimento no Caixa).'}
      </p>
      {closingPartialWarning ? (
        <ErrorBanner
          className="mb-3"
          message="Alguns dados não puderam ser carregados. A conferência pode estar incompleta — vendas e outros lançamentos podem estar faltando."
          onRetry={() => void loadData()}
        />
      ) : null}
      {totalsDiverge ? (
        <div className="card mb-3 monthly-closing-alert" role="alert">
          <strong>Divergência — verifique o regime de visualização</strong>
          <p className="text-small monthly-closing-alert__text">
            Conferência: {fmtMoney(totals.received)} · Relatório operacional: {fmtMoney(operationalReceived)}.
            Use o mesmo regime (caixa ou competência) nos dois painéis ou confira lançamentos sem competência
            definida.
          </p>
        </div>
      ) : null}
      {unclassifiedCount > 0 ? (
        <div className="card mb-3 monthly-closing-alert" role="alert">
          <strong>{unclassifiedCount}</strong> lançamento(s) com categoria não mapeada no plano fixo. Revise em
          Movimentações ou ajuste o diário contábil.{' '}
          <Link to={EMPRESA_FINANCE_CONFIG_PATH}>Ver Configuração →</Link>
        </div>
      ) : null}
      {pendingInMonth > 0 ? (
        <div className="card mb-3 monthly-closing-alert" role="alert">
          <strong>{pendingInMonth}</strong> lançamento(s) ainda pendente(s) no caixa neste mês. Liquide ou cancele em
          Movimentações antes de considerar o mês fechado.{' '}
          <Link to="/financeiro?tab=movimentacoes">Ver lançamentos →</Link>
        </div>
      ) : null}
      {totals.pending > 0 ? (
        <div className="card mb-3 monthly-closing-alert" role="alert">
          Existem mensalidades pendentes na conferência.{' '}
          <Link to="/financeiro?tab=mensalidades&filtro=pending">Ver Mensalidades →</Link>
        </div>
      ) : null}

      {showManual ? (
        <div className="card mb-3 monthly-closing-manual">
          <div className="monthly-closing-manual__row">
            <div className="form-group monthly-closing-manual__field monthly-closing-manual__field--student">
              <label className="text-xs">Aluno (opcional)</label>
              <input
                className="form-input"
                value={manualForm.studentQuery}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, studentQuery: e.target.value, lead_id: '' }))
                }
                placeholder="Buscar por nome…"
              />
              {studentMatches.length > 0 && !manualForm.lead_id ? (
                <div className="card monthly-closing-student-picker">
                  {studentMatches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="btn-action-ghost monthly-closing-student-picker__option"
                      onClick={() =>
                        setManualForm((f) => ({
                          ...f,
                          lead_id: s.id,
                          studentQuery: s.name || '',
                        }))
                      }
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="form-group monthly-closing-manual__field monthly-closing-manual__field--desc">
              <label className="text-xs">Descrição</label>
              <input
                className="form-input"
                value={manualForm.description}
                onChange={(e) => setManualForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="form-group monthly-closing-manual__field monthly-closing-manual__field--amount">
              <label className="text-xs">Valor</label>
              <input
                className="form-input"
                value={manualForm.gross}
                onChange={(e) => setManualForm((f) => ({ ...f, gross: maskCurrency(e.target.value) }))}
              />
            </div>
            <div className="form-group monthly-closing-manual__field monthly-closing-manual__field--method">
              <label className="text-xs">Forma</label>
              <select
                className="form-input"
                value={manualForm.method}
                onChange={(e) => setManualForm((f) => ({ ...f, method: e.target.value }))}
              >
                {PAY_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group monthly-closing-manual__field monthly-closing-manual__field--date">
              <label className="text-xs">Data</label>
              <DateInputField
                type="date"
                className="form-input navi-date-filter"
                value={manualForm.date}
                onChange={(e) => setManualForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="form-group monthly-closing-manual__field monthly-closing-manual__field--origin">
              <label className="text-xs">Origem</label>
              <select
                className="form-input"
                value={manualForm.origin}
                onChange={(e) => setManualForm((f) => ({ ...f, origin: e.target.value }))}
              >
                {availableOrigins.map((o) => (
                  <option key={o} value={o}>
                    {CLOSING_ORIGIN_LABELS[o]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={savingManual}
              onClick={() => void saveManualReceipt()}
            >
              {savingManual ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" className="btn-outline btn-sm" onClick={() => setShowManual(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="monthly-closing-kpis">
        <div className="card monthly-closing-kpi">
          <div className="monthly-closing-kpi__value">{fmtMoney(totals.expected)}</div>
          <div className="text-xs text-muted">Total esperado</div>
        </div>
        <div className="card monthly-closing-kpi">
          <div className="monthly-closing-kpi__value monthly-closing-kpi__value--positive">
            {fmtMoney(totals.received)}
          </div>
          <div className="text-xs text-muted">Total recebido</div>
        </div>
        <div className="card monthly-closing-kpi">
          <div className="monthly-closing-kpi__value monthly-closing-kpi__value--negative">
            {fmtMoney(totals.pending)}
          </div>
          <div className="text-xs text-muted">Total pendente</div>
        </div>
        <div className="card monthly-closing-kpi monthly-closing-kpi--wide">
          <div className="text-xs text-muted monthly-closing-kpi__methods-label">Por forma de pagamento</div>
          <div className="text-small monthly-closing-kpi__methods">
            {totals.byMethod.length === 0
              ? '—'
              : totals.byMethod.map((m, i) => (
                  <span key={m.label}>
                    {i > 0 ? ' · ' : ''}
                    {m.label} {fmtMoney(m.amount)}
                  </span>
                ))}
          </div>
        </div>
      </div>

      <FinanceFiltersBar className="monthly-closing-filters mb-2">
        <SearchField
          className="finance-filters-bar__search monthly-closing-filters__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome"
          aria-label="Buscar na conferência"
        />
        <div className="finance-filters-bar__field monthly-closing-filters__group">
          <span className="finance-filters-bar__sr-label" id="monthly-closing-origin-label">
            Origem
          </span>
          <div className="monthly-closing-filters__chips" role="group" aria-labelledby="monthly-closing-origin-label">
            {availableOrigins.map((key) => (
              <button
                key={key}
                type="button"
                className={`filter-chip ${originFilter.has(key) ? 'is-active' : ''}`}
                onClick={() => toggleOrigin(key)}
              >
                {CLOSING_ORIGIN_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
        <div className="finance-filters-bar__field monthly-closing-filters__group">
          <span className="finance-filters-bar__sr-label" id="monthly-closing-situation-label">
            Situação
          </span>
          <div className="monthly-closing-filters__chips" role="group" aria-labelledby="monthly-closing-situation-label">
            {CLOSING_SITUATIONS.map((key) => (
              <button
                key={key}
                type="button"
                className={`filter-chip ${situationFilter.has(key) ? 'is-active' : ''}`}
                onClick={() => toggleSituation(key)}
              >
                {CLOSING_SITUATION_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
        {methodOptions.length > 0 ? (
          <FinanceToolbarSelect
            id="monthly-closing-method"
            label="Forma de pagamento"
            className="monthly-closing-filters__method"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            {methodOptions.map((k) => {
              const methodKey = k.split('|')[0] || k;
              return (
                <option key={k} value={k}>
                  {formatPaymentMethodLabel(methodKey)}
                </option>
              );
            })}
          </FinanceToolbarSelect>
        ) : null}
        <FinanceToolbarSelect
          id="monthly-closing-sort"
          label="Ordenar"
          className="monthly-closing-filters__sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="date">Data (recente)</option>
          <option value="name">Nome</option>
          <option value="received">Valor recebido</option>
          <option value="expected">Valor esperado</option>
        </FinanceToolbarSelect>
      </FinanceFiltersBar>

      <div className="finance-table-wrap monthly-closing-wrap">
        {loading && sortedRows.length > 0 ? (
          <div className="monthly-closing-loading-overlay" aria-live="polite">
            Atualizando…
          </div>
        ) : null}
        {loading && sortedRows.length === 0 ? (
          <PageSkeleton variant="table" rows={8} columns={6} />
        ) : isMobile ? (
          <div className="monthly-closing-mobile-list">
            {sortedRows.length === 0 ? (
              <div className="monthly-closing-empty-wrap">
                <EmptyState
                  variant="compact"
                  icon={Receipt}
                  title="Nenhum recebimento neste mês"
                  description="Os lançamentos aparecem aqui quando mensalidades são pagas, vendas concluídas ou recebimentos manuais são registrados."
                />
              </div>
            ) : (
              sortedRows.map((row) => (
                <article key={row.id} className="monthly-closing-mobile-card">
                  <div className="monthly-closing-mobile-card__head">
                    <strong>{row.guardian ? `${row.name} (${row.guardian})` : row.name}</strong>
                    <ClosingSituationBadge situation={row.situation} />
                  </div>
                  <p className="text-small text-muted monthly-closing-mobile-card__meta">
                    {CLOSING_ORIGIN_LABELS[row.origin]}
                  </p>
                  <div className="monthly-closing-mobile-card__grid">
                    <span>Esperado: {fmtMoney(row.expected)}</span>
                    <span>Recebido: {fmtMoney(row.received)}</span>
                    <span>Pendente: {row.pending > 0.009 ? fmtMoney(row.pending) : '—'}</span>
                  </div>
                  <p className="text-small monthly-closing-mobile-card__method">{row.paymentMethod}</p>
                </article>
              ))
            )}
          </div>
        ) : (
        <table className="finance-table monthly-closing-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th className="finance-num">Esperado</th>
              <th className="finance-num">Recebido</th>
              <th className="finance-num">Pendente</th>
              <th>Forma</th>
              <th>Data</th>
              <th>Situação</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="monthly-closing-empty-cell">
                  <EmptyState
                    variant="table-cell"
                    icon={Receipt}
                    title="Nenhum recebimento neste mês"
                    description="Os lançamentos aparecem aqui quando mensalidades são pagas, vendas concluídas ou recebimentos manuais são registrados."
                  />
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const dt = row.date ? new Date(row.date) : null;
                const dateStr = dt && !Number.isNaN(dt.getTime())
                  ? `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
                  : '—';
                const compHint =
                  row.missingCompetence && regime === FINANCE_REGIME.COMPETENCE
                    ? ' · sem competência definida'
                    : '';
                const nameCell = row.guardian ? `${row.name} (${row.guardian})` : row.name;
                return (
                  <tr key={row.id}>
                    <td className="monthly-closing-name-cell">{nameCell}</td>
                    <td className="text-small">
                      {row.description}
                      {row.categoryUnclassified ? (
                        <span
                          className="badge badge-warning monthly-closing-unclassified-badge"
                          title="Categoria não mapeada no plano fixo de categorias"
                        >
                          não classificado
                        </span>
                      ) : null}
                    </td>
                    <td className="finance-num">{fmtMoney(row.expected)}</td>
                    <td className="finance-num">{fmtMoney(row.received)}</td>
                    <td className="finance-num">
                      {row.pending > 0.009 ? (
                        <span className="monthly-closing-pending-value">{fmtMoney(row.pending)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-small">{row.paymentMethod}</td>
                    <td>
                      {dateStr}
                      {compHint ? <span className="text-xs monthly-closing-comp-hint">{compHint.trim()}</span> : null}
                    </td>
                    <td>
                      <ClosingSituationBadge situation={row.situation} table />
                    </td>
                    <td className="text-small">{CLOSING_ORIGIN_LABELS[row.origin]}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        )}
      </div>

      <ConfirmDialog
        open={showRegisterDialog}
        title="Marcar mês como conferido"
        description="Isso registra um snapshot dos totais do mês. Não trava lançamentos nem impede edições futuras."
        confirmLabel="Marcar como conferido"
        confirmVariant="primary"
        loading={savingClosing}
        onConfirm={() => void registerClosing()}
        onClose={() => {
          if (!savingClosing) setShowRegisterDialog(false);
        }}
      />
    </section>
  );
}

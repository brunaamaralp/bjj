import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './finance.css';
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
import FinanceTabShell from './FinanceTabShell.jsx';
import { formatPaymentMethod as formatPaymentMethodLabel } from '../../lib/paymentMethodLabels.js';
import { storageDialectPaymentMethodOptions } from '../../lib/paymentMethods.js';
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
import {
  DropdownMenu,
  DropdownMenuPanel,
  DropdownMenuItemStatic,
  DropdownMenuLabel,
} from '../shared/menu';
import { FINANCE_REGIME, getFinanceRegime } from '../../lib/financeCompetence.js';
import { useUserRole } from '../../lib/useUserRole.js';
import {
  CheckCircle,
  Clock,
  Download,
  Plus,
  Receipt,
} from 'lucide-react';

const CLOSING_COLUMNS_STORAGE_PREFIX = 'navi-finance-closing-cols';

const OPTIONAL_CLOSING_COLUMNS = [{ key: 'name', label: 'Nome', defaultVisible: false }];

function defaultClosingColumnVisibility() {
  return Object.fromEntries(OPTIONAL_CLOSING_COLUMNS.map((c) => [c.key, c.defaultVisible]));
}

function loadClosingColumnVisibility(academyId) {
  if (!academyId) return defaultClosingColumnVisibility();
  try {
    const raw = localStorage.getItem(`${CLOSING_COLUMNS_STORAGE_PREFIX}:${academyId}`);
    if (!raw) return defaultClosingColumnVisibility();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultClosingColumnVisibility();
    return {
      ...defaultClosingColumnVisibility(),
      ...OPTIONAL_CLOSING_COLUMNS.reduce((acc, col) => {
        if (typeof parsed[col.key] === 'boolean') acc[col.key] = parsed[col.key];
        return acc;
      }, {}),
    };
  } catch {
    return defaultClosingColumnVisibility();
  }
}

function saveClosingColumnVisibility(academyId, visibility) {
  if (!academyId) return;
  try {
    localStorage.setItem(`${CLOSING_COLUMNS_STORAGE_PREFIX}:${academyId}`, JSON.stringify(visibility));
  } catch {
    /* ignore */
  }
}

function closingNameCell(row) {
  if (!row) return '—';
  return row.guardian ? `${row.name} (${row.guardian})` : row.name;
}

const PAY_METHODS = storageDialectPaymentMethodOptions({ labelStyle: 'full' });

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
}) {
  const leads = useStudentStore((s) => s.students);
  const academyList = useLeadStore((s) => s.academyList);
  const addToast = useUiStore((s) => s.addToast);
  const isMobile = useMatchMobile();
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState(() => defaultClosingColumnVisibility());

  const [referenceMonthInternal] = useState(currentYm);
  const referenceMonth = referenceMonthProp ?? referenceMonthInternal;
  const [regime, setRegime] = useState(() => (academyId ? getFinanceRegime(academyId) : FINANCE_REGIME.CASH));
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
    if (!academyId) return;
    setVisibleCols(loadClosingColumnVisibility(academyId));
  }, [academyId]);

  const toggleClosingColumn = useCallback(
    (key) => {
      setVisibleCols((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        saveClosingColumnVisibility(academyId, next);
        return next;
      });
    },
    [academyId]
  );

  const desktopTableColCount = useMemo(() => 8 + (visibleCols.name ? 1 : 0), [visibleCols.name]);

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
      await recordCashClosing({ academyId, referenceMonth, snapshot, regime });
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
      if (e?.code === 'snapshot_mismatch') {
        addToast({
          type: 'error',
          message: 'Os totais mudaram desde o carregamento da página. Atualize e tente registrar novamente.',
        });
        void loadData();
      } else {
        addToast({ type: 'error', message: friendlyError(e, 'save') });
      }
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

  const closingBadge = (
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
  );

  const headActions = (
    <>
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
    </>
  );

  return (
    <FinanceTabShell
      panelClassName="monthly-closing-tab"
      title="Conferência do mês"
      badge={closingBadge}
      actions={headActions}
    >

      {cashClosing ? (
        <p className="text-small monthly-closing-dre-hint" role="status">
          Confira o DRE do mês em{' '}
          <Link to="/reports?tab=financeiro">Relatórios →</Link>
        </p>
      ) : null}
      {closingPartialWarning ? (
        <ErrorBanner
          className="mb-3"
          message="Alguns dados não puderam ser carregados. A conferência pode estar incompleta — vendas e outros lançamentos podem estar faltando."
          onRetry={() => void loadData()}
        />
      ) : null}
      {unclassifiedCount > 0 ? (
        <p className="finance-tab-notice finance-tab-notice--warning" role="status">
          <span className="finance-tab-notice__text">
            <strong>{unclassifiedCount}</strong> lançamento(s) sem categoria no plano fixo.{' '}
            <Link to={EMPRESA_FINANCE_CONFIG_PATH}>Configuração →</Link>
          </span>
        </p>
      ) : null}
      {pendingInMonth > 0 ? (
        <p className="finance-tab-notice finance-tab-notice--warning" role="status">
          <span className="finance-tab-notice__text">
            <strong>{pendingInMonth}</strong> lançamento(s) pendente(s) no caixa.{' '}
            <Link to="/financeiro?tab=movimentacoes">Ver lançamentos →</Link>
          </span>
        </p>
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

      <div className="finance-kpi-strip monthly-closing-kpis">
        <div className="finance-kpi">
          <p className="finance-kpi__label">Total esperado</p>
          <p className="finance-kpi__value">{fmtMoney(totals.expected)}</p>
        </div>
        <div className="finance-kpi">
          <p className="finance-kpi__label">Total recebido</p>
          <p className="finance-kpi__value finance-value-positive">{fmtMoney(totals.received)}</p>
        </div>
        <div className="finance-kpi">
          <p className="finance-kpi__label">Total pendente</p>
          <p className="finance-kpi__value finance-value-negative">{fmtMoney(totals.pending)}</p>
        </div>
      </div>

      <FinanceFiltersBar panel className="monthly-closing-filters">
        <div className="finance-hub-filters__row">
          {academyId ? (
            <FinanceRegimeToggle
              academyId={academyId}
              value={regime}
              onChange={setRegime}
              hintStyle="tooltip"
              className="finance-regime-toggle--inline"
            />
          ) : null}
          <SearchField
            className="finance-filters-bar__search monthly-closing-filters__search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar na conferência"
          />
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
        </div>
        <div className="finance-hub-filters__row finance-hub-filters__chip-groups">
          <div className="finance-hub-filters__chip-group">
            <span className="finance-hub-filters__chip-label" id="monthly-closing-origin-label">
              Tipo
            </span>
            <div
              className="finance-hub-filters__chips"
              role="group"
              aria-labelledby="monthly-closing-origin-label"
            >
              {availableOrigins.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`finance-filter-pill${originFilter.has(key) ? ' is-active' : ''}`}
                  aria-pressed={originFilter.has(key)}
                  onClick={() => toggleOrigin(key)}
                >
                  {CLOSING_ORIGIN_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="finance-hub-filters__chip-group">
            <span className="finance-hub-filters__chip-label" id="monthly-closing-situation-label">
              Situação
            </span>
            <div
              className="finance-hub-filters__chips"
              role="group"
              aria-labelledby="monthly-closing-situation-label"
            >
              {CLOSING_SITUATIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`finance-filter-pill${situationFilter.has(key) ? ' is-active' : ''}`}
                  aria-pressed={situationFilter.has(key)}
                  onClick={() => toggleSituation(key)}
                >
                  {CLOSING_SITUATION_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
        </div>
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
        <>
        <div className="monthly-closing-table-toolbar">
          <DropdownMenu
            open={colsMenuOpen}
            onOpenChange={setColsMenuOpen}
            className="monthly-closing-cols-menu"
            align="end"
          >
            <button
              type="button"
              className="btn-ghost btn-sm monthly-closing-cols-trigger"
              aria-expanded={colsMenuOpen}
              aria-haspopup="menu"
              onClick={() => setColsMenuOpen((o) => !o)}
            >
              Colunas +
            </button>
            {colsMenuOpen ? (
              <DropdownMenuPanel aria-label="Colunas da tabela de conferência">
                <DropdownMenuLabel>Exibir colunas</DropdownMenuLabel>
                {OPTIONAL_CLOSING_COLUMNS.map((col) => (
                  <DropdownMenuItemStatic key={col.key}>
                    <label className="monthly-closing-cols-option">
                      <input
                        type="checkbox"
                        checked={Boolean(visibleCols[col.key])}
                        onChange={() => toggleClosingColumn(col.key)}
                      />
                      <span>{col.label}</span>
                    </label>
                  </DropdownMenuItemStatic>
                ))}
              </DropdownMenuPanel>
            ) : null}
          </DropdownMenu>
        </div>
        <table className="finance-table monthly-closing-table">
          <thead>
            <tr>
              {visibleCols.name ? <th>Nome</th> : null}
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
                <td colSpan={desktopTableColCount} className="monthly-closing-empty-cell">
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
                const nameCell = closingNameCell(row);
                const descText = String(row.description || '').trim();
                return (
                  <tr key={row.id}>
                    {visibleCols.name ? (
                      <td className="monthly-closing-name-cell">{nameCell}</td>
                    ) : null}
                    <td className="text-small monthly-closing-desc-cell" title={descText || undefined}>
                      <span className="monthly-closing-desc-cell__text">{row.description}</span>
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
        </>
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
    </FinanceTabShell>
  );
}

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createSessionJwt } from '../../lib/appwrite';
import { listFinanceTx, createFinanceTx, patchFinanceTx } from '../../lib/financeTxApi.js';
import {
  txDirection,
  displayGross,
  displayNet,
  displayFee,
  formatSignedMoney,
  NATURE_STYLES,
} from '../../lib/financeTxDisplay.js';
import { useLeadStore } from '../../store/useLeadStore';
import { useStudentStore } from '../../store/useStudentStore';
import { LEAD_STATUS } from '../../lib/leadStatus';
import { isStudentRecord, isActiveStudent } from '../../lib/studentStatus.js';
import { Receipt, Repeat, ChevronDown, MoreHorizontal } from 'lucide-react';
import {
  RECURRENCE_TYPES,
  WEEKDAY_OPTIONS,
  buildRecurrenceEndOptions,
  defaultRecurrenceForm,
  isRecurrenceTx,
  recurrenceTooltip,
  normalizeRecurrenceDay,
} from '../../lib/financeRecurrence.js';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
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
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import { formatPaymentMethod } from '../../lib/paymentMethodLabels.js';

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

function getTxCategoryBadge(tx) {
  const label = String(tx.category || '').trim() || defaultCategoryForTxType(tx.type);
  if (!label) return null;
  const cat = resolveFinanceCategory(label);
  const type = cat?.type || String(tx.type || '').toLowerCase();
  let className = 'finance-tx-badge finance-tx-badge--other';
  if (type === 'plan' || type === 'enrollment') className = 'finance-tx-badge finance-tx-badge--plan';
  else if (type === 'product') className = 'finance-tx-badge finance-tx-badge--product';
  else if (type === 'stock_purchase') className = 'finance-tx-badge finance-tx-badge--expense';
  else if (type === 'expense' || type === 'expense_operational' || type === 'expense_financial' || type === 'card_fee') {
    className = 'finance-tx-badge finance-tx-badge--expense';
  }
  return { label, className };
}

function getTxSubtitle(tx) {
  const method = formatPaymentMethod(tx.method, tx.installments);
  const t = String(tx.type || '').toLowerCase();
  if (t === 'plan') {
    const plan = tx.planName ? String(tx.planName) : 'Plano';
    return `${plan} · ${method}`;
  }
  if (t === 'product') return `Produto · ${method}`;
  if (t === 'expense') return `Despesa · ${method}`;
  if (t === 'other') return `Outro · ${method}`;
  return method;
}

function getTxTypeLabelDesktop(tx) {
  if (tx.type === 'plan') return `Plano${tx.planName ? ` • ${tx.planName}` : ''}`;
  if (tx.type === 'product') return 'Produto';
  if (tx.type === 'other') return 'Outro';
  if (tx.type === 'expense') return 'Despesa';
  if (tx.type) return String(tx.type);
  return '—';
}

export default function TransacoesTab({
  academyId,
  financeConfig,
  onTransactionsChange,
  isOwner = false,
  periodFrom = '',
  periodTo = '',
  onPeriodFiltersChange,
  onTxMutated,
}) {
  const leads = useStudentStore((s) => s.students);
  const addToast = useUiStore((s) => s.addToast);
  const [fromDate, setFromDate] = useState(periodFrom);
  const [toDate, setToDate] = useState(periodTo);
  const [txLoading, setTxLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [showTxModal, setShowTxModal] = useState(false);
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
    ...defaultRecurrenceForm(),
  }));
  const [savingTx, setSavingTx] = useState(false);
  const [receiveNow, setReceiveNow] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalTx, setTotalTx] = useState(0);
  const [cancelLoadingId, setCancelLoadingId] = useState('');
  const [recurrenceCancelLoadingId, setRecurrenceCancelLoadingId] = useState('');
  const [menuOpenId, setMenuOpenId] = useState('');
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [editingRecurrenceOnly, setEditingRecurrenceOnly] = useState(false);
  const [editingTxId, setEditingTxId] = useState('');
  const [editPreservedSaleId, setEditPreservedSaleId] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [regime, setRegime] = useState(() => (academyId ? getFinanceRegime(academyId) : FINANCE_REGIME.CASH));

  useEffect(() => {
    if (academyId) setRegime(getFinanceRegime(academyId));
  }, [academyId]);

  const initialTxForm = () => ({
    direction: 'in',
    type: FINANCE_CATEGORIES.MENSALIDADE.type,
    planName: '',
    method: 'pix',
    gross: '',
    fee: '',
    installments: 1,
    note: '',
    lead_id: '',
    competence_month: currentCompetenceMonth(),
    category: FINANCE_CATEGORIES.MENSALIDADE.label,
    ...defaultRecurrenceForm(),
  });

  const recurrenceEndOptions = useMemo(() => buildRecurrenceEndOptions(), []);

  const categoryOptionGroups = useMemo(
    () => getCategoryOptionsByNature(txForm.direction === 'out' ? 'out' : 'in'),
    [txForm.direction]
  );

  const studentMatches = useMemo(() => {
    const q = String(studentQuery || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const isStudentLike = (l) => isStudentRecord(l) && isActiveStudent(l);
    return (leads || []).filter((l) => {
      if (!isStudentLike(l)) return false;
      const name = String(l.name || '').toLowerCase();
      const phone = String(l.phone || '').replace(/\D/g, '');
      const qd = q.replace(/\D/g, '');
      return name.includes(q) || (qd.length >= 2 && phone.includes(qd));
    }).slice(0, 12);
  }, [leads, studentQuery]);

  const resetTxModal = () => {
    setShowTxModal(false);
    setEditingTxId('');
    setEditingRecurrenceOnly(false);
    setRecurrenceOpen(false);
    setEditPreservedSaleId('');
    setReceiveNow(false);
    setTxForm(initialTxForm());
    setStudentQuery('');
    setStudentPickerOpen(false);
  };

  const loadTransactions = useCallback(
    async (cursor = null, append = false) => {
      if (!academyId) {
        setTransactions([]);
        return;
      }
      setTxLoading(true);
      try {
        const body = await listFinanceTx({ academyId, from: fromDate, to: toDate, cursor, regime });
        const items = body.transactions || [];
        setTransactions((prev) => (append ? [...prev, ...items] : items));
        setNextCursor(body.nextCursor || null);
        setHasMore(Boolean(body.hasMore));
        setTotalTx(Number(body.total) || items.length);
      } catch {
        if (!append) setTransactions([]);
      } finally {
        setTxLoading(false);
      }
    },
    [academyId, fromDate, toDate, regime]
  );

  const requestCloseTxModal = () => {
    if (savingTx) return;
    resetTxModal();
  };

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
    const cat = resolveFinanceCategory(catLabel);
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
      category: catLabel,
    });
    const lead = (leads || []).find((l) => l.id === tx.lead_id);
    setStudentQuery(lead?.name ? String(lead.name) : '');
    setStudentPickerOpen(false);
    setShowTxModal(true);
  };

  const openEditRecurrenceModal = (tx) => {
    openEditModal(tx);
    setEditingRecurrenceOnly(true);
    setRecurrenceOpen(true);
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

  const cancelRecurrence = async (id) => {
    const tid = String(id || '').trim();
    if (!tid || !academyId) return;
    if (!window.confirm('Cancelar a recorrência deste lançamento? Os lançamentos já gerados permanecem no histórico.')) {
      return;
    }
    setRecurrenceCancelLoadingId(tid);
    setMenuOpenId('');
    try {
      const row = await patchFinanceTx({ academyId, id: tid, payload: { action: 'cancel_recurrence' } });
      setTransactions((prev) => prev.map((t) => (String(t.id) === tid ? row : t)));
      addToast({ type: 'success', message: 'Recorrência cancelada.' });
      if (typeof onTxMutated === 'function') onTxMutated();
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setRecurrenceCancelLoadingId('');
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    if (typeof onPeriodFiltersChange === 'function') {
      onPeriodFiltersChange(fromDate, toDate);
    }
  }, [fromDate, toDate, onPeriodFiltersChange]);

  useEffect(() => {
    setFromDate(periodFrom);
    setToDate(periodTo);
  }, [periodFrom, periodTo]);

  useEffect(() => {
    if (typeof onTransactionsChange === 'function') {
      onTransactionsChange(transactions);
    }
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

  const financeTxErrorMessage = (code) => {
    const c = String(code || '').trim();
    if (c === 'cannot_settle_cancelled') return 'Não é possível liquidar um lançamento cancelado.';
    if (c === 'cannot_cancel_settled') return 'Não é possível cancelar um lançamento já liquidado.';
    if (c === 'already_cancelled') return 'Este lançamento já está cancelado.';
    if (c === 'already_settled') return 'Este lançamento já foi liquidado.';
    return '';
  };

  const settle = async (id) => {
    try {
      const jwt = await createSessionJwt();
      const response = await fetch('/api/agent?route=settle-finance-tx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': academyId,
        },
        body: JSON.stringify({ transactionId: id }),
      });
      if (!response.ok) {
        let errMsg = 'Erro ao liquidar';
        try {
          const errBody = await response.json();
          errMsg = financeTxErrorMessage(errBody.error) || errBody.error || errMsg;
        } catch {
          void 0;
        }
        throw new Error(errMsg);
      }
      const { settledAt: settledAtServer } = await response.json();
      const nowIso = settledAtServer || new Date().toISOString();
      const tx = transactions.find((t) => t.id === id);
      setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'settled', settledAt: nowIso } : t)));
      addToast({ type: 'success', message: 'Transação liquidada com sucesso' });
      if (tx && academyId) {
        applySettleAccountingSideEffects(tx, academyId);
      }
      if (typeof onTxMutated === 'function') onTxMutated();
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
    } catch (e) {
      console.error(e);
      const msg = String(e?.message || '').trim();
      addToast({ type: 'error', message: msg || friendlyError(e, 'action') });
    }
  };

  const cancelTx = async (id) => {
    if (!window.confirm('Cancelar este lançamento? Ele deixará de aparecer como pendente e não poderá ser liquidado.')) {
      return;
    }
    const tid = String(id || '').trim();
    if (!tid || !academyId) return;
    setCancelLoadingId(tid);
    try {
      const jwt = await createSessionJwt();
      const response = await fetch('/api/agent?route=cancel-finance-tx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': academyId,
        },
        body: JSON.stringify({ transactionId: tid }),
      });
      if (!response.ok) {
        let errMsg = 'Erro ao cancelar';
        try {
          const errBody = await response.json();
          errMsg = financeTxErrorMessage(errBody.error) || errBody.error || errMsg;
        } catch {
          void 0;
        }
        throw new Error(errMsg);
      }
      setTransactions((prev) =>
        prev.map((t) => (String(t.id) === tid ? { ...t, status: 'cancelled', settledAt: '' } : t))
      );
      addToast({ type: 'success', message: 'Lançamento cancelado.' });
      if (typeof onTxMutated === 'function') onTxMutated();
    } catch (e) {
      console.error(e);
      const msg = String(e?.message || '').trim();
      addToast({ type: 'error', message: msg || friendlyError(e, 'action') });
    } finally {
      setCancelLoadingId('');
    }
  };

  const saveManualTx = async () => {
    const grossNum =
      typeof txForm.gross === 'number' && Number.isFinite(txForm.gross)
        ? txForm.gross
        : parseCurrencyBRL(txForm.gross);
    if (!academyId || !Number.isFinite(grossNum) || grossNum <= 0) {
      addToast({ type: 'error', message: 'Informe um valor bruto maior que zero.' });
      return;
    }
    if (txForm.direction === 'out' && !isOwner) {
      addToast({ type: 'error', message: 'Apenas o titular pode registrar saída.' });
      return;
    }
    const cat = resolveFinanceCategory(txForm.category);
    if (!cat) {
      addToast({ type: 'error', message: 'Selecione uma categoria válida.' });
      return;
    }
    const feePct =
      txForm.direction === 'out' ? 0 : parseFloat(String(txForm.fee || '').replace(',', '.')) || 0;
    const installments =
      txForm.method === 'cartão_crédito' ? Math.min(12, Math.max(1, Number(txForm.installments) || 1)) : 1;
    setSavingTx(true);
    try {
      const payload = {
        saleId: editPreservedSaleId || '',
        lead_id: txForm.lead_id || '',
        method: txForm.method,
        installments,
        type: cat.type,
        category: cat.label,
        competence_month: txForm.competence_month || currentCompetenceMonth(),
        planName: txForm.planName || '',
        gross: grossNum,
        fee: feePct > 0 ? grossNum * (feePct / 100) : 0,
        note: txForm.note || '',
        receive_now: !editingTxId && receiveNow,
        settledAt: receiveNow ? new Date().toISOString() : undefined,
      };

      if (editingTxId && editingRecurrenceOnly) {
        if (!txForm.repeat_enabled) {
          addToast({ type: 'error', message: 'Ative "Repetir automaticamente" para manter a recorrência.' });
          setSavingTx(false);
          return;
        }
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
        addToast({ type: 'success', message: 'Recorrência atualizada.' });
      } else if (editingTxId) {
        const row = await patchFinanceTx({ academyId, id: editingTxId, payload });
        setTransactions((prev) => prev.map((t) => (t.id === editingTxId ? row : t)));
        addToast({ type: 'success', message: 'Transação atualizada.' });
      } else {
        if (txForm.repeat_enabled) {
          payload.is_recurrence_template = true;
          payload.recurrence_type = txForm.recurrence_type || RECURRENCE_TYPES.MONTHLY;
          payload.recurrence_day = normalizeRecurrenceDay(payload.recurrence_type, txForm.recurrence_day);
          if (txForm.recurrence_end) payload.recurrence_end = txForm.recurrence_end;
        }
        const row = await createFinanceTx({ academyId, payload });
        if (receiveNow && row) applyAccountingSideEffectsAuto(row, academyId);
        setTransactions((prev) => [row, ...prev]);
        addToast({
          type: 'success',
          message: receiveNow ? 'Lançamento registrado e liquidado.' : 'Transação registrada.',
        });
      }
      resetTxModal();
      if (typeof onTxMutated === 'function') onTxMutated();
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
      void loadTransactions();
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: String(e?.message || friendlyError(e, 'save')) });
    } finally {
      setSavingTx(false);
    }
  };

  return (
    <>
      <section className="mt-4 animate-in" style={{ animationDelay: '0.2s' }}>
        <h3 className="navi-section-heading mb-2">Lançamentos</h3>
        <div className="card">
          {academyId ? (
            <FinanceRegimeToggle academyId={academyId} value={regime} onChange={setRegime} className="mb-3" />
          ) : null}
          <div className="finance-tx-toolbar">
            <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ width: 138 }}>
                <label>De</label>
                <input className="form-input navi-date-filter" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ width: 138 }}>
                <label>Até</label>
                <input className="form-input navi-date-filter" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditingTxId('');
                setEditPreservedSaleId('');
                setReceiveNow(false);
                setTxForm(initialTxForm());
                setStudentQuery('');
                setStudentPickerOpen(false);
                setShowTxModal(true);
              }}
            >
              + Nova transação
            </button>
          </div>
          {!txLoading && transactions.length > 0 ? (
            <p className="text-small text-muted" style={{ marginBottom: 12 }} role="status">
              Mostrando {transactions.length}
              {totalTx > transactions.length ? ` de ${totalTx}` : ''} lançamentos
              {hasMore ? ' (há mais registros)' : ''}
            </p>
          ) : null}
          <div className="finance-table-wrap">
            {txLoading ? (
              <PageSkeleton variant="table" rows={6} columns={10} />
            ) : (
            <>
            <div className="navi-desktop-table-wrap finance-desktop-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Natureza</th>
                  <th>Categoria</th>
                  <th>Venda</th>
                  <th>Aluno</th>
                  <th>Tipo</th>
                  <th>Método</th>
                  <th className="finance-num">Bruto</th>
                  <th className="finance-num">Taxa</th>
                  <th className="finance-num">Líquido</th>
                  <th>Status</th>
                  <th className="finance-num" style={{ minWidth: 148 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: 16, verticalAlign: 'middle' }}>
                      <EmptyState
                        variant="table-cell"
                        tone="solid"
                        icon={Receipt}
                        title="Nenhuma transação encontrada"
                        description="Use '+ Nova transação' para registrar um lançamento."
                        role="status"
                      />
                    </td>
                  </tr>
                ) : transactions.map((tx) => {
                  const dateStr = formatTxDateStr(txTemporalIso(tx));
                  const noCompetence =
                    regime === FINANCE_REGIME.COMPETENCE && competenceMonthMissing(tx);
                  const dir = txDirection(tx);
                  const nature = NATURE_STYLES[dir];
                  const catBadge = getTxCategoryBadge(tx);
                  const grossFmt = formatSignedMoney(displayGross(tx), dir);
                  const feeFmt = formatMoneyBRL(displayFee(tx));
                  const netFmt = formatSignedMoney(displayNet(tx), dir);
                  const typeLabel = getTxTypeLabelDesktop(tx);
                  const methodLabel = formatPaymentMethod(tx.method, tx.installments);
                  const rawName = tx.lead_id ? (leads.find((l) => l.id === tx.lead_id)?.name || '') : '';
                  const alumStr = rawName ? (rawName.length > 20 ? `${rawName.slice(0, 20)}…` : rawName) : '—';
                  const st = String(tx.status || '').toLowerCase();
                  const statusBadge =
                    st === 'pending' ? (
                      <span className="badge badge-warning">Pendente</span>
                    ) : st === 'settled' ? (
                      <span className="badge badge-success">Liquidado</span>
                    ) : st === 'cancelled' ? (
                      <span className="badge badge-secondary">Cancelado</span>
                    ) : (
                      <span className="badge badge-secondary">{tx.status || '—'}</span>
                    );
                  const rowBusy = cancelLoadingId === tx.id || recurrenceCancelLoadingId === tx.id;
                  const rec = isRecurrenceTx(tx);
                  const recTip = recurrenceTooltip(tx);
                  const showRecMenu = isOwner && tx.is_recurrence_template === true;
                  return (
                    <tr key={tx.id}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {dateStr}
                          {rec ? (
                            <Repeat
                              size={14}
                              aria-hidden
                              title={recTip || 'Lançamento recorrente — gerado automaticamente'}
                              style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                          ) : null}
                        </span>
                        {noCompetence ? (
                          <span
                            className="text-xs"
                            style={{ display: 'block', color: '#B45309', marginTop: 2 }}
                            title="Sem competência definida — usando data de pagamento"
                          >
                            sem competência
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span style={{ color: nature.color, fontWeight: 600 }}>{nature.label}</span>
                      </td>
                      <td>{catBadge ? <span className={catBadge.className}>{catBadge.label}</span> : '—'}</td>
                      <td>{tx.saleId || '-'}</td>
                      <td title={rawName || undefined}>{alumStr}</td>
                      <td>{typeLabel}</td>
                      <td>{methodLabel}</td>
                      <td className="finance-num">{grossFmt}</td>
                      <td className="finance-num">{feeFmt}</td>
                      <td className="finance-num">{netFmt}</td>
                      <td>{statusBadge}</td>
                      <td className="finance-num">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                          {showRecMenu ? (
                            <div style={{ position: 'relative' }}>
                              <button
                                type="button"
                                className="btn-outline"
                                aria-label="Mais opções de recorrência"
                                disabled={rowBusy}
                                onClick={() => setMenuOpenId((prev) => (prev === tx.id ? '' : tx.id))}
                              >
                                <MoreHorizontal size={16} aria-hidden />
                              </button>
                              {menuOpenId === tx.id ? (
                                <div
                                  className="card"
                                  style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: '100%',
                                    marginTop: 4,
                                    zIndex: 4,
                                    minWidth: 200,
                                    padding: 4,
                                    boxShadow: '0 8px 24px rgba(18,16,42,0.12)',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px' }}
                                    onClick={() => openEditRecurrenceModal(tx)}
                                  >
                                    Editar recorrência
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    style={{
                                      width: '100%',
                                      textAlign: 'left',
                                      padding: '8px 10px',
                                      color: 'var(--danger)',
                                    }}
                                    disabled={rowBusy}
                                    onClick={() => void cancelRecurrence(tx.id)}
                                  >
                                    {recurrenceCancelLoadingId === tx.id ? 'Cancelando…' : 'Cancelar recorrência'}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {st === 'pending' ? (
                            <>
                              {(isOwner || txDirection(tx) !== 'out') ? (
                                <button
                                  type="button"
                                  className="btn-outline"
                                  onClick={() => openEditModal(tx)}
                                  disabled={rowBusy}
                                >
                                  Editar
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn-outline"
                                onClick={() => void settle(tx.id)}
                                disabled={rowBusy}
                              >
                                Liquidar
                              </button>
                              {isOwner ? (
                                <button
                                  type="button"
                                  className="btn-outline"
                                  onClick={() => void cancelTx(tx.id)}
                                  disabled={rowBusy}
                                  style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                                >
                                  {rowBusy ? 'Cancelando…' : 'Cancelar'}
                                </button>
                              ) : null}
                            </>
                          ) : !showRecMenu ? (
                            <span className="text-small" style={{ opacity: 0.75, color: 'var(--text-secondary)' }}>—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="navi-mobile-list finance-mobile-list" aria-label="Lançamentos">
              {transactions.map((tx) => {
                const rawName = tx.lead_id ? (leads.find((l) => l.id === tx.lead_id)?.name || '') : '';
                const displayName = rawName || '—';
                const badge = getTxCategoryBadge(tx);
                const st = String(tx.status || '').toLowerCase();
                const rowBusy = cancelLoadingId === tx.id || recurrenceCancelLoadingId === tx.id;
                const rec = isRecurrenceTx(tx);
                return (
                  <article key={tx.id} className="navi-mobile-card finance-mobile-card">
                    <div className="finance-mobile-card__head">
                      <span className="finance-mobile-card__date" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {formatTxDateStr(txTemporalIso(tx))}
                        {rec ? <Repeat size={14} title={recurrenceTooltip(tx)} aria-hidden /> : null}
                      </span>
                      <span
                        className="finance-mobile-card__amount"
                        style={{ color: NATURE_STYLES[txDirection(tx)].color }}
                      >
                        {formatSignedMoney(displayGross(tx), txDirection(tx))}
                      </span>
                    </div>
                    <div className="finance-mobile-card__name">{displayName}</div>
                    <div className="finance-mobile-card__meta text-small text-muted">{getTxSubtitle(tx)}</div>
                    {badge ? <span className={badge.className}>{badge.label}</span> : null}
                    {isOwner && tx.is_recurrence_template ? (
                      <div className="finance-mobile-card__actions">
                        <button type="button" className="btn-outline btn-sm" onClick={() => openEditRecurrenceModal(tx)}>
                          Editar recorrência
                        </button>
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          disabled={rowBusy}
                          onClick={() => void cancelRecurrence(tx.id)}
                          style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                        >
                          Cancelar recorrência
                        </button>
                      </div>
                    ) : null}
                    {st === 'pending' ? (
                      <div className="finance-mobile-card__actions">
                        {(isOwner || txDirection(tx) !== 'out') ? (
                          <button type="button" className="btn-outline btn-sm" onClick={() => openEditModal(tx)} disabled={rowBusy}>
                            Editar
                          </button>
                        ) : null}
                        <button type="button" className="btn-outline btn-sm" onClick={() => void settle(tx.id)} disabled={rowBusy}>
                          Liquidar
                        </button>
                        {isOwner ? (
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() => void cancelTx(tx.id)}
                            disabled={rowBusy}
                            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                          >
                            {rowBusy ? '…' : 'Cancelar'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            </>
            )}
          </div>
          {hasMore && nextCursor ? (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                type="button"
                className="btn-outline"
                disabled={txLoading}
                onClick={() => void loadTransactions(nextCursor, true)}
              >
                {txLoading ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {showTxModal && (
        <div
          className="navi-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finance-tx-modal-title"
          onClick={() => {
            requestCloseTxModal();
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20 }}
          >
            <h3 id="finance-tx-modal-title" className="navi-section-heading" style={{ marginBottom: 14 }}>
              {editingRecurrenceOnly
                ? 'Editar recorrência'
                : editingTxId
                  ? 'Editar transação'
                  : 'Nova transação'}
            </h3>
            {editingTxId && !editingRecurrenceOnly ? (
              <p className="text-small" style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                Só é possível editar enquanto o lançamento estiver pendente. Valores liquidados no razão não são alterados automaticamente.
              </p>
            ) : null}
            <div className="flex-col gap-3">
              {!editingRecurrenceOnly ? (
              <>
              <div className="form-group">
                <label>Natureza</label>
                <select
                  className="form-input"
                  value={txForm.direction}
                  onChange={(e) => {
                    const dir = e.target.value === 'out' ? 'out' : 'in';
                    const groups = getCategoryOptionsByNature(dir);
                    const first = groups.values().next().value?.[0];
                    const cat = first || (dir === 'out' ? FINANCE_CATEGORIES.OUTRAS_DESPESAS : FINANCE_CATEGORIES.MENSALIDADE);
                    setTxForm((prev) => ({
                      ...prev,
                      direction: dir,
                      category: cat.label,
                      type: cat.type,
                      fee: dir === 'out' ? '' : prev.fee,
                      installments: dir === 'out' ? 1 : prev.installments,
                      planName: cat.type === 'plan' ? prev.planName : '',
                    }));
                  }}
                  disabled={Boolean(editingTxId)}
                >
                  <option value="in">Entrada</option>
                  {isOwner ? <option value="out">Saída</option> : null}
                </select>
              </div>
              <div className="form-group">
                <label>Categoria</label>
                <select
                  className="form-input"
                  value={txForm.category}
                  onChange={(e) => {
                    const label = e.target.value;
                    const cat = resolveFinanceCategory(label);
                    setTxForm((prev) => ({
                      ...prev,
                      category: label,
                      type: cat?.type || prev.type,
                      planName: cat?.type === 'plan' ? prev.planName : '',
                    }));
                  }}
                >
                  {[...categoryOptionGroups.entries()].map(([group, items]) => (
                    <optgroup key={group} label={group}>
                      {items.map((c) => (
                        <option key={c.label} value={c.label}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {!editingTxId ? (
                <label className="flex items-center gap-2 text-small" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={receiveNow}
                    onChange={(e) => setReceiveNow(e.target.checked)}
                  />
                  Recebido agora (já liquidado no caixa)
                </label>
              ) : null}
              {resolveFinanceCategory(txForm.category)?.type === 'plan' && (
                <div className="form-group">
                  <label>Plano</label>
                  <select
                    className="form-input"
                    value={txForm.planName}
                    onChange={(e) => {
                      const name = e.target.value;
                      const pl = (financeConfig.plans || []).find((p) => (p.name || '') === name);
                      const price = pl != null ? Number(pl.price ?? 0) : NaN;
                      setTxForm({
                        ...txForm,
                        planName: name,
                        gross: name && Number.isFinite(price) && price >= 0 ? price : '',
                      });
                    }}
                  >
                    <option value="">Selecione…</option>
                    {(financeConfig.plans || []).filter((p) => String(p.name || '').trim()).map((p) => (
                      <option key={p.name} value={p.name}>{`${p.name} · R$ ${Number(p.price ?? 0).toFixed(2)}`}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Valor (R$)</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={
                    txForm.gross === '' || txForm.gross === null || txForm.gross === undefined
                      ? ''
                      : maskCurrency(String(Math.round(Number(txForm.gross) * 100)))
                  }
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '');
                    if (!d) {
                      setTxForm((f) => ({ ...f, gross: '' }));
                      return;
                    }
                    const n = parseInt(d, 10) / 100;
                    setTxForm((f) => ({ ...f, gross: n }));
                  }}
                />
              </div>
              {txForm.direction !== 'out' ? (
                <div className="form-group">
                  <label>Taxa (%)</label>
                  <input
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
              <div className="form-group">
                <label>Método</label>
                <select
                  className="form-input"
                  value={txForm.method}
                  onChange={(e) => {
                    const m = e.target.value;
                    setTxForm({ ...txForm, method: m, installments: m === 'cartão_crédito' ? (txForm.installments || 1) : 1 });
                  }}
                >
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartão_débito">Cartão débito</option>
                  <option value="cartão_crédito">Cartão crédito</option>
                  <option value="transferência">Transferência</option>
                </select>
              </div>
              {txForm.method === 'cartão_crédito' && (
                <div className="form-group">
                  <label>Parcelas</label>
                  <select
                    className="form-input"
                    value={String(txForm.installments || 1)}
                    onChange={(e) => setTxForm({ ...txForm, installments: Number(e.target.value) || 1 })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={String(n)}>{n}x</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group" style={{ position: 'relative' }}>
                <label>Aluno (opcional)</label>
                <input
                  className="form-input"
                  placeholder="Nome ou telefone (mín. 2 caracteres)…"
                  value={studentQuery}
                  onChange={(e) => {
                    setStudentQuery(e.target.value);
                    setStudentPickerOpen(true);
                    if (!e.target.value.trim()) setTxForm((f) => ({ ...f, lead_id: '' }));
                  }}
                  onFocus={() => setStudentPickerOpen(true)}
                  onBlur={() => { window.setTimeout(() => setStudentPickerOpen(false), 180); }}
                />
                <p className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 6 }}>
                  Alunos matriculados ou marcados como aluno na base.
                </p>
                {studentPickerOpen && String(studentQuery || '').trim().length >= 2 ? (
                  studentMatches.length > 0 ? (
                    <div
                      className="card"
                      style={{
                        position: 'absolute',
                        zIndex: 2,
                        left: 0,
                        right: 0,
                        top: '100%',
                        marginTop: 4,
                        maxHeight: 220,
                        overflowY: 'auto',
                        padding: 0,
                        boxShadow: '0 8px 24px rgba(18,16,42,0.12)',
                      }}
                    >
                      {studentMatches.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          className="btn-ghost"
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            borderRadius: 0,
                            borderBottom: '0.5px solid var(--border-light)',
                            padding: '10px 12px',
                          }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setTxForm((f) => ({ ...f, lead_id: l.id }));
                            setStudentQuery(String(l.name || ''));
                            setStudentPickerOpen(false);
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{l.name || '—'}</div>
                          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>{l.phone || '—'}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="card text-small"
                      style={{
                        position: 'absolute',
                        zIndex: 2,
                        left: 0,
                        right: 0,
                        top: '100%',
                        marginTop: 4,
                        padding: '12px 14px',
                        color: 'var(--text-secondary)',
                        boxShadow: '0 8px 24px rgba(18,16,42,0.12)',
                      }}
                    >
                      Nenhum aluno encontrado para essa busca.
                    </div>
                  )
                ) : null}
              </div>
              <div className="form-group">
                <label>Mês de competência</label>
                <input
                  type="month"
                  className="form-input"
                  value={txForm.competence_month || currentCompetenceMonth()}
                  onChange={(e) => setTxForm({ ...txForm, competence_month: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Observação</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={txForm.note}
                  onChange={(e) => setTxForm({ ...txForm, note: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              </>
              ) : null}
              {!editingTxId || editingRecurrenceOnly ? (
                <div className="form-group" style={{ borderTop: editingRecurrenceOnly ? 'none' : '1px solid var(--border-light)', paddingTop: editingRecurrenceOnly ? 0 : 12 }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      fontWeight: 600,
                    }}
                    onClick={() => setRecurrenceOpen((o) => !o)}
                  >
                    <span>Repetir lançamento</span>
                    <ChevronDown
                      size={18}
                      style={{ transform: recurrenceOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                    />
                  </button>
                  {recurrenceOpen ? (
                    <div className="flex-col gap-3" style={{ marginTop: 8 }}>
                      <label className="flex items-center gap-2 text-small" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(txForm.repeat_enabled)}
                          onChange={(e) =>
                            setTxForm((f) => ({
                              ...f,
                              repeat_enabled: e.target.checked,
                              recurrence_type: f.recurrence_type || RECURRENCE_TYPES.MONTHLY,
                              recurrence_day: f.recurrence_day || 1,
                            }))
                          }
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
            </div>
            <div className="flex gap-2 mt-3" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-outline"
                disabled={savingTx}
                onClick={() => {
                  requestCloseTxModal();
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={savingTx}
                onClick={() => void saveManualTx()}
              >
                {savingTx
                  ? 'Salvando…'
                  : editingRecurrenceOnly
                    ? 'Salvar recorrência'
                    : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

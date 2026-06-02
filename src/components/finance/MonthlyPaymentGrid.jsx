import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuPanel,
  DropdownMenuItemStatic,
  DropdownMenuLabel,
} from '../shared/menu';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import useMatchMobile from '../../hooks/useMatchMobile.js';
import PaymentStatusPopover from './PaymentStatusPopover.jsx';
import MonthlyGridMobileCard from './MonthlyGridMobileCard.jsx';
import { GridStatusBadgeButton } from './gridStatusBadge.jsx';
import { getStudentPayments, saveMonthlyPayment } from '../../lib/studentPayments';
import {
  expectedAmountForStudent,
  formatDueDayLabel,
  GRID_STATUS_LABELS,
  HISTORY_BADGE,
  historyStatusForMonth,
  monthKeysBack,
  receivedAmountForPayment,
  resolveGridDisplayStatus,
  mapDbStatusFromGridForm,
} from '../../lib/paymentStatus';
import { studentDueDay, dueDateInMonth } from '../../lib/collectionOverdue.js';
import EmptyState from '../shared/EmptyState.jsx';
import { Users } from 'lucide-react';

function truncateNote(note, max = 40) {
  const s = String(note || '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

const GRID_COLUMNS_STORAGE_PREFIX = 'navi-mensal-grid-cols';

const OPTIONAL_GRID_COLUMNS = [
  { key: 'expected', label: 'Valor esperado', defaultVisible: false },
  { key: 'due', label: 'Vencimento', defaultVisible: false },
  { key: 'account', label: 'Conta / plataforma', defaultVisible: false },
];

function defaultGridColumnVisibility() {
  return Object.fromEntries(OPTIONAL_GRID_COLUMNS.map((c) => [c.key, c.defaultVisible]));
}

function loadGridColumnVisibility(academyId) {
  if (!academyId) return defaultGridColumnVisibility();
  try {
    const raw = localStorage.getItem(`${GRID_COLUMNS_STORAGE_PREFIX}:${academyId}`);
    if (!raw) return defaultGridColumnVisibility();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultGridColumnVisibility();
    return {
      ...defaultGridColumnVisibility(),
      ...OPTIONAL_GRID_COLUMNS.reduce((acc, col) => {
        if (typeof parsed[col.key] === 'boolean') acc[col.key] = parsed[col.key];
        return acc;
      }, {}),
    };
  } catch {
    return defaultGridColumnVisibility();
  }
}

function saveGridColumnVisibility(academyId, visibility) {
  if (!academyId) return;
  try {
    localStorage.setItem(`${GRID_COLUMNS_STORAGE_PREFIX}:${academyId}`, JSON.stringify(visibility));
  } catch {
    /* ignore */
  }
}

function studentTurma(student) {
  return String(
    student?.turma || student?.className || student?.class_name || student?.classId || ''
  ).trim();
}

export default function MonthlyPaymentGrid({
  students,
  paymentMap,
  payments,
  setPayments,
  currentMonth,
  financeConfig,
  academyId,
  teamIdForPayments,
  userId,
  sessionUserName,
  search,
  filter,
  turmaFilter = 'all',
  sortBy = 'name',
  terms,
  addToast,
  friendlyError,
  loading,
}) {
  const [popover, setPopover] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [historyByLead, setHistoryByLead] = useState({});
  const [historyLoading, setHistoryLoading] = useState(null);
  const [notePopoverId, setNotePopoverId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState(() => defaultGridColumnVisibility());
  const isMobile = useMatchMobile();
  const tableScrollRef = useRef(null);

  useEffect(() => {
    if (!academyId) return;
    setVisibleCols(loadGridColumnVisibility(academyId));
  }, [academyId]);

  const toggleGridColumn = useCallback(
    (key) => {
      setVisibleCols((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        saveGridColumnVisibility(academyId, next);
        return next;
      });
    },
    [academyId]
  );

  const desktopColCount = useMemo(() => {
    const optional = OPTIONAL_GRID_COLUMNS.filter((c) => visibleCols[c.key]).length;
    return 5 + optional;
  }, [visibleCols]);

  const rows = useMemo(() => {
    return students.map((student) => {
      const payment = paymentMap[student.id];
      const expected = expectedAmountForStudent(student, financeConfig, payment);
      const display = resolveGridDisplayStatus(student, payment, currentMonth);
      return {
        student,
        payment,
        expected,
        display,
        received: receivedAmountForPayment(payment),
        note: String(payment?.note || '').trim(),
      };
    });
  }, [students, paymentMap, financeConfig, currentMonth]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== 'all' && row.display.key !== filter) return false;
      if (turmaFilter !== 'all' && studentTurma(row.student) !== turmaFilter) return false;
      if (q && !String(row.student.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search, turmaFilter]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      if (sortBy === 'due') {
        const ad = studentDueDay(a.student) ?? 99;
        const bd = studentDueDay(b.student) ?? 99;
        return ad - bd;
      }
      if (sortBy === 'status') {
        return a.display.key.localeCompare(b.display.key, 'pt-BR');
      }
      if (sortBy === 'amount') {
        return (b.expected || 0) - (a.expected || 0);
      }
      return String(a.student.name || '').localeCompare(String(b.student.name || ''), 'pt-BR');
    });
    return copy;
  }, [filteredRows, sortBy]);

  const desktopTableRows = useMemo(() => {
    const items = [];
    for (const row of sortedRows) {
      items.push({ kind: 'main', row, id: row.student.id });
      if (expandedId === row.student.id) {
        items.push({ kind: 'history', row, id: `${row.student.id}-history` });
      }
    }
    return items;
  }, [sortedRows, expandedId]);

  const shouldVirtualizeDesktop = !isMobile && desktopTableRows.length > 20;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualizeDesktop ? desktopTableRows.length : 0,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: (index) => (desktopTableRows[index]?.kind === 'history' ? 56 : 52),
    overscan: 10,
  });

  const totals = useMemo(() => {
    let expectedTotal = 0;
    let receivedTotal = 0;
    let paidCount = 0;
    let problemCount = 0;
    let pendingTotal = 0;
    let noneWithPlanCount = 0;
    let delinquentAmount = 0;
    const active = students.length;
    for (const row of rows) {
      const exp = row.expected || 0;
      expectedTotal += exp;
      const st = row.display.key;
      if (st === 'paid' || st === 'covered' || st === 'partial') {
        receivedTotal += row.received || 0;
        if (st === 'paid' || st === 'covered') paidCount += 1;
      }
      if (st === 'awaiting' || st === 'partial' || st === 'pending') problemCount += 1;

      const hasPlan = Boolean(String(row.student.plan || '').trim());
      if (st === 'none' && hasPlan) {
        noneWithPlanCount += 1;
        pendingTotal += exp;
      } else if (st === 'pending' || st === 'awaiting') {
        pendingTotal += exp;
        if (st === 'pending') delinquentAmount += exp;
      } else if (st === 'partial') {
        pendingTotal += Math.max(0, exp - (row.received || 0));
        delinquentAmount += Math.max(0, exp - (row.received || 0));
      }
    }
    const pendingTone =
      noneWithPlanCount > 0 && delinquentAmount <= 0 ? 'attention' : delinquentAmount > 0 ? 'danger' : 'neutral';
    return {
      expectedTotal,
      receivedTotal,
      pendingTotal,
      paidCount,
      active,
      problemCount,
      pendingTone,
    };
  }, [rows, students.length]);

  const fmtMoney = (n) => {
    try {
      return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${Number(n || 0).toFixed(2)}`;
    }
  };

  const upsertPaymentInState = useCallback((doc) => {
    const lid = String(doc.lead_id || '').trim();
    setPayments((prev) => {
      const rest = (prev || []).filter((p) => String(p.lead_id) !== lid);
      return [...rest, doc];
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('navi-student-payment-updated', {
          detail: { referenceMonth: currentMonth, leadId: lid },
        })
      );
    }
  }, [setPayments, currentMonth]);

  const handlePopoverSave = async ({ gridStatus, dbStatus, paid_amount, expected_amount, paid_at, note }) => {
    if (!popover) return;
    const { student, payment } = popover.row;
    setSavingId(student.id);
    try {
      const doc = await saveMonthlyPayment({
        paymentId: payment?.$id,
        lead_id: student.id,
        academy_id: academyId,
        team_id: teamIdForPayments,
        reference_month: currentMonth,
        status: dbStatus,
        paid_amount,
        expected_amount,
        paid_at,
        due_date:
          dbStatus === 'pending' && studentDueDay(student)
            ? dueDateInMonth(currentMonth, studentDueDay(student))?.toISOString() || null
            : payment?.due_date || null,
        method: payment?.method || student.preferredPaymentMethod || 'pix',
        account: payment?.account || student.preferredPaymentAccount || '',
        plan_name: payment?.plan_name || student.plan || '',
        note,
        registered_by: userId || '',
        registered_by_name: sessionUserName,
        financial_tx_id: payment?.financial_tx_id,
      });
      upsertPaymentInState(doc);
      setPopover(null);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingId(null);
    }
  };

  const saveNoteInline = async (row) => {
    const note = noteDraft.trim();
    setNotePopoverId(null);
    const payment = row.payment;
    const dbStatus = payment
      ? String(payment.status || 'pending')
      : mapDbStatusFromGridForm(row.display.key);
    setSavingId(row.student.id);
    try {
      const doc = await saveMonthlyPayment({
        paymentId: payment?.$id,
        lead_id: row.student.id,
        academy_id: academyId,
        team_id: teamIdForPayments,
        reference_month: currentMonth,
        status: dbStatus,
        paid_amount: receivedAmountForPayment(payment) || row.received,
        expected_amount: row.expected,
        paid_at: payment?.paid_at || null,
        due_date: payment?.due_date || null,
        method: payment?.method || row.student.preferredPaymentMethod || 'pix',
        account: payment?.account || row.student.preferredPaymentAccount || '',
        plan_name: payment?.plan_name || row.student.plan || '',
        note,
        registered_by: userId || payment?.registered_by || '',
        registered_by_name: sessionUserName || payment?.registered_by_name || '',
        financial_tx_id: payment?.financial_tx_id,
      });
      upsertPaymentInState(doc);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingId(null);
    }
  };

  const loadHistory = async (leadId) => {
    if (historyByLead[leadId]) return;
    setHistoryLoading(leadId);
    try {
      const docs = await getStudentPayments(leadId, academyId);
      const byMonth = {};
      for (const d of docs) {
        const ym = String(d.reference_month || '').trim();
        if (ym) byMonth[ym] = d;
      }
      setHistoryByLead((prev) => ({ ...prev, [leadId]: byMonth }));
    } finally {
      setHistoryLoading(null);
    }
  };

  const toggleExpand = (row) => {
    const id = row.student.id;
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    void loadHistory(id);
  };

  const monthHistoryKeys = monthKeysBack(currentMonth, 6);

  const openPopoverForRow = useCallback((row, anchorRect) => {
    const rect =
      anchorRect ||
      {
        top: window.innerHeight * 0.35,
        left: window.innerWidth * 0.5 - 140,
        bottom: window.innerHeight * 0.35 + 1,
        right: window.innerWidth * 0.5 + 140,
        width: 0,
        height: 0,
      };
    setPopover({ row, anchorRect: rect });
  }, []);

  const renderDesktopMainRow = (row) => {
    const { student, payment, expected, display, note } = row;
    const isExpanded = expandedId === student.id;

    return (
      <tr
        key={student.id}
        className={[
          savingId === student.id ? 'grid-row-saving' : '',
          display.key === 'covered' ? 'monthly-grid-row-covered' : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined}
      >
        <td>
          <button
            type="button"
            className="btn-action-ghost monthly-grid-expand-btn"
            onClick={() => toggleExpand(row)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="mensal-cell-name mensal-cell-name--grid">
          <span className="mensal-cell-name__title" title={student.name || undefined}>
            {student.name || '—'}
          </span>
        </td>
        <td className="text-small">{student.plan || payment?.plan_name || '—'}</td>
        {visibleCols.expected ? (
          <td className="monthly-grid-amount">{expected > 0 ? fmtMoney(expected) : '—'}</td>
        ) : null}
        {visibleCols.due ? (
          <td className="text-small">{formatDueDayLabel(student)}</td>
        ) : null}
        {visibleCols.account ? (
          <td className="text-small">
            {student.preferredPaymentAccount || payment?.account ? (
              student.preferredPaymentAccount || payment?.account
            ) : (
              <span className="mensal-cell-faint">—</span>
            )}
          </td>
        ) : null}
        <td>
          <GridStatusBadgeButton
            display={display}
            payment={payment}
            onCoveredExpand={() => toggleExpand(row)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              openPopoverForRow(row, rect);
            }}
          />
        </td>
        <td className="text-small monthly-grid-note-cell">
          {notePopoverId === student.id ? (
            <input
              className="form-input monthly-grid-note-input"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => void saveNoteInline(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveNoteInline(row);
                if (e.key === 'Escape') setNotePopoverId(null);
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setNotePopoverId(student.id);
                setNoteDraft(note);
              }}
              className={`grid-note-icon-btn${note ? ' grid-note-icon-btn--has-note' : ''}`}
              title={note || 'Adicionar nota'}
              aria-label={note ? 'Ver ou editar nota' : 'Adicionar nota'}
            >
              <MessageSquare size={14} />
              {note ? <span className="grid-note-icon-btn__dot" aria-hidden /> : null}
            </button>
          )}
        </td>
      </tr>
    );
  };

  const renderDesktopHistoryRow = (row) => {
    const { student } = row;
    const hist = historyByLead[student.id];

    return (
      <tr key={`${student.id}-history`} className="grid-history-row">
        <td colSpan={desktopColCount} className="grid-history-panel">
          {historyLoading === student.id ? (
            <span className="text-xs text-muted">Carregando histórico…</span>
          ) : (
            <div className="flex gap-2 monthly-grid-history-chips">
              <span className="text-xs text-muted monthly-grid-history-chips__label">
                Últimos 6 meses:
              </span>
              {monthHistoryKeys.map((ym) => {
                const p = hist?.[ym];
                const hKey = historyStatusForMonth(student, p, ym);
                const lbl = HISTORY_BADGE[hKey] || '—';
                const short = ym.slice(5);
                return (
                  <span
                    key={ym}
                    className="monthly-grid-history-chip"
                    title={`${short}: ${GRID_STATUS_LABELS[hKey] || hKey}`}
                  >
                    {short}:{lbl}
                  </span>
                );
              })}
            </div>
          )}
        </td>
      </tr>
    );
  };

  const renderMobileList = () => (
    <div className="mensal-mobile-grid">
      {loading ? (
        <div className="mensal-panel-loading">Carregando…</div>
      ) : sortedRows.length === 0 ? (
        <div className="mensal-panel-empty">
          <EmptyState variant="table-cell" icon={Users} title="Nenhum registro neste filtro" />
        </div>
      ) : (
        sortedRows.map((row) => (
          <MonthlyGridMobileCard
            key={row.student.id}
            row={row}
            monthHistoryKeys={monthHistoryKeys}
            history={historyByLead[row.student.id]}
            historyLoading={historyLoading === row.student.id}
            isExpanded={expandedId === row.student.id}
            isSaving={savingId === row.student.id}
            notePopoverId={notePopoverId}
            noteDraft={noteDraft}
            fmtMoney={fmtMoney}
            onToggleExpand={() => toggleExpand(row)}
            onStatusClick={(e) => {
              if (row.display.key === 'covered') return;
              const rect = e?.currentTarget?.getBoundingClientRect?.();
              openPopoverForRow(row, rect);
            }}
            onNoteOpen={() => {
              setNotePopoverId(row.student.id);
              setNoteDraft(row.note);
            }}
            onNoteDraftChange={setNoteDraft}
            onNoteSave={() => void saveNoteInline(row)}
            onNoteCancel={() => setNotePopoverId(null)}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="monthly-payment-grid">
      <div className="mensal-summary-grid monthly-grid-summary monthly-grid-summary--five">
        <div className="card mensal-summary-metric-card">
          <div className="mensal-summary-metric-card__value finance-data">{fmtMoney(totals.expectedTotal)}</div>
          <div className="text-xs text-muted">Total esperado no mês</div>
        </div>
        <div className="card mensal-summary-metric-card">
          <div className="mensal-summary-metric-card__value finance-amount-positive">{fmtMoney(totals.receivedTotal)}</div>
          <div className="text-xs text-muted">Total recebido</div>
        </div>
        <div className="card mensal-summary-metric-card">
          <div
            className={`monthly-grid-pending-total monthly-grid-pending-total--${totals.pendingTone}`}
          >
            {fmtMoney(totals.pendingTotal)}
          </div>
          <div className="text-xs text-muted">Total pendente</div>
        </div>
        <div className="card mensal-summary-metric-card">
          <div className="mensal-summary-metric-card__value finance-data">
            {totals.paidCount} / {totals.active}
          </div>
          <div className="text-xs text-muted">{terms.student}s pagos</div>
        </div>
        <div className="card mensal-summary-metric-card">
          <div className="mensal-summary-metric-card__value finance-value-pending">{totals.problemCount}</div>
          <div className="text-xs text-muted">Com pendência ou divergência</div>
        </div>
      </div>

      {isMobile ? (
        renderMobileList()
      ) : (
      <div ref={tableScrollRef} className="mensal-table-wrap mensal-table-wrap--scroll-hint monthly-grid-table-wrap">
        <table className="mensal-table monthly-grid-table">
          <colgroup>
            <col className="monthly-grid-col-expand" />
            <col className="monthly-grid-col-name" />
            <col className="monthly-grid-col-plan" />
            <col className="monthly-grid-col-amount" />
            <col className="monthly-grid-col-due" />
            <col className="monthly-grid-col-account" />
            <col className="monthly-grid-col-status" />
            <col className="monthly-grid-col-note" />
          </colgroup>
          <thead>
            <tr>
              <th className="monthly-grid-col-expand" />
              <th>{terms.student}</th>
              <th>Plano</th>
              <th>Valor esperado</th>
              <th>Vencimento</th>
              <th>Conta / plataforma</th>
              <th>Status</th>
              <th className="mensal-th-note" aria-label="Nota" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={desktopColCount} className="monthly-grid-loading-cell">
                  Carregando…
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="monthly-grid-empty-cell">
                  <EmptyState variant="table-cell" icon={Users} title="Nenhum registro neste filtro" />
                </td>
              </tr>
            ) : shouldVirtualizeDesktop ? (
              (() => {
                const virtualRows = rowVirtualizer.getVirtualItems();
                const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
                const paddingBottom =
                  virtualRows.length > 0
                    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
                    : 0;
                return (
                  <>
                    {paddingTop > 0 ? (
                      <tr aria-hidden="true" className="mensal-virtual-spacer" style={{ height: paddingTop }}>
                        <td colSpan={8} />
                      </tr>
                    ) : null}
                    {virtualRows.map((virtualRow) => {
                      const item = desktopTableRows[virtualRow.index];
                      if (!item) return null;
                      return item.kind === 'history'
                        ? renderDesktopHistoryRow(item.row)
                        : renderDesktopMainRow(item.row);
                    })}
                    {paddingBottom > 0 ? (
                      <tr aria-hidden="true" className="mensal-virtual-spacer" style={{ height: paddingBottom }}>
                        <td colSpan={8} />
                      </tr>
                    ) : null}
                  </>
                );
              })()
            ) : (
              sortedRows.map((row) => (
                <React.Fragment key={row.student.id}>
                  {renderDesktopMainRow(row)}
                  {expandedId === row.student.id ? renderDesktopHistoryRow(row) : null}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {popover && typeof document !== 'undefined'
        ? createPortal(
            <PaymentStatusPopover
              anchorRect={popover.anchorRect}
              initialStatus={popover.row.display.key}
              initialPaidAmount={popover.row.received}
              expectedAmount={popover.row.expected}
              initialNote={popover.row.note}
              initialPaidAt={popover.row.payment?.paid_at}
              saving={savingId === popover.row.student.id}
              onSave={handlePopoverSave}
              onClose={() => setPopover(null)}
            />,
            document.body
          )
        : null}

      <style>{`
        .monthly-payment-grid .grid-row-saving { opacity: 0.65; }
        .monthly-payment-grid .grid-status-badge:hover { filter: brightness(0.95); }
        .payment-status-popover { box-shadow: var(--shadow-lg); border: 0.5px solid var(--border-light); }
      `}</style>
    </div>
  );
}

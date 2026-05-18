import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import PaymentStatusPopover from './PaymentStatusPopover.jsx';
import { getStudentPayments, saveMonthlyPayment } from '../../lib/studentPayments';
import {
  expectedAmountForStudent,
  formatDueDayLabel,
  GRID_STATUS_COLORS,
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
  terms,
  addToast,
  friendlyError,
  loading,
}) {
  const [sortBy, setSortBy] = useState('name');
  const [turmaFilter, setTurmaFilter] = useState('all');
  const [popover, setPopover] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [historyByLead, setHistoryByLead] = useState({});
  const [historyLoading, setHistoryLoading] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');

  const turmas = useMemo(() => {
    const set = new Set();
    for (const s of students) {
      const t = studentTurma(s);
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [students]);

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

  const totals = useMemo(() => {
    let expectedTotal = 0;
    let receivedTotal = 0;
    let paidCount = 0;
    let problemCount = 0;
    const active = students.length;
    for (const row of rows) {
      expectedTotal += row.expected || 0;
      const st = row.display.key;
      if (st === 'paid' || st === 'partial') {
        receivedTotal += row.received || 0;
        if (st === 'paid') paidCount += 1;
      }
      if (st === 'awaiting' || st === 'partial' || st === 'pending') problemCount += 1;
    }
    return {
      expectedTotal,
      receivedTotal,
      pendingTotal: Math.max(0, expectedTotal - receivedTotal),
      paidCount,
      active,
      problemCount,
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
    setEditingNoteId(null);
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

  return (
    <div className="monthly-payment-grid">
      <div
        className="mensal-summary-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{fmtMoney(totals.expectedTotal)}</div>
          <div className="text-xs text-muted">Total esperado no mês</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#3B6D11' }}>{fmtMoney(totals.receivedTotal)}</div>
          <div className="text-xs text-muted">Total recebido</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#A32D2D' }}>{fmtMoney(totals.pendingTotal)}</div>
          <div className="text-xs text-muted">Total pendente</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {totals.paidCount} / {totals.active}
          </div>
          <div className="text-xs text-muted">{terms.student}s pagos</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#C2410C' }}>{totals.problemCount}</div>
          <div className="text-xs text-muted">Com pendência ou divergência</div>
        </div>
      </div>

      <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {turmas.length > 0 ? (
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="text-xs">Turma</label>
            <select className="form-input" value={turmaFilter} onChange={(e) => setTurmaFilter(e.target.value)}>
              <option value="all">Todas</option>
              {turmas.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
          <label className="text-xs">Ordenar por</label>
          <select className="form-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Nome</option>
            <option value="due">Vencimento</option>
            <option value="status">Status</option>
            <option value="amount">Valor esperado</option>
          </select>
        </div>
      </div>

      <div className="mensal-table-wrap" style={{ maxHeight: 'calc(100vh - 320px)', overflow: 'auto' }}>
        <table className="mensal-table monthly-grid-table" style={{ minWidth: 960 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface-hover, #f4f4f8)' }}>
            <tr>
              <th style={{ width: 28 }} />
              <th>{terms.student}</th>
              <th>Plano</th>
              <th>Valor esperado</th>
              <th>Vencimento</th>
              <th>Conta / plataforma</th>
              <th>Status</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Carregando…
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center' }}>
                  <EmptyState variant="table-cell" icon={Users} title="Nenhum registro neste filtro" />
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const { student, payment, expected, display, note } = row;
                const colors = GRID_STATUS_COLORS[display.key] || GRID_STATUS_COLORS.none;
                const isExpanded = expandedId === student.id;
                const hist = historyByLead[student.id];

                return (
                  <React.Fragment key={student.id}>
                    <tr className={savingId === student.id ? 'grid-row-saving' : ''}>
                      <td>
                        <button
                          type="button"
                          className="btn-action-ghost"
                          style={{ padding: 2 }}
                          onClick={() => toggleExpand(row)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{student.name || '—'}</td>
                      <td className="text-small">{student.plan || payment?.plan_name || '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                        {expected > 0 ? fmtMoney(expected) : '—'}
                      </td>
                      <td className="text-small">{formatDueDayLabel(student)}</td>
                      <td className="text-small">
                        {student.preferredPaymentAccount || payment?.account || '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="grid-status-badge"
                          style={{
                            background: colors.bg,
                            color: colors.color,
                            border: 'none',
                            borderRadius: 20,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setPopover({
                              row,
                              anchorRect: rect,
                            });
                          }}
                        >
                          {display.label}
                        </button>
                      </td>
                      <td className="text-small" style={{ maxWidth: 200 }}>
                        {editingNoteId === student.id ? (
                          <input
                            className="form-input"
                            style={{ fontSize: 12, padding: '4px 8px' }}
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onBlur={() => void saveNoteInline(row)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveNoteInline(row);
                              if (e.key === 'Escape') setEditingNoteId(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            className="grid-note-btn"
                            onClick={() => {
                              setEditingNoteId(student.id);
                              setNoteDraft(note);
                            }}
                            style={{
                              border: 'none',
                              background: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              textAlign: 'left',
                              color: note ? 'var(--text)' : 'var(--text-secondary)',
                              fontStyle: note ? 'normal' : 'italic',
                              fontSize: 12,
                            }}
                            title={note || 'Adicionar observação'}
                          >
                            {note ? truncateNote(note) : 'Adicionar…'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr>
                        <td colSpan={8} style={{ padding: '8px 16px 12px 40px', background: 'var(--surface-hover)' }}>
                          {historyLoading === student.id ? (
                            <span className="text-xs text-muted">Carregando histórico…</span>
                          ) : (
                            <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                              <span className="text-xs text-muted" style={{ marginRight: 4 }}>
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
                                    title={`${short}: ${GRID_STATUS_LABELS[hKey] || hKey}`}
                                    style={{
                                      fontSize: 10,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background: 'var(--surface)',
                                      border: '0.5px solid var(--border-light)',
                                    }}
                                  >
                                    {short}:{lbl}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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
        .payment-status-popover { box-shadow: 0 8px 24px rgba(0,0,0,0.12); border: 0.5px solid var(--border-light); }
      `}</style>
    </div>
  );
}

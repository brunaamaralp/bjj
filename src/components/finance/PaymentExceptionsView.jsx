import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';
import useMatchMobile from '../../hooks/useMatchMobile.js';
import PaymentStatusPopover from './PaymentStatusPopover.jsx';
import PaymentExceptionMobileCard from './PaymentExceptionMobileCard.jsx';
import { saveMonthlyPayment } from '../../lib/studentPayments';
import { mapDbStatusFromGridForm } from '../../lib/paymentStatus';
import {
  analyzePaymentException,
  isPaymentExceptionResolved,
  readExceptionStatusLabels,
  labelForExceptionStatus,
  exceptionStatusBadgeClass,
  exceptionDiffClass,
  formatExceptionDueLabel,
  studentTurma,
  studentPaymentPlatform,
  EXCEPTION_STATUS_KEYS,
} from '../../lib/paymentExceptions';
import { studentDueDay, dueDateInMonth } from '../../lib/collectionOverdue.js';
import EmptyState from '../shared/EmptyState.jsx';
import Hint from '../shared/Hint.jsx';
function displayNote(note, max = 80) {
  const s = String(note || '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export default function PaymentExceptionsView({
  students,
  paymentMap,
  setPayments,
  currentMonth,
  financeConfig,
  academyId,
  teamIdForPayments,
  userId,
  sessionUserName,
  search,
  statusFilter = 'all',
  turmaFilter = 'all',
  platformFilter = 'all',
  onlyWithDiff = false,
  sortBy = 'difference',
  terms,
  addToast,
  friendlyError,
  loading,
}) {
  const statusLabels = useMemo(
    () => readExceptionStatusLabels(financeConfig),
    [financeConfig]
  );

  const [popover, setPopover] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [resolvedFlash, setResolvedFlash] = useState(() => new Set());
  const [resolvedSnapshot, setResolvedSnapshot] = useState({});
  const isMobile = useMatchMobile();

  const exceptionRows = useMemo(() => {
    return students
      .map((student) => {
        const payment = paymentMap[student.id];
        const analysis = analyzePaymentException(student, payment, currentMonth, financeConfig);
        if (!analysis.isException) return null;
        return {
          student,
          payment,
          ...analysis,
          note: String(payment?.note || '').trim(),
          turma: studentTurma(student),
          platform: studentPaymentPlatform(student, payment),
          plan: student.plan || payment?.plan_name || '—',
        };
      })
      .filter(Boolean);
  }, [students, paymentMap, currentMonth, financeConfig]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exceptionRows.filter((row) => {
      if (
        statusFilter !== 'all' &&
        !row.reasons.includes(statusFilter) &&
        row.primaryStatus !== statusFilter
      ) {
        return false;
      }
      if (turmaFilter !== 'all' && row.turma !== turmaFilter) return false;
      if (platformFilter !== 'all' && row.platform !== platformFilter) return false;
      if (onlyWithDiff && row.difference <= 0.009) return false;
      if (q && !String(row.student.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exceptionRows, statusFilter, turmaFilter, platformFilter, onlyWithDiff, search]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      if (sortBy === 'difference') return b.difference - a.difference;
      if (sortBy === 'due') {
        const ad = a.row?.daysOverdue ?? 0;
        const bd = b.row?.daysOverdue ?? 0;
        return bd - ad;
      }
      if (sortBy === 'status') {
        return a.primaryStatus.localeCompare(b.primaryStatus, 'pt-BR');
      }
      return String(a.student.name || '').localeCompare(String(b.student.name || ''), 'pt-BR');
    });
    return copy;
  }, [filteredRows, sortBy]);

  const displayRows = useMemo(() => {
    const byId = new Map(sortedRows.map((r) => [r.student.id, r]));
    for (const [id, row] of Object.entries(resolvedSnapshot)) {
      if (resolvedFlash.has(id) && !byId.has(id)) byId.set(id, row);
    }
    return Array.from(byId.values());
  }, [sortedRows, resolvedSnapshot, resolvedFlash]);

  const totals = useMemo(() => {
    const byStatus = {};
    for (const k of EXCEPTION_STATUS_KEYS) byStatus[k] = 0;
    let openValue = 0;
    for (const row of displayRows) {
      if (resolvedFlash.has(row.student.id)) continue;
      openValue += Math.max(0, row.difference);
      byStatus[row.primaryStatus] = (byStatus[row.primaryStatus] || 0) + 1;
    }
    return {
      count: displayRows.filter((r) => !resolvedFlash.has(r.student.id)).length,
      openValue,
      byStatus,
    };
  }, [displayRows, resolvedFlash]);

  const fmtMoney = (n) => {
    try {
      return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${Number(n || 0).toFixed(2)}`;
    }
  };

  const upsertPaymentInState = useCallback(
    (doc, studentId) => {
      const lid = String(doc.lead_id || studentId || '').trim();
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
    },
    [setPayments, currentMonth]
  );

  const checkResolvedAfterSave = useCallback(
    (student, doc, rowSnapshot) => {
      if (!isPaymentExceptionResolved(student, doc, currentMonth, financeConfig)) return;
      const sid = student.id;
      if (rowSnapshot) {
        setResolvedSnapshot((prev) => ({ ...prev, [sid]: rowSnapshot }));
      }
      setResolvedFlash((prev) => new Set(prev).add(sid));
      window.setTimeout(() => {
        setResolvedFlash((prev) => {
          const next = new Set(prev);
          next.delete(sid);
          return next;
        });
        setResolvedSnapshot((prev) => {
          const next = { ...prev };
          delete next[sid];
          return next;
        });
      }, 1000);
    },
    [currentMonth, financeConfig]
  );

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
      upsertPaymentInState(doc, student.id);
      checkResolvedAfterSave(student, doc, popover.row);
      setPopover(null);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingId(null);
    }
  };

  const saveNoteInline = async (row) => {
    const note = noteDraft.trim();
    const sid = row.student.id;
    if (note === String(row.note || '').trim()) {
      setEditingNoteId(null);
      return;
    }
    setEditingNoteId(null);
    setSavingId(sid);
    const payment = row.payment;
    const dbStatus = payment
      ? String(payment.status || 'pending')
      : mapDbStatusFromGridForm(row.primaryStatus);
    try {
      const doc = await saveMonthlyPayment({
        paymentId: payment?.$id,
        lead_id: sid,
        academy_id: academyId,
        team_id: teamIdForPayments,
        reference_month: currentMonth,
        status: dbStatus,
        paid_amount: row.received,
        expected_amount: row.expected,
        paid_at: payment?.paid_at || null,
        due_date: payment?.due_date || null,
        method: payment?.method || row.student.preferredPaymentMethod || 'pix',
        account: payment?.account || row.student.preferredPaymentAccount || '',
        plan_name: payment?.plan_name || row.plan || '',
        note,
        registered_by: userId || payment?.registered_by || '',
        registered_by_name: sessionUserName || payment?.registered_by_name || '',
        financial_tx_id: payment?.financial_tx_id,
      });
      upsertPaymentInState(doc, sid);
      checkResolvedAfterSave(row.student, doc, row);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingId(null);
    }
  };

  const mapPopoverInitialStatus = (row) => {
    const k = row.primaryStatus;
    if (k === 'none') return 'pending';
    if (k === 'divergence') return 'partial';
    return k;
  };

  const openPopoverForRow = (row, anchorRect) => {
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
  };

  const renderMobileList = () => (
    <div className="mensal-mobile-grid mensal-mobile-grid--exceptions">
      {loading ? (
        <div className="payment-exceptions-mobile-loading">Carregando…</div>
      ) : displayRows.length === 0 ? (
        <div className="payment-exceptions-mobile-empty">
          <EmptyState
            variant="table-cell"
            icon={AlertCircle}
            title="Nenhuma pendência este mês"
            description={
              exceptionRows.length === 0
                ? 'Todos os pagamentos estão em dia ou aguardando confirmação conforme esperado.'
                : 'Nenhum caso corresponde aos filtros selecionados.'
            }
          />
        </div>
      ) : (
        displayRows.map((row) => (
          <PaymentExceptionMobileCard
            key={row.student.id}
            row={row}
            currentMonth={currentMonth}
            statusLabels={statusLabels}
            flash={resolvedFlash.has(row.student.id)}
            isSaving={savingId === row.student.id}
            editingNoteId={editingNoteId}
            noteDraft={noteDraft}
            fmtMoney={fmtMoney}
            onUpdate={(e) => {
              const rect = e?.currentTarget?.getBoundingClientRect?.();
              openPopoverForRow(row, rect);
            }}
            onNoteOpen={() => {
              setEditingNoteId(row.student.id);
              setNoteDraft(row.note);
            }}
            onNoteDraftChange={setNoteDraft}
            onNoteSave={() => void saveNoteInline(row)}
            onNoteCancel={() => setEditingNoteId(null)}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="payment-exceptions-view">
      <div className="mensal-summary-grid payment-exceptions-summary payment-exceptions-summary--balanced">
        <div className="card mensal-summary-metric-card payment-exceptions-summary__metric">
          <div className="mensal-summary-metric-card__value mensal-summary-metric-card__value--lg finance-data">{totals.count}</div>
          <div className="text-xs text-muted">Total de casos</div>
        </div>
        <div className="card mensal-summary-metric-card payment-exceptions-summary__metric">
          <div className="mensal-summary-metric-card__value mensal-summary-metric-card__value--lg finance-amount-negative">{fmtMoney(totals.openValue)}</div>
          <div className="text-xs text-muted">Valor em aberto</div>
        </div>
        <div className="card mensal-summary-metric-card payment-exceptions-summary__metric payment-exceptions-summary__status-card">
          <div className="text-xs text-muted payment-exceptions-summary__status-label">Por status</div>
          <div className="payment-exceptions-summary__chips">
            {EXCEPTION_STATUS_KEYS.map((key) => {
              const n = totals.byStatus[key] || 0;
              if (!n) return null;
              return (
                <span key={key} className={exceptionStatusBadgeClass(key)}>
                  {n} {labelForExceptionStatus(key, statusLabels)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {isMobile ? (
        renderMobileList()
      ) : (
      <div className="mensal-table-wrap payment-exceptions-table-wrap">
        <table className="mensal-table payment-exceptions-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Plano</th>
              <th>Esperado</th>
              <th>Recebido</th>
              <th>Diferença</th>
              <th>Vencimento</th>
              <th>
                <span
                  className="mensal-th-with-hint"
                  title="Conta bancária ou forma de pagamento cadastrada no aluno — use para saber onde conferir o recebimento."
                >
                  Conferir em
                  <Hint
                    text="Indica onde o pagamento deve ser conferido: conta bancária ou forma de pagamento preferida do aluno (Pix, cartão, etc.), conforme o cadastro."
                    position="top"
                    className="payment-exceptions-th-hint"
                  />
                </span>
              </th>
              <th>Status</th>
              <th>Observação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="payment-exceptions-loading-cell">
                  Carregando…
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="payment-exceptions-empty-cell">
                  <EmptyState
                    variant="table-cell"
                    icon={AlertCircle}
                    title="Nenhuma pendência este mês"
                    description={
                      exceptionRows.length === 0
                        ? 'Todos os pagamentos estão em dia ou aguardando confirmação conforme esperado.'
                        : 'Nenhum caso corresponde aos filtros selecionados.'
                    }
                  />
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const flash = resolvedFlash.has(row.student.id);
                const rowClass = [
                  flash ? 'payment-exception-row--flash' : '',
                  savingId === row.student.id ? 'payment-exception-row--saving' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <tr key={row.student.id} className={rowClass || undefined}>
                    <td className="payment-exception-name">{row.student.name || '—'}</td>
                    <td className="text-small">{row.plan}</td>
                    <td className="payment-exception-num">{fmtMoney(row.expected)}</td>
                    <td className="payment-exception-num">{fmtMoney(row.received)}</td>
                    <td className={exceptionDiffClass(row)}>{fmtMoney(row.difference)}</td>
                    <td className="text-small">{formatExceptionDueLabel(row.student, row.row, currentMonth)}</td>
                    <td className="text-small">{row.platform}</td>
                    <td>
                      <span className={exceptionStatusBadgeClass(row.primaryStatus)}>
                        {labelForExceptionStatus(row.primaryStatus, statusLabels)}
                      </span>
                    </td>
                    <td className="payment-exception-note-cell">
                      {editingNoteId === row.student.id ? (
                        <input
                          className="form-input payment-exception-note-input--table"
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          onBlur={() => void saveNoteInline(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void saveNoteInline(row);
                            }
                            if (e.key === 'Escape') setEditingNoteId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(row.student.id);
                            setNoteDraft(row.note);
                          }}
                          className={`payment-exception-note-btn ${
                            row.note ? 'payment-exception-note-btn--filled' : 'payment-exception-note-btn--empty'
                          }`}
                          title={row.note || 'Clique para adicionar observação'}
                        >
                          {row.note ? displayNote(row.note, 80) : 'Clique para anotar…'}
                        </button>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setPopover({ row, anchorRect: rect });
                        }}
                      >
                        Atualizar
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {popover && typeof document !== 'undefined'
        ? createPortal(
            <PaymentStatusPopover
              anchorRect={popover.anchorRect}
              initialStatus={mapPopoverInitialStatus(popover.row)}
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
        .payment-exceptions-view .grid-note-btn:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}

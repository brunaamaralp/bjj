import React, { useMemo, useState, useEffect } from 'react';
import {
  Check,
  Clock,
  AlertTriangle,
  CircleDashed,
  CircleAlert,
  Banknote,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { isCriancaProfileType } from '../../../lib/leadTypeNormalize.js';
import EmptyState from '../shared/EmptyState.jsx';
import { Users } from 'lucide-react';

const GROUP_ORDER = ['Kids', 'Juniores', 'Adultos', 'Outros'];

function studentGroupKey(student) {
  const turma = String(student?.turma || student?.className || student?.class_name || '').trim();
  if (turma) {
    const low = turma.toLowerCase();
    if (low.includes('kid') || low.includes('crian')) return 'Kids';
    if (low.includes('junior')) return 'Juniores';
    if (low.includes('adult')) return 'Adultos';
    return turma;
  }
  const t = String(student?.type || '').trim();
  if (isCriancaProfileType(t) || t === 'Criança') return 'Kids';
  if (t === 'Juniores') return 'Juniores';
  if (t === 'Adulto') return 'Adultos';
  return 'Outros';
}

function StatusBadge({ variant, children }) {
  const icons = {
    paid: Check,
    awaiting: Clock,
    partial: CircleDashed,
    pending: CircleAlert,
    soon: AlertTriangle,
    none: CircleDashed,
  };
  const Icon = icons[variant] || CircleDashed;
  return (
    <span className={`mensal-status-badge mensal-status-badge--${variant}`}>
      <Icon size={12} strokeWidth={2.25} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

export default function MensalidadesListTable({
  loading,
  displayedStudents,
  terms,
  paymentMap,
  currentMonth,
  getRowStatus,
  startOfLocalDay,
  formatDdMm,
  parseYmdLocal,
  fmtMoney,
  METHOD_LABELS,
  dueSortOrder,
  setDueSortOrder,
  openPaymentModal,
  handleEstornar,
}) {
  const [expandedGroups, setExpandedGroups] = useState({});

  const studentsByGroup = useMemo(() => {
    const map = new Map();
    for (const s of displayedStudents) {
      const g = studentGroupKey(s);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(s);
    }
    const keys = [...map.keys()].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a);
      const ib = GROUP_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'pt-BR');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return keys.map((key) => ({ key, students: map.get(key) }));
  }, [displayedStudents]);

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      studentsByGroup.forEach((g, i) => {
        if (next[g.key] === undefined) {
          next[g.key] = displayedStudents.length < 36 || i === 0;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [studentsByGroup, displayedStudents.length]);

  const renderStudentRow = (student, rowIndex) => {
    const payment = paymentMap[student.id];
    const row = getRowStatus(student, payment, currentMonth);
    const today0 = startOfLocalDay(new Date());
    const venc = row.dueDate;
    let vencCell = '—';
    let vencIsEmpty = true;
    let vencStyle = {};
    if (row.status === 'paid' && row.paidAt) {
      vencCell = `Pago em ${formatDdMm(row.paidAt)}`;
      vencIsEmpty = false;
    } else if (venc && !Number.isNaN(venc.getTime())) {
      vencIsEmpty = false;
      const diff = Math.ceil((today0 - startOfLocalDay(venc)) / 86400000);
      if (diff > 0) {
        vencCell = `${formatDdMm(venc)} · ${diff} dias em atraso`;
        vencStyle = { color: '#A32D2D', fontWeight: 500 };
      } else if (diff <= 0 && diff >= -7) {
        const until = Math.abs(diff);
        vencCell = `${formatDdMm(venc)} · vence em ${until} dias`;
        vencStyle = { color: '#B45309', fontWeight: 500 };
      } else {
        vencCell = formatDdMm(venc);
      }
    }

    const amountNum = payment && payment.status === 'paid' ? Number(payment.amount) : null;
    const hasValor = amountNum != null && Number.isFinite(amountNum) && amountNum > 0;
    const valorCell = hasValor ? fmtMoney(amountNum) : '—';

    const prefM = student.preferredPaymentMethod;
    const prefA = student.preferredPaymentAccount;

    let badgeVariant = 'none';
    let badgeLabel = 'Sem registro';
    if (payment?.status === 'awaiting') {
      badgeVariant = 'awaiting';
      badgeLabel = 'Aguardando';
    } else if (payment?.status === 'partial') {
      badgeVariant = 'partial';
      badgeLabel = 'Parcial';
    } else if (row.status === 'paid' && payment) {
      badgeVariant = 'paid';
      const m = METHOD_LABELS[payment.method] || payment.method;
      const pd = payment.paid_at ? formatDdMm(parseYmdLocal(String(payment.paid_at).slice(0, 10))) : '';
      badgeLabel = `Pago · ${m}${pd ? ` · ${pd}` : ''}`;
    } else if (row.status === 'pending') {
      badgeVariant = 'pending';
      badgeLabel = 'Inadimplente';
    } else if (row.status === 'soon') {
      badgeVariant = 'soon';
      badgeLabel = 'A vencer';
    }

    const isPaid = row.status === 'paid' && payment?.status === 'paid';
    const needsAction =
      !isPaid &&
      (row.status === 'pending' ||
        row.status === 'none' ||
        row.status === 'soon' ||
        payment?.status === 'awaiting' ||
        payment?.status === 'partial');
    const rowTone = isPaid ? 'paid' : row.status === 'pending' ? 'pending' : row.status === 'none' ? 'none' : 'default';

    const paidTooltip =
      isPaid && payment
        ? `Pago · ${METHOD_LABELS[payment.method] || payment.method} · ${fmtMoney(payment.amount)}${
            payment.paid_at
              ? ` · ${formatDdMm(parseYmdLocal(String(payment.paid_at).slice(0, 10)))}`
              : ''
          }`
        : undefined;

    const rowClass = [
      'mensal-row',
      rowIndex % 2 === 1 ? 'mensal-row--zebra' : '',
      `mensal-row--${rowTone}`,
      needsAction ? 'mensal-row--actionable' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <tr key={student.id} className={rowClass} title={paidTooltip}>
        <td>
          <div className="mensal-cell-name">
            <span className="mensal-cell-name__title">{student.name || '—'}</span>
            <span className="mensal-cell-name__plan">{student.plan || '—'}</span>
          </div>
        </td>
        <td className={vencIsEmpty ? 'mensal-cell-empty' : ''} style={vencStyle}>
          {vencCell}
        </td>
        <td className={`mensal-cell-valor${hasValor ? ' mensal-cell-valor--filled' : ' mensal-cell-empty'}`}>
          {valorCell}
        </td>
        <td>
          {prefM ? (
            <div className="mensal-cell-pref">
              <span>{METHOD_LABELS[prefM] || prefM}</span>
              {prefA ? <span className="mensal-cell-pref__sub">{prefA}</span> : null}
            </div>
          ) : (
            <span className="mensal-cell-empty">Não definido</span>
          )}
        </td>
        <td>
          <StatusBadge variant={badgeVariant}>{badgeLabel}</StatusBadge>
        </td>
        <td className="mensal-cell-action">
          {isPaid ? (
            <div className="mensal-action-paid" title={paidTooltip}>
              <span className="mensal-action-check" aria-label="Pago">
                <Check size={18} strokeWidth={2.5} />
              </span>
              <button
                type="button"
                className="mensal-btn-estornar mensal-btn-estornar--hover"
                onClick={() => handleEstornar(payment)}
              >
                Estornar
              </button>
            </div>
          ) : (
            <div className="mensal-action-pay-wrap">
              <button
                type="button"
                className="mensal-btn-pay-icon"
                onClick={() => openPaymentModal(student)}
                aria-label="Registrar pagamento"
                title="Registrar pagamento"
              >
                <Banknote size={16} strokeWidth={2} />
              </button>
              <button type="button" className="mensal-btn-pay mensal-btn-pay--hover" onClick={() => openPaymentModal(student)}>
                Registrar pagamento
              </button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  const renderMobileCard = (student) => {
    const payment = paymentMap[student.id];
    const row = getRowStatus(student, payment, currentMonth);
    const isPaid = row.status === 'paid' && payment?.status === 'paid';
    const amountNum = payment && payment.status === 'paid' ? Number(payment.amount) : null;
    const hasValor = amountNum != null && Number.isFinite(amountNum) && amountNum > 0;

    let badgeVariant = 'none';
    let badgeLabel = 'Sem registro';
    if (payment?.status === 'awaiting') {
      badgeVariant = 'awaiting';
      badgeLabel = 'Aguardando';
    } else if (row.status === 'paid' && payment) {
      badgeVariant = 'paid';
      badgeLabel = 'Pago';
    } else if (row.status === 'pending') {
      badgeVariant = 'pending';
      badgeLabel = 'Inadimplente';
    } else if (row.status === 'soon') {
      badgeVariant = 'soon';
      badgeLabel = 'A vencer';
    }

    const rowTone = isPaid ? 'paid' : row.status === 'pending' ? 'pending' : row.status === 'none' ? 'none' : 'default';

    return (
      <article key={student.id} className={`mensal-mobile-card mensal-mobile-card--${rowTone}`}>
        <div className="mensal-mobile-card__head">
          <div>
            <div className="mensal-mobile-card__name">{student.name}</div>
            <div className="mensal-mobile-card__meta">{student.plan || '—'}</div>
          </div>
          <StatusBadge variant={badgeVariant}>{badgeLabel}</StatusBadge>
        </div>
        <div className="mensal-mobile-card__row">
          <span>Valor</span>
          <strong className={hasValor ? '' : 'mensal-cell-empty'}>{hasValor ? fmtMoney(amountNum) : '—'}</strong>
        </div>
        <div className="mensal-mobile-card__actions">
          {isPaid ? (
            <>
              <span className="mensal-action-check mensal-action-check--solo" aria-hidden>
                <Check size={20} strokeWidth={2.5} />
              </span>
              <button type="button" className="mensal-btn-estornar" onClick={() => handleEstornar(payment)}>
                Estornar
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary mensal-mobile-pay" onClick={() => openPaymentModal(student)}>
              <Banknote size={16} /> Registrar pagamento
            </button>
          )}
        </div>
      </article>
    );
  };

  if (loading) {
    return (
      <p className="mensal-loading text-small text-muted" role="status">
        Carregando…
      </p>
    );
  }

  if (displayedStudents.length === 0) {
    return (
      <EmptyState
        variant="compact"
        tone="dashed"
        icon={Users}
        title={`Nenhum ${terms.student.toLowerCase()} encontrado`}
        description="Tente ajustar os filtros ou a busca"
        role="status"
      />
    );
  }

  let globalRowIndex = 0;

  return (
    <>
      <div className="mensal-table-wrap mensal-table-wrap--desktop">
        <table className="mensal-table">
          <thead>
            <tr>
              <th>{terms.student}</th>
              <th>
                <button
                  type="button"
                  className={`mensal-th-sort${dueSortOrder != null ? ' mensal-th-sort--active' : ''}`}
                  onClick={() =>
                    setDueSortOrder((prev) => (prev === null ? 'asc' : prev === 'asc' ? 'desc' : null))
                  }
                >
                  <span>Vencimento</span>
                  <span className="mensal-th-sort__icon" aria-hidden>
                    {dueSortOrder === 'asc' ? '↑' : dueSortOrder === 'desc' ? '↓' : '↕'}
                  </span>
                </button>
              </th>
              <th className="mensal-th-num">Valor</th>
              <th>Pagamento habitual</th>
              <th>Status</th>
              <th className="mensal-th-action">Ação</th>
            </tr>
          </thead>
          <tbody className="mensal-tbody">
            {studentsByGroup.map((group) => {
              const expanded = expandedGroups[group.key] !== false;
              const showGroupHeader = studentsByGroup.length > 1;
              return (
                <React.Fragment key={group.key}>
                  {showGroupHeader ? (
                    <tr className="mensal-group-row">
                      <td colSpan={6}>
                        <button
                          type="button"
                          className="mensal-group-toggle"
                          onClick={() =>
                            setExpandedGroups((prev) => ({ ...prev, [group.key]: !expanded }))
                          }
                          aria-expanded={expanded}
                        >
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <span>{group.key}</span>
                          <span className="mensal-group-toggle__count">{group.students.length}</span>
                        </button>
                      </td>
                    </tr>
                  ) : null}
                  {expanded
                    ? group.students.map((student) => {
                        const el = renderStudentRow(student, globalRowIndex);
                        globalRowIndex += 1;
                        return el;
                      })
                    : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mensal-mobile-list">
        {displayedStudents.map((student) => renderMobileCard(student))}
      </div>
    </>
  );
}


import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { EMPRESA_FINANCE_CONFIG_PATH } from '../../lib/financeiroHubTabs.js';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Check,
  Clock,
  AlertTriangle,
  CircleDashed,
  CircleAlert,
  Pause,
  Banknote,
  ChevronDown,
  ChevronRight,
  Loader2,
  Users,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { getPaymentRowStatus } from '../../lib/collectionOverdue.js';
import { sortTurmaGroupKeys, studentTurmaGroupKey } from '../../lib/academyTurmas.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

function StatusBadge({ variant, children }) {
  const icons = {
    paid: Check,
    awaiting: Clock,
    partial: CircleDashed,
    pending: CircleAlert,
    soon: AlertTriangle,
    none: null,
    frozen: Pause,
    cancelled: CircleDashed,
  };
  const Icon = icons[variant];
  const financeBadgeClassByVariant = {
    paid: 'finance-badge-pago',
    covered: 'finance-badge-pago',
    awaiting: 'finance-badge-aguardando',
    partial: 'finance-badge-parcial',
    pending: 'finance-badge-atrasado',
    soon: 'finance-badge-pendente',
    none: 'finance-badge-recorrente',
    frozen: 'finance-badge-cancelado',
    cancelled: 'finance-badge-cancelado',
  };
  const financeBadgeClass = financeBadgeClassByVariant[variant] || 'finance-badge-recorrente';
  return (
    <span className={`mensal-status-badge mensal-status-badge--${variant} ${financeBadgeClass}`}>
      {Icon ? <Icon size={12} strokeWidth={2.25} aria-hidden /> : null}
      <span>{children}</span>
    </span>
  );
}

export default function MensalidadesListTable({
  loading,
  displayedStudents,
  hasStudentsWithPlan,
  hasActiveFilters,
  onClearFilters,
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
  configuredTurmas = [],
  canReverse = true,
  linkStudentProfile = false,
  navRole = 'member',
}) {
  const reverseBlocked = !canReverse;
  const reverseBlockedTitle = 'Apenas gestores podem estornar pagamentos.';
  const profileLinkTitle = 'Acesso ao perfil financeiro disponível para gestores';
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState({});
  const [confirmPayment, setConfirmPayment] = useState(null);
  const [reversingPaymentId, setReversingPaymentId] = useState(null);
  const mobileListRef = useRef(null);
  const shouldVirtualizeMobile = displayedStudents.length > 50;
  const mobileVirtualizer = useVirtualizer({
    count: shouldVirtualizeMobile ? displayedStudents.length : 0,
    getScrollElement: () => mobileListRef.current,
    estimateSize: () => 168,
    overscan: 5,
  });

  const requestEstornar = (payment) => {
    if (!payment?.$id || reversingPaymentId || reverseBlocked) return;
    setConfirmPayment(payment);
  };

  const confirmEstornar = async () => {
    const payment = confirmPayment;
    const id = payment?.$id;
    if (!id) return;
    setConfirmPayment(null);
    setReversingPaymentId(id);
    try {
      await handleEstornar(payment);
    } catch {
      /* toast no pai */
    } finally {
      setReversingPaymentId(null);
    }
  };

  const studentsByGroup = useMemo(() => {
    const map = new Map();
    for (const s of displayedStudents) {
      const g = studentTurmaGroupKey(s, configuredTurmas);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(s);
    }
    const keys = sortTurmaGroupKeys([...map.keys()], configuredTurmas);
    return keys.map((key) => ({ key, students: map.get(key) }));
  }, [displayedStudents, configuredTurmas]);

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

  const renderStudentName = (student, { canRegister, displayName, mobile = false }) => {
    const title = displayName !== '—' ? displayName : undefined;
    const btnClass = mobile
      ? 'mensal-mobile-card__name mensal-cell-name__btn'
      : 'mensal-cell-name__title mensal-cell-name__btn';
    if (canRegister) {
      return (
        <button type="button" className={btnClass} title={title} onClick={() => openPaymentModal(student)}>
          {displayName}
        </button>
      );
    }
    if (linkStudentProfile) {
      return (
        <button
          type="button"
          className={btnClass}
          title={title}
          onClick={() => navigate(`/student/${student.id}`)}
        >
          {displayName}
        </button>
      );
    }
    return (
      <span
        className={mobile ? 'mensal-mobile-card__name' : 'mensal-cell-name__title'}
        title={profileLinkTitle}
      >
        {displayName}
      </span>
    );
  };

  const renderStudentRow = (student, rowIndex) => {
    const payment = paymentMap[student.id];
    const studentFrozen = String(student.freeze_status || '') === 'active';
    const rowMeta = getRowStatus(student, payment, currentMonth);
    const statusKey = rowMeta?.status || 'none';
    const calendar = getPaymentRowStatus(student, payment, currentMonth);
    const dbStatus = String(payment?.status || '').toLowerCase();
    const today0 = startOfLocalDay(new Date());
    const venc = calendar.dueDate;
    let vencCell = '—';
    let vencIsEmpty = true;
    let vencClassName = '';
    if (statusKey === 'paid' && payment?.paid_at) {
      const paidAt = parseYmdLocal(String(payment.paid_at).slice(0, 10));
      vencCell = paidAt ? `Pago em ${formatDdMm(paidAt)}` : 'Pago';
      vencIsEmpty = false;
    } else if (venc && !Number.isNaN(venc.getTime())) {
      vencIsEmpty = false;
      const diff = Math.ceil((today0 - startOfLocalDay(venc)) / 86400000);
      if (diff > 0) {
        vencCell = `${formatDdMm(venc)} · ${diff} dias em atraso`;
        vencClassName = 'finance-value-negative mensal-cell-venc-highlight';
      } else if (diff <= 0 && diff >= -7) {
        const until = Math.abs(diff);
        vencCell = `${formatDdMm(venc)} · vence em ${until} dias`;
        vencClassName = 'finance-value-pending mensal-cell-venc-highlight';
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
    let badgeLabel = 'Não registrado';
    if (studentFrozen || dbStatus === 'frozen') {
      badgeVariant = 'frozen';
      badgeLabel = 'Trancado';
    } else if (payment?.status === 'awaiting') {
      badgeVariant = 'awaiting';
      badgeLabel = 'Aguardando';
    } else if (payment?.status === 'partial') {
      badgeVariant = 'partial';
      badgeLabel = 'Parcial';
    } else if (payment?.status === 'covered' || statusKey === 'covered') {
      badgeVariant = 'covered';
      badgeLabel = 'Coberto';
    } else if (statusKey === 'paid' && payment) {
      badgeVariant = 'paid';
      badgeLabel = 'Pago';
    } else if (dbStatus === 'cancelled') {
      badgeVariant = 'cancelled';
      badgeLabel = 'Cancelado';
    } else if (statusKey === 'pending') {
      badgeVariant = 'pending';
      badgeLabel = 'Em atraso';
    } else if (statusKey === 'soon') {
      badgeVariant = 'soon';
      badgeLabel = 'A vencer';
    }

    const isPaid = statusKey === 'paid' && payment?.status === 'paid';
    const isActiveAttention = dbStatus === 'awaiting' || dbStatus === 'partial';
    const rowTone = isPaid ? 'paid' : statusKey === 'pending' ? 'pending' : statusKey === 'none' ? 'none' : 'default';

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
      isActiveAttention ? 'mensal-row--attention' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const displayName = String(student.name || '').trim() || '—';
    const canRegister = !studentFrozen && !isPaid;

    return (
      <tr key={student.id} className={rowClass} title={isPaid ? paidTooltip : undefined}>
        <td>
          <div className="mensal-cell-name">
            {renderStudentName(student, { canRegister, displayName })}
            <span className="mensal-cell-name__plan">{student.plan || '—'}</span>
          </div>
        </td>
        <td className={`${vencIsEmpty ? 'mensal-cell-empty' : ''} ${vencClassName}`.trim()}>
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
            <span className="mensal-cell-faint">—</span>
          )}
        </td>
        <td>
          <StatusBadge variant={badgeVariant}>{badgeLabel}</StatusBadge>
        </td>
        <td className="mensal-cell-action">
          {studentFrozen ? (
            <span className="mensal-cell-faint mensal-cell-faint--small">
              —
            </span>
          ) : isPaid ? (
            <div className="mensal-action-paid" title={paidTooltip}>
              <span className="mensal-action-check" aria-label="Pago">
                <Check size={16} strokeWidth={2.5} />
              </span>
              <button
                type="button"
                className="mensal-btn-estornar mensal-btn-estornar--hover"
                onClick={() => requestEstornar(payment)}
                disabled={reversingPaymentId === payment.$id || reverseBlocked}
                title={reverseBlocked ? reverseBlockedTitle : undefined}
              >
                {reversingPaymentId === payment.$id ? (
                  <Loader2 size={14} className="navi-async-btn__spin" aria-hidden />
                ) : null}
                Estornar
              </button>
            </div>
          ) : isActiveAttention ? (
            <div className="mensal-action-attention">
              <button
                type="button"
                className="mensal-btn-pay mensal-btn-pay--compact"
                onClick={() => openPaymentModal(student)}
              >
                <Banknote size={14} strokeWidth={2} /> Registrar
              </button>
            </div>
          ) : (
            <div className="mensal-action-pay-wrap">
              <button
                type="button"
                className="mensal-btn-pay mensal-btn-pay--compact"
                onClick={() => openPaymentModal(student)}
              >
                <Banknote size={14} strokeWidth={2} /> Registrar
              </button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  const renderMobileCard = (student) => {
    const payment = paymentMap[student.id];
    const studentFrozen = String(student.freeze_status || '') === 'active';
    const dbStatus = String(payment?.status || '').toLowerCase();
    const rowMeta = getRowStatus(student, payment, currentMonth);
    const statusKey = rowMeta?.status || 'none';
    const calendar = getPaymentRowStatus(student, payment, currentMonth);
    const isPaid = statusKey === 'paid' && payment?.status === 'paid';
    const prefM = student.preferredPaymentMethod;
    const prefA = student.preferredPaymentAccount;

    let badgeVariant = 'none';
    let badgeLabel = 'Não registrado';
    if (studentFrozen || dbStatus === 'frozen') {
      badgeVariant = 'frozen';
      badgeLabel = 'Trancado';
    } else if (payment?.status === 'awaiting') {
      badgeVariant = 'awaiting';
      badgeLabel = 'Aguardando';
    } else if (payment?.status === 'partial') {
      badgeVariant = 'partial';
      badgeLabel = 'Parcial';
    } else if (payment?.status === 'covered' || statusKey === 'covered') {
      badgeVariant = 'covered';
      badgeLabel = 'Coberto';
    } else if (statusKey === 'paid' && payment) {
      badgeVariant = 'paid';
      badgeLabel = 'Pago';
    } else if (dbStatus === 'cancelled') {
      badgeVariant = 'cancelled';
      badgeLabel = 'Cancelado';
    } else if (statusKey === 'pending') {
      badgeVariant = 'pending';
      badgeLabel = 'Em atraso';
    } else if (statusKey === 'soon') {
      badgeVariant = 'soon';
      badgeLabel = 'A vencer';
    }

    const rowTone = isPaid ? 'paid' : statusKey === 'pending' ? 'pending' : statusKey === 'none' ? 'none' : 'default';
    const displayName = String(student.name || '').trim() || '—';
    const canRegister = !studentFrozen && !isPaid;
    const paidTooltip =
      isPaid && payment
        ? `Pago · ${METHOD_LABELS[payment.method] || payment.method} · ${fmtMoney(payment.amount)}${
            payment.paid_at
              ? ` · ${formatDdMm(parseYmdLocal(String(payment.paid_at).slice(0, 10)))}`
              : ''
          }`
        : undefined;
    let vencLabel = '—';
    if (statusKey === 'paid' && payment?.paid_at) {
      const paidAt = parseYmdLocal(String(payment.paid_at).slice(0, 10));
      vencLabel = paidAt ? `Pago em ${formatDdMm(paidAt)}` : 'Pago';
    } else if (calendar.dueDate && !Number.isNaN(calendar.dueDate.getTime())) {
      vencLabel = formatDdMm(calendar.dueDate);
    }

    return (
      <article key={student.id} className={`mensal-mobile-card mensal-mobile-card--${rowTone}`}>
        <div className="mensal-mobile-card__head">
          <div className="mensal-mobile-card__head-text">
            {renderStudentName(student, {
              canRegister,
              displayName,
              mobile: true,
            })}
            <div className="mensal-mobile-card__meta">
              {student.plan || '—'} · {vencLabel}
            </div>
            <div className="mensal-mobile-card__platform">
              {prefM ? (
                <>
                  {METHOD_LABELS[prefM] || prefM}
                  {prefA ? ` · ${prefA}` : ''}
                </>
              ) : (
                <span className="mensal-cell-faint">—</span>
              )}
            </div>
          </div>
          <StatusBadge variant={badgeVariant}>{badgeLabel}</StatusBadge>
        </div>
        {!studentFrozen ? (
          <div className="mensal-mobile-card__actions">
            {isPaid && payment ? (
              <button
                type="button"
                className="mensal-btn-estornar mensal-mobile-estornar"
                title={reverseBlocked ? reverseBlockedTitle : paidTooltip}
                onClick={() => requestEstornar(payment)}
                disabled={reversingPaymentId === payment.$id || reverseBlocked}
              >
                {reversingPaymentId === payment.$id ? (
                  <Loader2 size={14} className="navi-async-btn__spin" aria-hidden />
                ) : null}
                Estornar
              </button>
            ) : !isPaid ? (
              <button type="button" className="btn-primary mensal-mobile-pay" onClick={() => openPaymentModal(student)}>
                <Banknote size={16} /> Registrar
              </button>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  if (loading) {
    return <PageSkeleton variant="table" rows={8} columns={6} />;
  }

  if (displayedStudents.length === 0) {
    if (!hasStudentsWithPlan) {
      const isOwner = navRole === 'owner';
      return (
        <EmptyState
          variant="default"
          tone="dashed"
          icon={Users}
          title={`Nenhum ${terms.student.toLowerCase()} com plano ativo neste mês`}
          description={
            isOwner
              ? 'Configure os planos na empresa e associe um plano a cada aluno para acompanhar as mensalidades.'
              : 'Nenhum plano cadastrado. Peça ao responsável pela academia para configurar os planos.'
          }
          primaryAction={
            isOwner ? { label: 'Configurar planos', href: EMPRESA_FINANCE_CONFIG_PATH } : undefined
          }
          role="status"
        />
      );
    }
    if (hasActiveFilters) {
      return (
        <EmptyState
          variant="compact"
          tone="dashed"
          icon={Users}
          title="Nenhum resultado para os filtros aplicados"
          secondaryAction={{ label: 'Limpar filtros', onClick: onClearFilters, variant: 'link' }}
          role="status"
        />
      );
    }
    return (
      <EmptyState
        variant="compact"
        tone="dashed"
        icon={Users}
        title={`Nenhum ${terms.student.toLowerCase()} encontrado`}
        role="status"
      />
    );
  }

  let globalRowIndex = 0;

  return (
    <>
      <ConfirmDialog
        open={Boolean(confirmPayment)}
        title="Estornar pagamento"
        description="O pagamento será marcado como cancelado e o valor será estornado no Caixa. Esta ação não pode ser desfeita."
        confirmLabel="Estornar"
        confirmVariant="danger"
        loading={Boolean(reversingPaymentId)}
        onClose={() => {
          if (!reversingPaymentId) setConfirmPayment(null);
        }}
        onConfirm={() => void confirmEstornar()}
      />
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
                    {dueSortOrder === 'asc' ? (
                      <ArrowUp size={14} />
                    ) : dueSortOrder === 'desc' ? (
                      <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} />
                    )}
                  </span>
                </button>
              </th>
              <th className="mensal-th-num">Valor</th>
              <th>Conta / Plataforma</th>
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

      <div
        className={`mensal-mobile-list${shouldVirtualizeMobile ? ' mensal-mobile-list--virtual' : ''}`}
        ref={mobileListRef}
      >
        {shouldVirtualizeMobile ? (
          <div className="mensal-virtual-container" style={{ height: mobileVirtualizer.getTotalSize() }}>
            {mobileVirtualizer.getVirtualItems().map((vi) => {
              const student = displayedStudents[vi.index];
              return (
                <div
                  key={student.id}
                  className="mensal-virtual-item"
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  {renderMobileCard(student)}
                </div>
              );
            })}
          </div>
        ) : (
          studentsByGroup.map((group) => (
            <React.Fragment key={group.key}>
              {studentsByGroup.length > 1 ? (
                <div className="mensal-mobile-group-label" role="presentation">
                  {group.key}
                </div>
              ) : null}
              {group.students.map((student) => renderMobileCard(student))}
            </React.Fragment>
          ))
        )}
      </div>
    </>
  );
}


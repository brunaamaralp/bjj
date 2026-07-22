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
import { resolveMensalidadeDueDate, resolveMensalidadePaymentMethod, resolveMensalidadePaymentAccount } from '../../lib/collectionOverdue.js';
import { sortTurmaGroupKeys, studentTurmaGroupKey } from '../../lib/academyTurmas.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import { resolveStudentPayerDisplayName } from '../../lib/studentPayerAliases.js';

const MENSALIDADES_TABLE_COL_COUNT = 7;
const PAGADOR_COLUMN_HINT =
  'Quem costuma pagar: alias do extrato, responsável cadastral ou pai/mãe';

function resolveRowValorCell({ payment, isExempt, fmtMoney }) {
  const amountNum = payment && payment.status === 'paid' ? Number(payment.amount) : null;
  const hasValor = !isExempt && amountNum != null && Number.isFinite(amountNum) && amountNum > 0;
  const valorCell = isExempt ? 'Isento' : hasValor ? fmtMoney(amountNum) : '—';
  return { amountNum, hasValor, valorCell };
}

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
    exempt: 'finance-badge-recorrente',
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
  financeConfig = null,
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
  const desktopScrollRef = useRef(null);
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

  const resolveDueDateForDisplay = (student, payment) =>
    resolveMensalidadeDueDate(student, payment, currentMonth, new Date(), financeConfig);

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

  /** Linhas planas (grupo + aluno) para virtualização desktop. */
  const desktopFlatRows = useMemo(() => {
    const rows = [];
    const showGroupHeader = studentsByGroup.length > 1;
    let studentRowIndex = 0;
    for (const group of studentsByGroup) {
      const expanded = expandedGroups[group.key] !== false;
      if (showGroupHeader) {
        rows.push({
          type: 'group',
          key: `g:${group.key}`,
          groupKey: group.key,
          count: group.students.length,
          expanded,
        });
      }
      if (expanded) {
        for (const student of group.students) {
          rows.push({
            type: 'student',
            key: student.id,
            student,
            rowIndex: studentRowIndex,
          });
          studentRowIndex += 1;
        }
      }
    }
    return rows;
  }, [studentsByGroup, expandedGroups]);

  const shouldVirtualizeDesktop = desktopFlatRows.length > 40;
  const desktopVirtualizer = useVirtualizer({
    count: shouldVirtualizeDesktop ? desktopFlatRows.length : 0,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: (index) => (desktopFlatRows[index]?.type === 'group' ? 44 : 58),
    overscan: 8,
  });

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
    const dbStatus = String(payment?.status || '').toLowerCase();
    const isExempt = statusKey === 'exempt';
    const today0 = startOfLocalDay(new Date());
    let vencCell = '—';
    let vencIsEmpty = true;
    let vencClassName = '';
    const venc = isExempt ? null : resolveDueDateForDisplay(student, payment);
    if (venc && !Number.isNaN(venc.getTime())) {
      vencIsEmpty = false;
      if (statusKey === 'paid') {
        vencCell = formatDdMm(venc);
      } else {
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
    }

    const { hasValor, valorCell } = resolveRowValorCell({ payment, isExempt, fmtMoney });

    const prefM = resolveMensalidadePaymentMethod(student, payment);
    const prefA = resolveMensalidadePaymentAccount(student, payment);

    let badgeVariant = 'none';
    let badgeLabel = 'Não registrado';
    if (isExempt) {
      badgeVariant = 'exempt';
      badgeLabel = 'Isento';
    } else if (studentFrozen || dbStatus === 'frozen') {
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
    const rowTone = isPaid ? 'paid' : statusKey === 'pending' ? 'pending' : statusKey === 'none' || isExempt ? 'none' : 'default';

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
    const payerName = resolveStudentPayerDisplayName(student);
    const canRegister = !studentFrozen && !isPaid && !isExempt;

    return (
      <tr key={student.id} className={rowClass} title={isPaid ? paidTooltip : undefined}>
        <td>
          <div className="mensal-cell-name">
            {renderStudentName(student, { canRegister, displayName })}
            <span className="mensal-cell-name__plan">{student.plan || '—'}</span>
          </div>
        </td>
        <td className={payerName ? '' : 'mensal-cell-empty'}>
          {payerName ? (
            <span className="mensal-cell-pagador">{payerName}</span>
          ) : (
            <span className="mensal-cell-faint">—</span>
          )}
        </td>
        <td className={`${vencIsEmpty ? 'mensal-cell-empty' : ''} ${vencClassName}`.trim()}>
          {vencCell}
        </td>
        <td className={`mensal-cell-valor${hasValor ? ' mensal-cell-valor--filled' : ' mensal-cell-empty'}`}>
          {valorCell}
        </td>
        <td className="mensal-col-pref">
          {prefM || prefA ? (
            <div className="mensal-cell-pref">
              {prefM ? <span>{METHOD_LABELS[prefM] || prefM}</span> : null}
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
          {studentFrozen || isExempt ? (
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
                aria-label={`Estornar pagamento de ${displayName}`}
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
                aria-label={`Registrar pagamento de ${displayName}`}
              >
                <Banknote size={14} strokeWidth={2} aria-hidden /> Registrar
              </button>
            </div>
          ) : (
            <div className="mensal-action-pay-wrap">
              <button
                type="button"
                className="mensal-btn-pay mensal-btn-pay--compact"
                onClick={() => openPaymentModal(student)}
                aria-label={`Registrar pagamento de ${displayName}`}
              >
                <Banknote size={14} strokeWidth={2} aria-hidden /> Registrar
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
    const isPaid = statusKey === 'paid' && payment?.status === 'paid';
    const isExempt = statusKey === 'exempt';
    const prefM = resolveMensalidadePaymentMethod(student, payment);
    const prefA = resolveMensalidadePaymentAccount(student, payment);

    let badgeVariant = 'none';
    let badgeLabel = 'Não registrado';
    if (isExempt) {
      badgeVariant = 'exempt';
      badgeLabel = 'Isento';
    } else if (studentFrozen || dbStatus === 'frozen') {
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

    const rowTone = isPaid ? 'paid' : statusKey === 'pending' ? 'pending' : statusKey === 'none' || isExempt ? 'none' : 'default';
    const displayName = String(student.name || '').trim() || '—';
    const payerName = resolveStudentPayerDisplayName(student);
    const { hasValor, valorCell } = resolveRowValorCell({ payment, isExempt, fmtMoney });
    const canRegister = !studentFrozen && !isPaid && !isExempt;
    const paidTooltip =
      isPaid && payment
        ? `Pago · ${METHOD_LABELS[payment.method] || payment.method} · ${fmtMoney(payment.amount)}${
            payment.paid_at
              ? ` · ${formatDdMm(parseYmdLocal(String(payment.paid_at).slice(0, 10)))}`
              : ''
          }`
        : undefined;
    let vencLabel = '—';
    const dueDate = isExempt ? null : resolveDueDateForDisplay(student, payment);
    if (dueDate && !Number.isNaN(dueDate.getTime())) {
      vencLabel = formatDdMm(dueDate);
    }

    return (
      <article
        key={student.id}
        className={`mensal-mobile-card mensal-mobile-card--${rowTone}`}
        aria-label={`${displayName}, ${badgeLabel}`}
      >
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
            {payerName ? (
              <div className="mensal-mobile-card__pagador" title={PAGADOR_COLUMN_HINT}>
                {payerName}
              </div>
            ) : null}
            <div
              className={`mensal-mobile-card__valor${hasValor ? ' mensal-mobile-card__valor--filled' : ''}`}
            >
              {valorCell}
            </div>
            <div className="mensal-mobile-card__platform">
              {prefM || prefA ? (
                <>
                  {prefM ? METHOD_LABELS[prefM] || prefM : null}
                  {prefA ? `${prefM ? ' · ' : ''}${prefA}` : null}
                </>
              ) : (
                <span className="mensal-cell-faint">—</span>
              )}
            </div>
          </div>
          <StatusBadge variant={badgeVariant}>{badgeLabel}</StatusBadge>
        </div>
        {!studentFrozen && !isExempt ? (
          <div className="mensal-mobile-card__actions">
            {isPaid && payment ? (
              <button
                type="button"
                className="mensal-btn-estornar mensal-mobile-estornar"
                title={reverseBlocked ? reverseBlockedTitle : paidTooltip}
                onClick={() => requestEstornar(payment)}
                disabled={reversingPaymentId === payment.$id || reverseBlocked}
                aria-label={`Estornar pagamento de ${displayName}`}
              >
                {reversingPaymentId === payment.$id ? (
                  <Loader2 size={14} className="navi-async-btn__spin" aria-hidden />
                ) : null}
                Estornar
              </button>
            ) : !isPaid ? (
              <button
                type="button"
                className="btn-primary mensal-mobile-pay"
                onClick={() => openPaymentModal(student)}
                aria-label={`Registrar pagamento de ${displayName}`}
              >
                <Banknote size={16} aria-hidden /> Registrar
              </button>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  if (loading) {
    return <PageSkeleton variant="table" rows={8} columns={MENSALIDADES_TABLE_COL_COUNT} />;
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

  const renderGroupHeaderRow = (groupKey, count, expanded) => (
    <tr className="mensal-group-row">
      <td colSpan={MENSALIDADES_TABLE_COL_COUNT}>
        <button
          type="button"
          className="mensal-group-toggle"
          onClick={() =>
            setExpandedGroups((prev) => ({ ...prev, [groupKey]: !expanded }))
          }
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>{groupKey}</span>
          <span className="mensal-group-toggle__count">{count}</span>
        </button>
      </td>
    </tr>
  );

  const desktopTableHead = (
    <thead>
      <tr>
        <th>{terms.student}</th>
        <th title={PAGADOR_COLUMN_HINT}>Pagador</th>
        <th
          aria-sort={
            dueSortOrder === 'asc' ? 'ascending' : dueSortOrder === 'desc' ? 'descending' : 'none'
          }
        >
          <button
            type="button"
            className={`mensal-th-sort${dueSortOrder != null ? ' mensal-th-sort--active' : ''}`}
            onClick={() =>
              setDueSortOrder((prev) => (prev === null ? 'asc' : prev === 'asc' ? 'desc' : null))
            }
            aria-label={
              dueSortOrder === 'asc'
                ? 'Ordenar por vencimento, crescente. Clique para decrescente'
                : dueSortOrder === 'desc'
                  ? 'Ordenar por vencimento, decrescente. Clique para remover ordenação'
                  : 'Ordenar por vencimento'
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
        <th className="mensal-col-pref">Conta / Plataforma</th>
        <th>Status</th>
        <th className="mensal-th-action">Ação</th>
      </tr>
    </thead>
  );

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
      <div
        className={`mensal-table-wrap mensal-table-wrap--desktop${
          shouldVirtualizeDesktop ? ' mensal-table-wrap--desktop-virtual' : ''
        }`}
        ref={desktopScrollRef}
      >
        {shouldVirtualizeDesktop ? (
          <>
            <table className="mensal-table mensal-table--virt-head">{desktopTableHead}</table>
            <div
              className="mensal-desktop-virtual-body"
              style={{ height: desktopVirtualizer.getTotalSize() }}
            >
              {desktopVirtualizer.getVirtualItems().map((vi) => {
                const row = desktopFlatRows[vi.index];
                if (!row) return null;
                return (
                  <div
                    key={row.key}
                    className="mensal-desktop-virtual-row"
                    style={{
                      transform: `translateY(${vi.start}px)`,
                      height: vi.size,
                    }}
                  >
                    <table className="mensal-table mensal-table--virt-slice">
                      <tbody className="mensal-tbody">
                        {row.type === 'group'
                          ? renderGroupHeaderRow(row.groupKey, row.count, row.expanded)
                          : renderStudentRow(row.student, row.rowIndex)}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <table className="mensal-table">
            {desktopTableHead}
            <tbody className="mensal-tbody">
              {studentsByGroup.map((group) => {
                const expanded = expandedGroups[group.key] !== false;
                const showGroupHeader = studentsByGroup.length > 1;
                return (
                  <React.Fragment key={group.key}>
                    {showGroupHeader
                      ? renderGroupHeaderRow(group.key, group.students.length, expanded)
                      : null}
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
        )}
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


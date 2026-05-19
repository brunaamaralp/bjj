import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarRange,
  ShoppingBag,
  Receipt,
  ChevronDown,
  ChevronUp,
  Lock,
  Pause,
} from 'lucide-react';
import PlanFreezePanel from './PlanFreezePanel.jsx';
import {
  canStartPlanFreeze,
  isFreezeActive,
  effectiveFreezeDaysUsed,
  FREEZE_MAX_DAYS_PER_YEAR,
} from '../../lib/planFreeze.js';
import CompactStatusFilter from '../shared/CompactStatusFilter.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import {
  buildFinancialTimelineItems,
  filterTimelineItems,
  buildFinancialSummary,
  filterTypeCounts,
} from '../../lib/studentFinancialTimeline.js';
import {
  formatReferenceMonthLong,
  compareReferenceMonths,
} from '../../lib/bundleCoverage.js';
import { PAYMENT_CATEGORY } from '../../lib/studentPayments.js';
import { centsToNumber, formatBRLFromCents, parseMaskToCents } from '../../lib/moneyBr';

function fmtMoney(n) {
  try {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(n || 0).toFixed(2)}`;
  }
}

function formatDd(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

const BADGE_STYLES = {
  success: { bg: '#EAF3DE', color: '#3B6D11' },
  covered: { bg: 'var(--v50, #f3f0ff)', color: 'var(--v700, #5B3FBF)', border: '1px solid var(--v200, #ddd6fe)' },
  danger: { bg: '#FCEBEB', color: '#A32D2D' },
  warning: { bg: '#FFEDD5', color: '#C2410C' },
  muted: { bg: '#f1f5f9', color: '#64748b' },
  frozen: { bg: '#e8eef5', color: '#475569', border: '1px solid #cbd5e1' },
};

function TimelineBadge({ badge }) {
  const tone = badge?.tone || 'muted';
  const style = BADGE_STYLES[tone] || BADGE_STYLES.muted;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 6,
        background: style.bg,
        color: style.color,
        border: style.border || 'none',
        flexShrink: 0,
      }}
    >
      {badge?.label || '—'}
    </span>
  );
}

function TimelineRow({ icon: Icon, iconColor, item, expanded, onToggle, children }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-light)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          padding: '12px 14px',
          border: 'none',
          background: 'transparent',
          cursor: onToggle ? 'pointer' : 'default',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <Icon size={20} color={iconColor} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{item.title}</div>
            <TimelineBadge badge={item.badge} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{formatDd(item.sortDate)}</div>
          {item.subtitle ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.subtitle}</div>
          ) : null}
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>
            {fmtMoney(item.amount)}
          </div>
        </div>
        {onToggle ? (
          <div style={{ color: 'var(--text-muted)', paddingTop: 4 }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        ) : null}
      </button>
      {expanded && children ? (
        <div
          style={{
            padding: '0 14px 12px 46px',
            borderTop: '0.5px solid var(--border-light)',
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function BundleTimelineRow({ item, onCancelCoverage, cancelling }) {
  const [expanded, setExpanded] = useState(false);
  const [cancelFrom, setCancelFrom] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const nowYm = new Date().toISOString().slice(0, 7);
  const futureCovered = (item.children || []).filter(
    (c) =>
      String(c.status || '').toLowerCase() === 'covered' &&
      compareReferenceMonths(c.reference_month, nowYm) >= 0
  );

  return (
    <TimelineRow
      icon={CalendarRange}
      iconColor="#5B3FBF"
      item={item}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {[item.anchor, ...(item.children || [])]
          .filter((p) => p.reference_month)
          .sort((a, b) => compareReferenceMonths(a.reference_month, b.reference_month))
          .map((p) => (
            <div
              key={p.$id}
              style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}
            >
              <span>{formatReferenceMonthLong(p.reference_month)}</span>
              <span style={{ fontWeight: 600, color: 'var(--v700, #5B3FBF)' }}>✓ Coberto</span>
            </div>
          ))}
      </div>
      {futureCovered.length > 0 && onCancelCoverage ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <select
            className="form-input"
            value={cancelFrom}
            onChange={(e) => setCancelFrom(e.target.value)}
            style={{ fontSize: 12, minWidth: 140 }}
          >
            <option value="">Cancelar a partir de…</option>
            {futureCovered.map((c) => (
              <option key={c.$id} value={c.reference_month}>
                {formatReferenceMonthLong(c.reference_month)}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="numeric"
            className="form-input"
            placeholder="R$ 0,00"
            value={refundAmount}
            onChange={(e) => setRefundAmount(formatBRLFromCents(parseMaskToCents(e.target.value)))}
            style={{ fontSize: 12, width: 130 }}
          />
          <button
            type="button"
            className="btn-outline btn-sm"
            disabled={!cancelFrom || cancelling}
            onClick={() =>
              onCancelCoverage({
                anchor_id: item.anchor.$id,
                from_reference_month: cancelFrom,
                refundAmount: centsToNumber(parseMaskToCents(refundAmount)) || 0,
              })
            }
          >
            {cancelling ? '…' : 'Cancelar cobertura'}
          </button>
        </div>
      ) : null}
    </TimelineRow>
  );
}

function ProductTimelineRow({ item }) {
  const [expanded, setExpanded] = useState(false);
  const sale = item.sale;
  return (
    <TimelineRow
      icon={ShoppingBag}
      iconColor="#3B6D11"
      item={item}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    >
      {(sale?.items || []).map((it) => (
        <div
          key={`${it.item_estoque_id}-${it.quantidade}`}
          style={{
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
            padding: '4px 0',
            color: 'var(--text-secondary)',
          }}
        >
          <span>
            {it.display_label} × {it.quantidade}
          </span>
          <span>{fmtMoney(it.subtotal)}</span>
        </div>
      ))}
    </TimelineRow>
  );
}

function FinancialSummaryCard({ summary }) {
  const situationColor =
    summary.situationTone === 'success'
      ? 'var(--success)'
      : summary.situationTone === 'danger'
        ? 'var(--danger)'
        : 'var(--text-secondary)';

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid var(--border-light)',
        background: 'var(--surface)',
        marginBottom: 12,
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
        <span>
          <strong>Plano ativo:</strong> {summary.planLabel}
        </span>
        <span>
          <strong>{summary.isBundle ? 'Cobertura' : 'Vence'}:</strong> {summary.dueLabel}
        </span>
      </div>
      <div style={{ marginTop: 6, color: situationColor }}>
        <strong>Situação:</strong> {summary.situationLabel}
      </div>
      <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
        <strong>Histórico:</strong> {summary.historyLabel}
      </div>
    </div>
  );
}

const TYPE_FILTER_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'plan', label: 'Mensalidades' },
  { id: 'bundle', label: 'Planos' },
  { id: 'product', label: 'Produtos' },
  { id: 'fee', label: 'Taxas' },
];

const PERIOD_OPTIONS = [
  { id: '3m', label: 'Últimos 3 meses' },
  { id: '6m', label: 'Últimos 6 meses' },
  { id: '12m', label: 'Últimos 12 meses' },
  { id: 'all', label: 'Todo o histórico' },
];

export default function StudentFinancialTimeline({
  student,
  financeConfig,
  payments,
  sales,
  paymentStatus,
  loading,
  error,
  onRetry,
  onRegisterPayment,
  onGoMensalidades,
  onGoSales,
  onCancelCoverage,
  cancellingCoverage,
  hasSales,
  planFreezes = [],
  onOpenFreeze,
  freezeBusy = false,
  onEndFreeze,
  endFreezeBusy = false,
}) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('12m');

  const allItems = useMemo(
    () => buildFinancialTimelineItems(payments, sales, planFreezes),
    [payments, sales, planFreezes]
  );
  const freezeActive = isFreezeActive(student);
  const showFreezeBtn = canStartPlanFreeze(student, financeConfig);
  const freezeHistoryCount = (planFreezes || []).length;

  const typeCounts = useMemo(() => filterTypeCounts(allItems), [allItems]);

  const filteredItems = useMemo(
    () => filterTimelineItems(allItems, { typeFilter, periodKey: periodFilter }),
    [allItems, typeFilter, periodFilter]
  );

  const summary = useMemo(
    () =>
      buildFinancialSummary({
        student,
        financeConfig,
        payments,
        sales,
        paymentStatus,
      }),
    [student, financeConfig, payments, sales, paymentStatus]
  );

  const typeOptions = TYPE_FILTER_OPTIONS.map((o) => ({
    ...o,
    count: typeCounts[o.id] ?? 0,
  }));

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        Carregando histórico financeiro…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 24, fontSize: 14 }}>
        Erro ao carregar ·{' '}
        <button type="button" onClick={onRetry} style={{ color: 'var(--accent)', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer' }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const showEmpty = filteredItems.length === 0 && !loading;

  return (
    <div>
      <FinancialSummaryCard summary={summary} />

      {freezeActive ? (
        <PlanFreezePanel
          student={student}
          freezeHistoryCount={freezeHistoryCount}
          onEndEarly={onEndFreeze}
          busy={endFreezeBusy}
        />
      ) : null}

      {!freezeActive && showFreezeBtn ? (
        <button
          type="button"
          className="btn-outline"
          style={{ width: '100%', marginBottom: 12 }}
          onClick={onOpenFreeze}
          disabled={freezeBusy}
        >
          Trancar plano
        </button>
      ) : null}

      {!freezeActive && !showFreezeBtn && String(student?.plan || '').trim() ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Trancamento: {effectiveFreezeDaysUsed(student)} de {FREEZE_MAX_DAYS_PER_YEAR} dias utilizados no ano do plano.
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <CompactStatusFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
          placeholder="Tudo"
          allLabel="Tudo"
          showCounts
        />
        <CompactStatusFilter
          value={periodFilter}
          onChange={setPeriodFilter}
          options={PERIOD_OPTIONS}
          placeholder="Período"
          allLabel="Últimos 12 meses"
          showCounts={false}
        />
      </div>

      {showEmpty ? (
        <EmptyState variant="compact" tone="dashed" title="Nenhum lançamento neste filtro" role="status" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredItems.map((item) => {
            if (item.kind === 'bundle') {
              return (
                <BundleTimelineRow
                  key={item.id}
                  item={item}
                  onCancelCoverage={onCancelCoverage}
                  cancelling={cancellingCoverage}
                />
              );
            }
            if (item.kind === 'product') {
              return <ProductTimelineRow key={item.id} item={item} />;
            }
            if (item.kind === 'freeze') {
              return <TimelineRow key={item.id} icon={Lock} iconColor="#64748b" item={item} />;
            }
            const Icon =
              item.kind === 'fee' ? Receipt : Calendar;
            const iconColor = item.kind === 'fee' ? '#B45309' : '#5B3FBF';
            return <TimelineRow key={item.id} icon={Icon} iconColor={iconColor} item={item} />;
          })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid var(--border-light)',
        }}
      >
        {!freezeActive ? (
          <button
            type="button"
            onClick={() => onRegisterPayment(PAYMENT_CATEGORY.PLAN)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: 'none',
              background: '#5B3FBF',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            + Registrar pagamento
          </button>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-outline btn-sm" style={{ flex: 1 }} onClick={onGoMensalidades}>
            Ver na Mensalidades
          </button>
          {hasSales ? (
            <button type="button" className="btn-outline btn-sm" style={{ flex: 1 }} onClick={onGoSales}>
              Ver venda na Loja
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

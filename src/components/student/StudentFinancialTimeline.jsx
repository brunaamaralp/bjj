import React, { useMemo, useState, useCallback } from 'react';
import {
  Calendar,
  CalendarRange,
  ShoppingBag,
  Receipt,
  ChevronDown,
  ChevronUp,
  Lock,
  Download,
} from 'lucide-react';
import { downloadCsv } from '../../lib/reportsExport.js';
import PlanFreezePanel from './PlanFreezePanel.jsx';
import {
  canStartPlanFreeze,
  isFreezeActive,
  activeFreezeReasonFromHistory,
} from '../../lib/planFreeze.js';
import CompactStatusFilter from '../shared/CompactStatusFilter.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import {
  buildFinancialTimelineItems,
  filterTimelineItems,
  buildFinancialSummary,
  filterTypeCounts,
  DEFAULT_TIMELINE_TYPE_FILTER,
  DEFAULT_TIMELINE_PERIOD_FILTER,
} from '../../lib/studentFinancialTimeline.js';
import {
  formatReferenceMonthLong,
  compareReferenceMonths,
} from '../../lib/bundleCoverage.js';
import { PAYMENT_CATEGORY } from '../../lib/studentPayments.js';
import { centsToNumber, formatBRLFromCents, parseMaskToCents } from '../../lib/moneyBr';
import {
  downloadSaleReceiptPdf,
  downloadPaymentReceiptPdf,
  canDownloadSaleReceipt,
  canDownloadPaymentReceipt,
} from '../../lib/receiptDownload.js';
import ReceiptPdfButton from '../shared/ReceiptPdfButton.jsx';
import { paymentStatusLabelPt } from '../../lib/paymentStatus.js';
import { paymentCaixaMeta, saleCaixaMeta, CaixaLinkBadge } from '../../lib/studentPaymentCaixaLink.jsx';
import '../../styles/sales.css';
import '../../styles/student-profile.css';
import SaleDetailModal from '../sales/SaleDetailModal.jsx';
import SalesEditItemModal from '../sales/SalesEditItemModal.jsx';
import SalesCancelModal from '../sales/SalesCancelModal.jsx';
import { formatSaleIdShort } from '../../lib/salesHistory.js';
import { useSalesStore } from '../../store/useSalesStore.js';
import { useUiStore } from '../../store/useUiStore.js';
import { friendlyError } from '../../lib/errorMessages.js';

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
  covered: { bg: 'var(--v50, var(--azul-gelo))', color: 'var(--v700, var(--petroleo))', border: '1px solid var(--v200)' },
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

function TimelineRow({
  icon,
  iconColor,
  item,
  expanded,
  onToggle,
  children,
  payment,
  canManagePayments,
  onEditPayment,
  onDeletePayment,
  receiptPdf,
  caixaMeta,
}) {
  const showActions = Boolean(expanded && payment && canManagePayments && onEditPayment && onDeletePayment);
  const showReceiptPdf = Boolean(expanded && receiptPdf?.enabled && receiptPdf?.onDownload);
  const title = item.ledgerTitle || item.title;
  const MainTag = onToggle ? 'button' : 'div';

  return (
    <div className={`student-pay-ledger-row${expanded ? ' is-expanded' : ''}`}>
      <MainTag
        type={onToggle ? 'button' : undefined}
        className="student-pay-ledger-row__main"
        onClick={onToggle || undefined}
        aria-expanded={onToggle ? Boolean(expanded) : undefined}
      >
        {React.createElement(icon, {
          size: 16,
          color: iconColor,
          className: 'student-pay-ledger-row__icon',
          'aria-hidden': true,
        })}
        <span className="student-pay-ledger-row__title">{title}</span>
        <TimelineBadge badge={item.badge} />
        <span className="student-pay-ledger-row__amount">{fmtMoney(item.amount)}</span>
        {onToggle ? (
          <span className="student-pay-ledger-row__chevron" aria-hidden>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        ) : (
          <span className="student-pay-ledger-row__chevron" aria-hidden />
        )}
      </MainTag>
      {expanded ? (
        <div className="student-pay-ledger-row__detail">
          <div className="student-pay-ledger-row__meta">
            <span>{formatDd(item.sortDate)}</span>
            {item.subtitle ? <span>{item.subtitle}</span> : null}
          </div>
          <CaixaLinkBadge meta={caixaMeta} />
          {showReceiptPdf ? <ReceiptPdfButton onDownload={receiptPdf.onDownload} variant="outline" /> : null}
          {showActions ? (
            <div className="student-pay-ledger-row__actions">
              <button type="button" className="btn-outline btn-sm" onClick={() => onEditPayment(payment)}>
                Editar
              </button>
              <button
                type="button"
                className="btn-outline btn-sm"
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => onDeletePayment(payment)}
              >
                Excluir
              </button>
            </div>
          ) : null}
          {children || null}
        </div>
      ) : null}
    </div>
  );
}

function BundleTimelineRow({ item, onCancelCoverage, cancelling, canManagePayments, onEditPayment, onDeletePayment }) {
  const [expanded, setExpanded] = useState(false);
  const [cancelFrom, setCancelFrom] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const nowYm = new Date().toISOString().slice(0, 7);
  const futureCovered = (item.children || []).filter(
    (c) =>
      String(c.status || '').toLowerCase() === 'covered' &&
      compareReferenceMonths(c.reference_month, nowYm) >= 0
  );
  const receiptPdf =
    item.payment && canDownloadPaymentReceipt(item.payment)
      ? {
          enabled: true,
          onDownload: () => downloadPaymentReceiptPdf(item.payment.$id),
        }
      : null;

  return (
    <TimelineRow
      icon={CalendarRange}
      iconColor="var(--petroleo)"
      item={item}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      payment={item.payment}
      canManagePayments={canManagePayments}
      onEditPayment={onEditPayment}
      onDeletePayment={onDeletePayment}
      receiptPdf={receiptPdf}
      caixaMeta={paymentCaixaMeta(item.anchor)}
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
              <span style={{ fontWeight: 600, color: 'var(--v700, var(--petroleo))' }}>✓ Coberto</span>
            </div>
          ))}
      </div>
      {canDownloadPaymentReceipt(item.anchor) ? (
        <div style={{ marginBottom: 10 }}>
          <ReceiptPdfButton
            onDownload={() => downloadPaymentReceiptPdf(item.anchor.$id)}
            variant="outline"
          />
        </div>
      ) : null}
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

function ProductTimelineRow({ item, onOpenDetail }) {
  const [expanded, setExpanded] = useState(false);
  const sale = item.sale;
  const canOpenDetail = Boolean(sale?.id && onOpenDetail);
  return (
    <TimelineRow
      icon={ShoppingBag}
      iconColor="#3B6D11"
      item={item}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      caixaMeta={saleCaixaMeta(sale)}
    >
      {(sale?.items || []).map((it) => (
        <div
          key={`${it.id || it.item_estoque_id}-${it.quantidade}`}
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {canOpenDetail ? (
          <button type="button" className="btn-outline btn-sm" onClick={() => onOpenDetail(sale)}>
            Ver detalhes
          </button>
        ) : null}
        {sale && canDownloadSaleReceipt(sale) ? (
          <ReceiptPdfButton
            onDownload={() => downloadSaleReceiptPdf(sale.id)}
            variant="outline"
          />
        ) : null}
      </div>
    </TimelineRow>
  );
}

function PaymentTimelineRow({ item, canManagePayments, onEditPayment, onDeletePayment }) {
  const [expanded, setExpanded] = useState(false);
  const payment = item.payment;
  const Icon = item.kind === 'fee' ? Receipt : Calendar;
  const iconColor = item.kind === 'fee' ? '#B45309' : 'var(--petroleo)';
  const receiptPdf =
    payment && canDownloadPaymentReceipt(payment)
      ? {
          enabled: true,
          onDownload: () => downloadPaymentReceiptPdf(payment.$id),
        }
      : null;
  return (
    <TimelineRow
      icon={Icon}
      iconColor={iconColor}
      item={item}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      payment={payment}
      canManagePayments={canManagePayments}
      onEditPayment={onEditPayment}
      onDeletePayment={onDeletePayment}
      receiptPdf={receiptPdf}
      caixaMeta={payment ? paymentCaixaMeta(payment) : null}
    />
  );
}

function ExtratoTotalsCard({ totals }) {
  if (!totals) return null;
  return (
    <div className="student-pay-extrato-totals">
      <div className="student-pay-extrato-totals__title">Totais do período</div>
      <div className="student-pay-extrato-totals__grid">
        <span>
          <strong>Produtos:</strong> {fmtMoney(totals.total_gasto_produtos)}
        </span>
        <span>
          <strong>Mensalidades:</strong> {fmtMoney(totals.total_pago_mensalidades)}
        </span>
        <span>
          <strong>Em aberto:</strong> {fmtMoney(totals.total_em_aberto)}
        </span>
      </div>
    </div>
  );
}

function SituationHero({
  summary,
  freezeActive,
  onRegisterPayment,
  onOpenHistoricalCoverage,
  showFreezeBtn,
  onOpenFreeze,
  freezeBusy,
}) {
  const tone =
    summary.situationTone === 'success'
      ? 'ok'
      : summary.situationTone === 'danger'
        ? 'late'
        : summary.situationTone === 'warning'
          ? 'soon'
          : 'muted';

  return (
    <div className={`student-pay-situation student-pay-situation--${tone}`}>
      <div className="student-pay-situation__status">{summary.situationLabel}</div>
      <div className="student-pay-situation__meta">
        <span>{summary.planLabel}</span>
        {summary.dueLabel ? <span>{summary.dueLabel}</span> : null}
      </div>
      {summary.discountLabel ? (
        <div className="student-pay-situation__discount">
          {summary.discountLabel}
          {summary.finalLabel ? ` · ${summary.finalLabel}` : ''}
        </div>
      ) : null}
      {!freezeActive && onRegisterPayment ? (
        <button
          type="button"
          className="student-pay-situation__cta"
          onClick={() => onRegisterPayment(PAYMENT_CATEGORY.PLAN)}
        >
          + Registrar pagamento
        </button>
      ) : null}
      {!freezeActive && onOpenHistoricalCoverage ? (
        <button
          type="button"
          className="student-pay-situation__freeze"
          onClick={onOpenHistoricalCoverage}
        >
          Cobertura histórica
        </button>
      ) : null}
      {!freezeActive && showFreezeBtn ? (
        <button
          type="button"
          className="student-pay-situation__freeze"
          onClick={onOpenFreeze}
          disabled={freezeBusy}
        >
          Trancar matrícula
        </button>
      ) : null}
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
  onOpenHistoricalCoverage,
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
  canManagePayments = false,
  onEditPayment,
  onDeletePayment,
  extratoUnificado = null,
  canEditSale = false,
  onSalesRefresh,
}) {
  const [typeFilter, setTypeFilter] = useState(DEFAULT_TIMELINE_TYPE_FILTER);
  const [periodFilter, setPeriodFilter] = useState(DEFAULT_TIMELINE_PERIOD_FILTER);

  const fetchSaleDetail = useSalesStore((s) => s.fetchSaleDetail);
  const cancelSale = useSalesStore((s) => s.cancelSale);
  const cancellingSale = useSalesStore((s) => s.cancelling);
  const addToast = useUiStore((s) => s.addToast);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSale, setDetailSale] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editSaleItem, setEditSaleItem] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const enrichSaleForModal = useCallback(
    (sale) => {
      if (!sale) return sale;
      return {
        ...sale,
        id_short: sale.id_short || formatSaleIdShort(sale.id),
        client_name: sale.client_name || student?.name || sale.cliente_nome || '—',
      };
    },
    [student]
  );

  const openSaleDetail = async (sale) => {
    if (!sale?.id) return;
    setDetailOpen(true);
    setDetailSale(enrichSaleForModal(sale));
    setDetailLoading(true);
    try {
      const full = await fetchSaleDetail(sale.id);
      if (full) {
        setDetailSale(enrichSaleForModal(full));
      }
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCancelConfirm = async (motivo) => {
    if (!detailSale?.id) return;
    const result = await cancelSale({ venda_id: detailSale.id, motivo });
    if (!result?.ok) {
      addToast({
        type: 'error',
        message: 'Não foi possível cancelar a venda. Tente novamente.',
      });
      return;
    }
    addToast({
      type: 'success',
      message:
        result.stock_restored
          ? 'Estoque restaurado.'
          : String(detailSale?.status || '').toLowerCase() === 'cancelada'
            ? 'Cancelamento conferido.'
            : 'Venda cancelada.',
    });
    setCancelOpen(false);
    setDetailOpen(false);
    setDetailSale(null);
    onSalesRefresh?.();
  };

  const allItems = useMemo(
    () => buildFinancialTimelineItems(payments, sales, planFreezes),
    [payments, sales, planFreezes]
  );
  const freezeActive = isFreezeActive(student);
  const showFreezeBtn = canStartPlanFreeze(student, financeConfig);
  const freezeHistoryCount = (planFreezes || []).length;
  const activeFreezeReason = activeFreezeReasonFromHistory(planFreezes, student);

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

  const exportExtratoCsv = () => {
    const rows = (extratoUnificado?.timeline || []).map((r) => ({
      data: formatDd(r.date),
      tipo: r.type === 'product_sale' ? 'Venda produto' : 'Mensalidade',
      descricao: r.description,
      valor: r.amount,
      metodo: r.method,
      status: paymentStatusLabelPt(r.status),
      operador: r.operador_nome || '',
      referencia: r.reference_id || '',
    }));
    downloadCsv(rows, `extrato-${student?.id || 'aluno'}.csv`);
  };

  return (
    <div className="student-pay-panel">
      <SituationHero
        summary={summary}
        freezeActive={freezeActive}
        onRegisterPayment={onRegisterPayment}
        onOpenHistoricalCoverage={onOpenHistoricalCoverage}
        showFreezeBtn={showFreezeBtn}
        onOpenFreeze={onOpenFreeze}
        freezeBusy={freezeBusy}
      />

      {freezeActive ? (
        <PlanFreezePanel
          student={student}
          freezeReason={activeFreezeReason}
          freezeHistoryCount={freezeHistoryCount}
          onEndEarly={onEndFreeze}
          busy={endFreezeBusy}
        />
      ) : null}

      {extratoUnificado?.totals ? (
        <div className="student-pay-extrato-block">
          <ExtratoTotalsCard totals={extratoUnificado.totals} />
          <button
            type="button"
            className="btn-outline btn-sm student-pay-extrato-export"
            onClick={exportExtratoCsv}
            disabled={!extratoUnificado.timeline?.length}
          >
            <Download size={14} aria-hidden style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Exportar CSV
          </button>
        </div>
      ) : null}

      <div className="student-pay-filters">
        <CompactStatusFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
          placeholder="Mensalidades"
          allLabel="Tudo"
          showCounts
        />
        <CompactStatusFilter
          value={periodFilter}
          onChange={setPeriodFilter}
          options={PERIOD_OPTIONS}
          placeholder="Período"
          allLabel="Últimos 3 meses"
          showCounts={false}
        />
      </div>

      {showEmpty ? (
        <EmptyState variant="compact" tone="dashed" title="Nenhum lançamento neste filtro" role="status" />
      ) : (
        <div className="student-pay-ledger" role="list">
          {filteredItems.map((item) => {
            if (item.kind === 'bundle') {
              return (
                <BundleTimelineRow
                  key={item.id}
                  item={item}
                  onCancelCoverage={onCancelCoverage}
                  cancelling={cancellingCoverage}
                  canManagePayments={canManagePayments}
                  onEditPayment={onEditPayment}
                  onDeletePayment={onDeletePayment}
                />
              );
            }
            if (item.kind === 'product') {
              return (
                <ProductTimelineRow key={item.id} item={item} onOpenDetail={openSaleDetail} />
              );
            }
            if (item.kind === 'freeze') {
              return <TimelineRow key={item.id} icon={Lock} iconColor="#64748b" item={item} />;
            }
            return (
              <PaymentTimelineRow
                key={item.id}
                item={item}
                canManagePayments={canManagePayments}
                onEditPayment={onEditPayment}
                onDeletePayment={onDeletePayment}
              />
            );
          })}
        </div>
      )}

      <div className="student-pay-footer">
        <button type="button" className="btn-outline btn-sm" style={{ flex: 1 }} onClick={onGoMensalidades}>
          Ver na Mensalidades
        </button>
        {hasSales ? (
          <button type="button" className="btn-outline btn-sm" style={{ flex: 1 }} onClick={onGoSales}>
            Ver venda em Vendas
          </button>
        ) : null}
      </div>

      <SaleDetailModal
        open={detailOpen && !cancelOpen && !editItemOpen}
        sale={detailSale}
        loading={detailLoading}
        onClose={() => setDetailOpen(false)}
        onCancelClick={() => setCancelOpen(true)}
        canCancelSale={canEditSale}
        canEditSale={canEditSale}
        onEditItemClick={(saleItemRow) => {
          setEditSaleItem(saleItemRow);
          setEditItemOpen(true);
        }}
        onLiquidated={() => onSalesRefresh?.()}
      />

      <SalesCancelModal
        open={cancelOpen}
        sale={detailSale}
        loading={cancellingSale}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancelConfirm}
      />

      <SalesEditItemModal
        open={editItemOpen}
        sale={detailSale}
        saleItem={editSaleItem}
        onClose={() => {
          setEditItemOpen(false);
          setEditSaleItem(null);
        }}
        onSuccess={async () => {
          if (detailSale?.id) {
            try {
              const full = await fetchSaleDetail(detailSale.id);
              if (full) {
                setDetailSale(enrichSaleForModal(full));
              }
            } catch (e) {
              addToast({ type: 'error', message: friendlyError(e, 'load') });
            }
          }
          onSalesRefresh?.();
        }}
      />
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShoppingBag, ChevronRight } from 'lucide-react';
import useMatchMobile from '../../hooks/useMatchMobile.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import { DateInputField } from '../DateInput';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { useSalesStore } from '../../store/useSalesStore';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useCanManageAcademySales } from '../../lib/canManageStudentPayments.js';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { readSalesSettings, SALES_CHANNEL_OPTIONS } from '../../lib/salesSettings';
import {
  computeHistoryTotals,
  defaultPeriodRange,
  filterSalesList,
  formatDateTimeBr,
  formatSaleIdShort,
  SALE_STATUS_BADGE_MAP,
  toDateInput,
} from '../../lib/salesHistory';
import { resolveDailyReportDateYmd } from '../../lib/salesDailyReport.js';
import {
  clearSalesDailyReportDeepLink,
  lojaVendasDailyReportParams,
  resolveSalesDailyReportDeepLink,
} from '../../lib/lojaSalesTabs.js';
import SalesDailyReportModal from './SalesDailyReportModal';
import StatusBadge from '../shared/StatusBadge.jsx';
import { formatBRL } from '../../lib/moneyBr';
import { friendlyError } from '../../lib/errorMessages';
import SaleDetailModal from './SaleDetailModal';
import SalesCancelModal from './SalesCancelModal';
import SalesEditItemModal from './SalesEditItemModal';
import CancelReceiptPanel from './CancelReceiptPanel';

export default function SalesHistoryTab({ onSwitchTab, initialPeriod = null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAppliedRef = useRef(false);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = useMemo(() => {
    if (!academyId) return null;
    const a = (academyList || []).find((x) => x.id === academyId);
    if (!a) return null;
    return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };
  }, [academyList, academyId]);
  const canManageSales = useCanManageAcademySales(academyDoc);
  const canCancelSale = canManageSales;
  const canEditSale = canManageSales;

  const addToast = useUiStore((s) => s.addToast);
  const fetchSalesList = useSalesStore((s) => s.fetchSalesList);
  const fetchSaleDetail = useSalesStore((s) => s.fetchSaleDetail);
  const cancelSale = useSalesStore((s) => s.cancelSale);
  const cancelling = useSalesStore((s) => s.cancelling);
  const error = useSalesStore((s) => s.error);

  const [period, setPeriod] = useState(() => initialPeriod || defaultPeriodRange);
  const [statusFilter, setStatusFilter] = useState('all');
  const [canalFilter, setCanalFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sales, setSales] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSale, setDetailSale] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReceipt, setCancelReceipt] = useState(null);

  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editSaleItem, setEditSaleItem] = useState(null);

  const [salesSettings, setSalesSettings] = useState(() => readSalesSettings(null));
  const [academyName, setAcademyName] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDateYmd, setReportDateYmd] = useState(() => toDateInput(new Date()));
  const isMobile = useMatchMobile();

  useEffect(() => {
    if (initialPeriod?.from && initialPeriod?.to) {
      setPeriod({ from: initialPeriod.from, to: initialPeriod.to });
    }
  }, [initialPeriod?.from, initialPeriod?.to]);

  useEffect(() => {
    if (!academyId || !ACADEMIES_COL || !DB_ID) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setAcademyName(String(doc.name || '').trim());
        setSalesSettings(readSalesSettings(doc.settings));
      } catch (e) {
        console.error('[SalesHistory] academy', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const loadSales = useCallback(
    async ({ append = false, cursor = null } = {}) => {
      if (!academyId) return;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setLoadError('');
        setNextCursor(null);
        setHasMore(false);
      }
      try {
        const body = await fetchSalesList({
          from: period.from,
          to: period.to,
          limit: 50,
          cursor: append ? cursor : undefined,
        });
        const list = body.sales || [];
        setSales((prev) => (append ? [...prev, ...list] : list));
        setNextCursor(body.next_cursor || null);
        setHasMore(Boolean(body.has_more));
      } catch (e) {
        setLoadError(e);
        if (!append) {
          setSales([]);
          setNextCursor(null);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [academyId, period.from, period.to, fetchSalesList]
  );

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const filtered = useMemo(
    () => filterSalesList(sales, { status: statusFilter, canal: canalFilter, search }),
    [sales, statusFilter, canalFilter, search]
  );

  const totals = useMemo(() => computeHistoryTotals(filtered), [filtered]);

  const openDetail = async (row) => {
    setDetailOpen(true);
    setDetailSale(row);
    setDetailLoading(true);
    try {
      const full = await fetchSaleDetail(row.id);
      if (full) setDetailSale(full);
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
    addToast({ type: 'success', message: 'Venda cancelada' });
    setCancelOpen(false);
    setDetailOpen(false);
    const cancelDate = result.cancelada_em
      ? formatDateTimeBr(result.cancelada_em)
      : formatDateTimeBr(new Date().toISOString());
    setCancelReceipt({
      saleId: result.venda_id || detailSale.id,
      cancelDate,
      cancelReason: result.cancel_motivo || motivo,
      items: result.items || detailSale.items || [],
      refundTotal: Number(result.refund_total) || Number(detailSale.total) || 0,
    });
    void loadSales();
  };

  const copyReceipt = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: 'Comprovante copiado' });
    } catch {
      addToast({ type: 'error', message: 'Não foi possível copiar' });
    }
  };

  const setPeriodToday = () => {
    const today = toDateInput(new Date());
    setPeriod({ from: today, to: today });
  };

  const openDailyReport = (dateOverride = null) => {
    const dateYmd = dateOverride || resolveDailyReportDateYmd(period);
    setReportDateYmd(dateYmd);
    setReportOpen(true);
    setSearchParams(lojaVendasDailyReportParams(dateYmd, searchParams), { replace: true });
  };

  const closeDailyReport = () => {
    setReportOpen(false);
    if (resolveSalesDailyReportDeepLink(searchParams).open) {
      setSearchParams(clearSalesDailyReportDeepLink(searchParams), { replace: true });
    }
  };

  useEffect(() => {
    const { open, dateYmd } = resolveSalesDailyReportDeepLink(searchParams);
    if (!open) {
      deepLinkAppliedRef.current = false;
      return;
    }
    if (deepLinkAppliedRef.current) return;
    deepLinkAppliedRef.current = true;
    const resolvedDate = dateYmd || resolveDailyReportDateYmd(period);
    setReportDateYmd(resolvedDate);
    setReportOpen(true);
    if (dateYmd && dateYmd === period.from && dateYmd === period.to) return;
    if (dateYmd) {
      setPeriod({ from: dateYmd, to: dateYmd });
    }
  }, [period.from, period.to, searchParams]);

  return (
  <>
      <div className="card mt-4">
        <div className="flex gap-2 sales-history-filters">
          <div className="form-group form-group--from">
            <label className="text-xs">De</label>
            <DateInputField
              type="date"
              className="form-input"
              value={period.from}
              onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div className="form-group form-group--to">
            <label className="text-xs">Até</label>
            <DateInputField
              type="date"
              className="form-input"
              value={period.to}
              onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
          <div className="form-group form-group--status">
            <label className="text-xs">Status</label>
            <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todas</option>
              <option value="concluida">Concluídas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
          <div className="form-group form-group--canal">
            <label className="text-xs">Canal</label>
            <select className="form-input" value={canalFilter} onChange={(e) => setCanalFilter(e.target.value)}>
              <option value="all">Todas</option>
              {SALES_CHANNEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group form-group--search">
            <label className="text-xs">Busca</label>
            <div className="sales-history-search-wrap">
              <Search size={16} className="sales-history-search-icon" />
              <input
                className="form-input sales-history-search-input"
                placeholder="Cliente ou ID da venda"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="sales-history-toolbar flex gap-2 mt-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn-outline btn-sm" onClick={setPeriodToday}>
            Hoje
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => openDailyReport()}>
            Resumo do dia
          </button>
          {period.from !== period.to ? (
            <span className="text-small text-muted">
              Resumo usa a data de hoje — filtre um único dia para o dia selecionado.
            </span>
          ) : null}
        </div>

        <div className="sales-history-totals mt-3">
          <div className="sales-history-total">
            <span className="sales-history-total__label">Vendas concluídas</span>
            <strong>{totals.concludedCount}</strong>
          </div>
          <div className="sales-history-total">
            <span className="sales-history-total__label">Valor recebido</span>
            <strong>{formatBRL(totals.concludedTotal)}</strong>
          </div>
          <div className="sales-history-total">
            <span className="sales-history-total__label">Cancelamentos</span>
            <strong>{totals.cancelCount}</strong>
          </div>
        </div>
      </div>

      <div className="card mt-3 sales-history-table-wrap">
        {loading ? (
          <div className="p-3">
            <PageSkeleton variant="list" rows={5} />
          </div>
        ) : loadError || error ? (
          <div className="p-3">
            <ErrorBanner
              message={friendlyError(loadError || error, 'load')}
              onRetry={() => void loadSales()}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-3">
            <EmptyState
              variant="default"
              tone="dashed"
              icon={ShoppingBag}
              title="Nenhuma venda neste período"
              description="Registre uma venda pela aba Nova venda e ela aparecerá aqui."
              primaryAction={{
                label: 'Registrar venda',
                onClick: () => onSwitchTab?.('new'),
              }}
              role="status"
            />
          </div>
        ) : isMobile ? (
          <div className="sales-history-mobile-list">
            {filtered.map((row) => {
              return (
                <article key={row.id} className="navi-mobile-card sales-history-mobile-card">
                  <div className="sales-history-mobile-card__head">
                    <div className="sales-history-mobile-card__main">
                      <div className="sales-history-mobile-card__title">
                        {formatDateTimeBr(row.created_at)}
                        <span className="sales-history-mobile-card__id"> · {formatSaleIdShort(row.id)}</span>
                      </div>
                      <div className="sales-history-mobile-card__client">{row.client_name || '—'}</div>
                      <div className="sales-history-mobile-card__meta text-small text-muted">
                        {row.canal_label}
                        {row.items_summary ? ` · ${row.items_summary}` : ''}
                      </div>
                      <div className="sales-history-mobile-card__amount">
                        <strong>{row.total_label || formatBRL(row.total)}</strong>
                        {row.payment_label ? (
                          <span className="text-small text-muted"> · {row.payment_label}</span>
                        ) : null}
                      </div>
                    </div>
                    <StatusBadge status={row.status} map={SALE_STATUS_BADGE_MAP} size="sm" />
                  </div>
                  <div className="navi-mobile-card__actions sales-history-mobile-card__actions">
                    <button
                      type="button"
                      className="btn-outline sales-history-mobile-detail-btn"
                      onClick={() => openDetail(row)}
                    >
                      Ver detalhes
                      <ChevronRight size={16} aria-hidden className="sales-history-mobile-detail-btn__chevron" />
                    </button>
                  </div>
                </article>
              );
            })}
            {hasMore ? (
              <div className="p-3 sales-history-load-more">
                <button
                  type="button"
                  className="btn-outline sales-history-load-more__btn"
                  disabled={loadingMore}
                  onClick={() => void loadSales({ append: true, cursor: nextCursor })}
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <table className="sales-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>ID</th>
                <th>Cliente</th>
                <th>Canal</th>
                <th>Itens</th>
                <th>Total</th>
                <th>Pagamento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                return (
                  <tr
                    key={row.id}
                    className="sales-table__row-clickable"
                    onClick={() => openDetail(row)}
                  >
                    <td>{formatDateTimeBr(row.created_at)}</td>
                    <td>{formatSaleIdShort(row.id)}</td>
                    <td>{row.client_name}</td>
                    <td>{row.canal_label}</td>
                    <td>{row.items_summary}</td>
                    <td>{row.total_label || formatBRL(row.total)}</td>
                    <td>{row.payment_label}</td>
                    <td>
                      <StatusBadge status={row.status} map={SALE_STATUS_BADGE_MAP} size="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !loadError && filtered.length > 0 && hasMore ? (
          <div className="p-3 sales-history-load-more">
            <button
              type="button"
              className="btn-outline btn-sm"
              disabled={loadingMore}
              onClick={() => void loadSales({ append: true, cursor: nextCursor })}
            >
              {loadingMore ? 'Carregando…' : 'Carregar mais'}
            </button>
          </div>
        ) : null}
      </div>

      <SaleDetailModal
        open={detailOpen}
        sale={detailSale}
        loading={detailLoading}
        onClose={() => setDetailOpen(false)}
        onCancelClick={() => setCancelOpen(true)}
        canCancelSale={canCancelSale}
        canEditSale={canEditSale}
        onEditItemClick={(item) => {
          setEditSaleItem(item);
          setEditItemOpen(true);
        }}
        onLiquidated={() => void loadSales()}
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
              if (full) setDetailSale(full);
            } catch (e) {
              addToast({ type: 'error', message: friendlyError(e, 'load') });
            }
          }
          void loadSales();
        }}
      />

      <SalesCancelModal
        open={cancelOpen}
        sale={detailSale}
        loading={cancelling}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancelConfirm}
      />

      <CancelReceiptPanel
        receipt={cancelReceipt}
        settings={salesSettings}
        academyName={academyName}
        onCopy={copyReceipt}
      />

      <SalesDailyReportModal
        open={reportOpen}
        dateYmd={reportDateYmd}
        onClose={closeDailyReport}
      />

    </>
  );
}


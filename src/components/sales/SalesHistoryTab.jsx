import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ShoppingBag, ChevronRight } from 'lucide-react';
import useMatchMobile from '../../hooks/useMatchMobile.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { useSalesStore } from '../../store/useSalesStore';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { readSalesSettings, SALES_CHANNEL_OPTIONS } from '../../lib/salesSettings';
import {
  computeHistoryTotals,
  defaultPeriodRange,
  filterSalesList,
  formatDateTimeBr,
  formatSaleIdShort,
  saleStatusLabel,
} from '../../lib/salesHistory';
import { formatBRL } from '../../lib/moneyBr';
import { friendlyError } from '../../lib/errorMessages';
import SaleDetailModal from './SaleDetailModal';
import SalesCancelModal from './SalesCancelModal';
import CancelReceiptPanel from './CancelReceiptPanel';

export default function SalesHistoryTab({ onSwitchTab }) {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = useMemo(() => {
    if (!academyId) return null;
    const a = (academyList || []).find((x) => x.id === academyId);
    if (!a) return null;
    return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };
  }, [academyList, academyId]);
  const navRole = useUserRole(academyDoc);
  const canCancelSale = navRole === 'owner' || navRole === 'admin';

  const addToast = useUiStore((s) => s.addToast);
  const fetchSalesList = useSalesStore((s) => s.fetchSalesList);
  const fetchSaleDetail = useSalesStore((s) => s.fetchSaleDetail);
  const cancelSale = useSalesStore((s) => s.cancelSale);
  const cancelling = useSalesStore((s) => s.cancelling);
  const error = useSalesStore((s) => s.error);

  const [period, setPeriod] = useState(defaultPeriodRange);
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

  const [salesSettings, setSalesSettings] = useState(() => readSalesSettings(null));
  const [academyName, setAcademyName] = useState('');
  const isMobile = useMatchMobile();

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

  return (
  <>
      <div className="card mt-4">
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 130 }}>
            <label className="text-xs">De</label>
            <input
              type="date"
              className="form-input"
              value={period.from}
              onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 130 }}>
            <label className="text-xs">Até</label>
            <input
              type="date"
              className="form-input"
              value={period.to}
              onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="text-xs">Status</label>
            <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todas</option>
              <option value="concluida">Concluídas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
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
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
            <label className="text-xs">Busca</label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 10, top: 10, opacity: 0.5 }} />
              <input
                className="form-input"
                style={{ paddingLeft: 32 }}
                placeholder="Cliente ou ID da venda"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
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

      <div
        className="card mt-3 sales-history-table-wrap"
        style={{
          maxHeight: 'calc(100vh - 320px)',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
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
              const cancelled = String(row.status).toLowerCase() === 'cancelada';
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
                    <span
                      className={
                        cancelled ? 'sales-badge sales-badge--danger' : 'sales-badge sales-badge--ok'
                      }
                    >
                      {saleStatusLabel(row.status)}
                    </span>
                  </div>
                  <div className="navi-mobile-card__actions sales-history-mobile-card__actions">
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ minHeight: 44, flex: 1, justifyContent: 'center' }}
                      onClick={() => openDetail(row)}
                    >
                      Ver detalhes
                      <ChevronRight size={16} aria-hidden style={{ marginLeft: 4 }} />
                    </button>
                  </div>
                </article>
              );
            })}
            {hasMore ? (
              <div className="p-3" style={{ borderTop: '1px solid var(--border-light)' }}>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ width: '100%', minHeight: 44 }}
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
                const cancelled = String(row.status).toLowerCase() === 'cancelada';
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
                      <span
                        className={
                          cancelled ? 'sales-badge sales-badge--danger' : 'sales-badge sales-badge--ok'
                        }
                      >
                        {saleStatusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !loadError && filtered.length > 0 && hasMore ? (
          <div className="p-3" style={{ borderTop: '1px solid var(--border-light)' }}>
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

      <style>{`
        .sales-history-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
        .sales-history-total { padding: 10px 12px; border-radius: 8px; background: var(--surface-2); }
        .sales-history-total__label { display: block; font-size: 12px; opacity: 0.75; margin-bottom: 4px; }
        .sales-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .sales-table th, .sales-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border-light); }
        .sales-table th { font-weight: 600; font-size: 12px; opacity: 0.8; }
        .sales-history-table-wrap .sales-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: var(--surface, #fff);
          opacity: 1;
        }
        .sales-table__row-clickable { cursor: pointer; }
        .sales-table__row-clickable:hover { background: var(--bg-hover); }
        .sales-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
        .sales-badge--ok { background: rgba(34, 197, 94, 0.15); color: var(--success, #16a34a); }
        .sales-badge--danger { background: rgba(239, 68, 68, 0.15); color: var(--danger, #dc2626); }
        .sales-modal-backdrop {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .sales-modal { max-width: 420px; width: 100%; max-height: 90vh; overflow-y: auto; }
        .sales-modal--wide { max-width: 560px; }
        .sales-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
        .sales-detail-span-2 { grid-column: 1 / -1; }
        .btn-danger { background: var(--danger, #dc2626); color: #fff; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; }
        .btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }
        .sales-history-mobile-list { display: flex; flex-direction: column; }
        .sales-history-mobile-card { margin: 0; border-radius: 0; border-left: none; border-right: none; }
        .sales-history-mobile-card:first-child { border-top: none; }
        .sales-history-mobile-card__head {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
          padding: 12px 14px;
        }
        .sales-history-mobile-card__main { flex: 1; min-width: 0; }
        .sales-history-mobile-card__title { font-weight: 600; font-size: 14px; }
        .sales-history-mobile-card__id { font-weight: 500; color: var(--text-muted); font-size: 12px; }
        .sales-history-mobile-card__client { font-weight: 600; font-size: 14px; margin-top: 4px; }
        .sales-history-mobile-card__meta { margin-top: 2px; }
        .sales-history-mobile-card__amount { margin-top: 6px; font-variant-numeric: tabular-nums; }
        .sales-history-mobile-card__actions { padding: 0 14px 12px; border-top: 0.5px solid var(--border-light); }
      `}</style>
    </>
  );
}


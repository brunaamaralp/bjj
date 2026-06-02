import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import { Download, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { fetchInventoryMovements, fetchStockMovesConciliation } from '../../lib/inventoryMovementsApi.js';
import { createSessionJwt } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { fetchTeamMemberships } from '../../lib/teamApi.js';
import { downloadCsv } from '../../lib/reportsExport.js';
import { formatSaleIdShort } from '../../lib/salesHistory';
import { useSalesStore } from '../../store/useSalesStore';
import SaleDetailModal from '../sales/SaleDetailModal.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import '../finance/finance.css';
import './reports.css';

const CONCILIATION_FILTER_OPTIONS = [
  { value: 'divergent', label: 'Divergentes' },
  { value: 'pending', label: 'Ainda pendentes' },
  { value: 'settled', label: 'Quitados hoje' },
  { value: 'all', label: 'Todos' },
];

const MOVES_VIRTUAL_THRESHOLD = 25;

const KIND_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'sale', label: 'Venda' },
  { value: 'return', label: 'Devolução' },
  { value: 'adjustment', label: 'Ajuste' },
  { value: 'loss', label: 'Perda' },
  { value: 'rental', label: 'Aluguel' },
  { value: 'other', label: 'Outros' },
];

function formatMoveDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function productSizeLabel(row) {
  const parts = [row.product_name];
  const v = [row.variant_size, row.variant_color].filter(Boolean).join(' / ');
  if (v && v !== 'Único') parts.push(v);
  return parts.filter(Boolean).join(' · ') || '—';
}

export default function ReportsMovimentacoesPanel({ academyId, from, to, hasInventory }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({
    total_unidades: 0,
    total_faturado: 0,
    total_devolucoes: 0,
    registros: 0,
  });
  const [saleDetail, setSaleDetail] = useState(null);
  const [saleDetailLoading, setSaleDetailLoading] = useState(false);
  const [team, setTeam] = useState([]);
  const fetchSaleDetail = useSalesStore((s) => s.fetchSaleDetail);
  const [panelView, setPanelView] = useState('movements');
  const [concRows, setConcRows] = useState([]);
  const [concSummary, setConcSummary] = useState(null);
  const [concLoading, setConcLoading] = useState(false);
  const [concError, setConcError] = useState('');
  const [concStatusFilter, setConcStatusFilter] = useState('divergent');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [productId, setProductId] = useState('');
  const [movementKind, setMovementKind] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      if (!academyId || !hasInventory) return;
      try {
        const jwt = await createSessionJwt();
        if (!jwt) return;
        const res = await fetch('/api/products', {
          headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': academyId },
        });
        const data = await res.json().catch(() => ({}));
        if (!active || !res.ok) return;
        const parents = (data.products || []).map((p) => ({
          id: p.id,
          nome: p.nome || p.name || p.id,
        }));
        const seen = new Set(parents.map((p) => p.id));
        for (const v of data.variants || []) {
          const pid = v.product_id;
          if (pid && !seen.has(pid)) {
            seen.add(pid);
            parents.push({ id: pid, nome: v.nome || v.display_label || pid });
          }
        }
        setProducts(parents.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      } catch {
        if (active) setProducts([]);
      }
    };
    void loadProducts();
    return () => {
      active = false;
    };
  }, [academyId, hasInventory]);

  useEffect(() => {
    let active = true;
    if (!academyId) return undefined;
    fetchTeamMemberships(academyId)
      .then((data) => {
        if (!active) return;
        const list = data.memberships || data.members || [];
        setTeam(
          list.map((m) => ({
            id: m.userId || m.user_id,
            nome: m.name || m.nome || m.email || m.userId,
          }))
        );
      })
      .catch(() => active && setTeam([]));
    return () => {
      active = false;
    };
  }, [academyId]);

  const openSaleDetail = async (saleId) => {
    if (!saleId) return;
    setSaleDetailLoading(true);
    setSaleDetail(null);
    try {
      const sale = await fetchSaleDetail(saleId);
      setSaleDetail(sale);
    } catch {
      setSaleDetail(null);
    } finally {
      setSaleDetailLoading(false);
    }
  };

  const loadPage = useCallback(
    async ({ append = false, cursor = null } = {}) => {
      if (!academyId || !from || !to) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const body = await fetchInventoryMovements({
          from,
          to,
          academyId,
          product_id: productId || undefined,
          movement_kind: movementKind || undefined,
          usuario_id: operatorFilter || undefined,
          limit: 50,
          cursor: append ? cursor : undefined,
        });
        const list = body.movements || [];
        setRows((prev) => (append ? [...prev, ...list] : list));
        if (!append) {
          setTotals(
            body.totals || {
              total_unidades: body.summary?.units_out ?? 0,
              total_faturado: body.summary?.revenue_total ?? 0,
              total_devolucoes: body.summary?.returns_units ?? 0,
              registros: body.summary?.registros ?? list.length,
            }
          );
        }
        setNextCursor(body.pagination?.next_cursor || null);
      } catch (e) {
        setError(String(e?.message || e));
        if (!append) {
          setRows([]);
          setTotals({ total_unidades: 0, total_faturado: 0, total_devolucoes: 0, registros: 0 });
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [academyId, from, to, productId, movementKind, operatorFilter]
  );

  useEffect(() => {
    if (panelView === 'movements') void loadPage();
  }, [loadPage, panelView]);

  const loadConciliation = useCallback(async () => {
    if (!academyId || !from || !to) return;
    setConcLoading(true);
    setConcError('');
    try {
      const data = await fetchStockMovesConciliation({
        from,
        to,
        academyId,
        status_filter: concStatusFilter,
      });
      setConcRows(data.rows || []);
      setConcSummary(data.summary || null);
    } catch (e) {
      setConcError(String(e?.message || e));
      setConcRows([]);
      setConcSummary(null);
    } finally {
      setConcLoading(false);
    }
  }, [academyId, from, to, concStatusFilter]);

  useEffect(() => {
    if (panelView === 'conciliation') void loadConciliation();
  }, [panelView, loadConciliation]);

  const exportConciliationCsv = () => {
    downloadCsv(
      concRows.map((r) => ({
        data: formatMoveDate(r.date),
        produto: productSizeLabel(r),
        cliente: r.cliente_nome,
        operador: r.operador_nome,
        total: r.line_total ?? '',
        status_na_saida: r.payment_status_at_move_label,
        status_atual: r.status_atual_venda_label,
        conciliacao: r.conciliacao_status_label,
        venda: r.sale_id ? formatSaleIdShort(r.sale_id) : '',
      })),
      `conciliacao-pagamento-${from}_${to}.csv`
    );
  };

  const conciliationRowClass = (status) => {
    if (status === 'ok') return '';
    if (status === 'settled_after') return 'reports-conc-row--ok-later';
    if (status === 'reversed' || status === 'cancelled_after') return 'reports-conc-row--danger';
    return 'reports-conc-row--warn';
  };

  const filtered = useMemo(() => {
    const q = String(clientSearch || '').trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (q && !String(r.cliente_nome || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, clientSearch]);

  const movTableScrollRef = useRef(null);
  const shouldVirtualizeMoves = filtered.length > MOVES_VIRTUAL_THRESHOLD;
  const movesRowVirtualizer = useVirtualizer({
    count: shouldVirtualizeMoves ? filtered.length : 0,
    getScrollElement: () => movTableScrollRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  const moveColumns = useMemo(
    () => [
      { key: 'date', label: 'Data', render: (r) => formatMoveDate(r.date) },
      { key: 'product', label: 'Produto / tamanho', render: (r) => productSizeLabel(r) },
      { key: 'tipo', label: 'Tipo', render: (r) => r.movement_kind_label || r.tipo },
      { key: 'cliente_nome', label: 'Cliente' },
      { key: 'operador_nome', label: 'Operador' },
      { key: 'quantidade', label: 'Qtd' },
      {
        key: 'unit_price',
        label: 'Valor unit.',
        render: (r) => (r.unit_price != null ? formatBRL(r.unit_price) : '—'),
      },
      {
        key: 'line_total',
        label: 'Total linha',
        render: (r) => (r.line_total != null ? formatBRL(r.line_total) : '—'),
      },
      { key: 'payment_status_label', label: 'Status pag.', render: (r) => r.payment_status_label || '—' },
      {
        key: 'sale_id',
        label: 'Venda #',
        render: (r) =>
          r.sale_id ? (
            <button
              type="button"
              className="reports-moves-sale-chip"
              title={`Ver venda ${r.sale_id}`}
              onClick={() => void openSaleDetail(r.sale_id)}
            >
              #{formatSaleIdShort(r.sale_id)}
            </button>
          ) : (
            '—'
          ),
      },
    ],
    [openSaleDetail]
  );

  const concColumns = useMemo(
    () => [
      { key: 'date', label: 'Data', render: (r) => formatMoveDate(r.date) },
      { key: 'product', label: 'Produto', render: (r) => productSizeLabel(r) },
      { key: 'cliente_nome', label: 'Cliente' },
      {
        key: 'line_total',
        label: 'Total',
        render: (r) => (r.line_total != null ? formatBRL(r.line_total) : '—'),
      },
      { key: 'payment_status_at_move_label', label: 'Na saída' },
      { key: 'status_atual_venda_label', label: 'Hoje' },
      {
        key: 'conciliacao_status_label',
        label: 'Conciliação',
        render: (r) => (
          <span
            className={`reports-conc-badge reports-conc-badge--${
              r.conciliacao_status === 'ok'
                ? 'ok'
                : r.conciliacao_status === 'settled_after'
                  ? 'info'
                  : r.conciliacao_status === 'reversed' || r.conciliacao_status === 'cancelled_after'
                    ? 'danger'
                    : 'warn'
            }`}
          >
            {r.conciliacao_status_label}
          </span>
        ),
      },
      {
        key: 'sale_id',
        label: 'Venda #',
        render: (r) =>
          r.sale_id ? (
            <button
              type="button"
              className="reports-moves-sale-chip"
              onClick={() => void openSaleDetail(r.sale_id)}
            >
              #{formatSaleIdShort(r.sale_id)}
            </button>
          ) : (
            '—'
          ),
      },
    ],
    [openSaleDetail]
  );

  const renderMoveBody = useCallback(
    ({ rows: bodyRows, columns }) => {
      if (!shouldVirtualizeMoves) {
        return bodyRows.map((r, index) => (
          <tr key={r.move_id}>
            {columns.map((col) => (
              <td key={col.key}>{typeof col.render === 'function' ? col.render(r) : r[col.key] ?? '—'}</td>
            ))}
          </tr>
        ));
      }
      const virtualItems = movesRowVirtualizer.getVirtualItems();
      const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
      const paddingBottom =
        virtualItems.length > 0
          ? movesRowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
          : 0;
      return (
        <>
          {paddingTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ height: paddingTop, padding: 0, border: 'none' }} />
            </tr>
          ) : null}
          {virtualItems.map((virtualRow) => {
            const r = bodyRows[virtualRow.index];
            return (
              <tr key={r.move_id}>
                {columns.map((col) => (
                  <td key={col.key}>
                    {typeof col.render === 'function' ? col.render(r) : r[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            );
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ height: paddingBottom, padding: 0, border: 'none' }} />
            </tr>
          ) : null}
        </>
      );
    },
    [shouldVirtualizeMoves, movesRowVirtualizer]
  );

  const exportCsv = () => {
    const csvRows = filtered.map((r) => ({
      data: formatMoveDate(r.date),
      produto: productSizeLabel(r),
      tipo: r.movement_kind_label || r.movement_kind,
      cliente: r.cliente_nome,
      operador: r.operador_nome,
      quantidade: r.quantidade,
      valor_unitario: r.unit_price ?? '',
      total_linha: r.line_total ?? '',
      status_pagamento: r.payment_status_label || r.payment_status_at_move || '',
      venda: r.sale_id ? formatSaleIdShort(r.sale_id) : '',
    }));
    downloadCsv(csvRows, `movimentacoes-estoque-${from}_${to}.csv`);
  };

  if (!hasInventory) {
    return (
      <div className="reports-empty card mt-4">
        <EmptyState
          insideCard
          variant="compact"
          tone="solid"
          title="Módulo de estoque desativado"
          description="Ative estoque nas configurações para ver movimentações detalhadas."
          role="status"
          primaryAction={{
            label: 'Configurar estoque',
            onClick: () => navigate('/loja?tab=estoque'),
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mt-4">
        <div className="reports-moves-view-tabs" role="tablist">
          <button
            type="button"
            className={panelView === 'movements' ? 'btn-secondary btn-sm' : 'btn-outline btn-sm'}
            onClick={() => setPanelView('movements')}
          >
            Movimentações
          </button>
          <button
            type="button"
            className={panelView === 'conciliation' ? 'btn-secondary btn-sm' : 'btn-outline btn-sm'}
            onClick={() => setPanelView('conciliation')}
          >
            <AlertTriangle size={14} aria-hidden style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Conciliação pagamento
          </button>
        </div>

        {panelView === 'conciliation' ? (
          <>
            <div className="reports-moves-filters">
              <div className="form-group">
                <label className="text-small text-muted">Exibir</label>
                <select
                  className="form-input"
                  value={concStatusFilter}
                  onChange={(e) => setConcStatusFilter(e.target.value)}
                >
                  {CONCILIATION_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {concLoading ? (
              <div className="card" style={{ padding: 16 }}>
                <PageSkeleton variant="list" rows={6} />
              </div>
            ) : null}
            {concError ? <ErrorBanner message={friendlyError(concError, 'load')} className="mt-3" /> : null}
            {!concLoading && !concError ? (
              <div className="card" style={{ padding: 16 }}>
                <ReportSectionHeading
                  title="Saídas de estoque vs pagamento atual"
                  subtitle="Compara o status gravado na movimentação com SALES + Caixa hoje."
                  action={
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={exportConciliationCsv}
                      disabled={!concRows.length}
                    >
                      <Download size={14} aria-hidden />
                      Exportar CSV
                    </button>
                  }
                />
                {concSummary ? (
                  <div className="reports-moves-footer" style={{ marginTop: 0, marginBottom: 12, borderTop: 'none' }}>
                    <span>
                      <strong>Saídas no período:</strong> {concSummary.total_moves}
                    </span>
                    <span>
                      <strong>Divergentes:</strong> {concSummary.divergent_total ?? concSummary.divergent}
                    </span>
                    <span>
                      <strong>Quitados depois:</strong> {concSummary.settled_after}
                    </span>
                    <span>
                      <strong>Pendentes hoje:</strong> {concSummary.pending_atual}
                    </span>
                  </div>
                ) : null}
                {!concRows.length ? (
                  <EmptyState
                    insideCard
                    variant="compact"
                    tone="dashed"
                    title="Nenhuma divergência para os filtros"
                    description="Todas as saídas de venda estão alinhadas com o pagamento atual, ou não há vendas no período."
                    role="status"
                  />
                ) : (
                  <ReportDataTable
                    columns={concColumns}
                    rows={concRows.map((r) => ({ ...r, id: r.move_id }))}
                    emptyMessage="Nenhuma divergência para os filtros"
                    getRowClassName={(r) => conciliationRowClass(r.conciliacao_status)}
                    wrapClassName="reports-mov-table-wrap"
                    stickyHeader
                  />
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {panelView === 'movements' ? (
        <>
        <div className="reports-moves-filters" role="search">
          <div className="form-group">
            <label className="text-small text-muted">Produto</label>
            <select className="form-input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Todos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="text-small text-muted">Tipo</label>
            <select
              className="form-input"
              value={movementKind}
              onChange={(e) => setMovementKind(e.target.value)}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 160 }}>
            <label className="text-small text-muted">Cliente</label>
            <input
              className="form-input"
              type="search"
              placeholder="Buscar por nome…"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ minWidth: 180 }}>
            <label className="text-small text-muted">Operador</label>
            <select
              className="form-input"
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="card" style={{ padding: 16 }}>
            <PageSkeleton variant="list" rows={8} />
          </div>
        ) : null}
        {error ? <ErrorBanner message={friendlyError(error, 'load')} className="mt-3" /> : null}

        {!loading && !error ? (
          <div className="card" style={{ padding: 16 }}>
            <ReportSectionHeading
              title={
                <>
                  <ArrowLeftRight size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
                  Movimentações de estoque
                </>
              }
              action={
                <button type="button" className="btn-outline btn-sm" onClick={exportCsv} disabled={!filtered.length}>
                  <Download size={14} aria-hidden />
                  Exportar CSV
                </button>
              }
            />

            {!filtered.length ? (
              <EmptyState
                insideCard
                variant="compact"
                tone="dashed"
                title="Nenhuma movimentação encontrada para os filtros selecionados"
                description="Altere o período, produto, cliente ou tipo de movimento."
                role="status"
              />
            ) : (
              <ReportDataTable
                columns={moveColumns}
                rows={filtered}
                emptyMessage="Nenhuma movimentação encontrada para os filtros selecionados"
                scrollRef={movTableScrollRef}
                wrapClassName="reports-mov-table-wrap"
                stickyHeader
                renderBody={renderMoveBody}
              />
            )}

            <div className="reports-moves-footer" role="status">
              <span>
                <strong>Unidades saídas:</strong> {totals.total_unidades}
              </span>
              <span>
                <strong>Total faturado:</strong> {formatBRL(totals.total_faturado)}
              </span>
              <span>
                <strong>Devoluções (un.):</strong> {totals.total_devolucoes}
              </span>
              <span className="text-muted text-small">
                {filtered.length} na página · {totals.registros} no período
              </span>
            </div>

            {nextCursor ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={loadingMore}
                  onClick={() => void loadPage({ append: true, cursor: nextCursor })}
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        </>
        ) : null}
      </div>

      <SaleDetailModal
        open={Boolean(saleDetail || saleDetailLoading)}
        sale={saleDetail}
        loading={saleDetailLoading}
        onClose={() => {
          setSaleDetail(null);
          setSaleDetailLoading(false);
        }}
      />
    </>
  );
}

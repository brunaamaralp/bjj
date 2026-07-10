import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, Package, RotateCcw, Scale, SlidersHorizontal, Wallet } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { fetchInventoryMovements, fetchStockMovesConciliation } from '../../lib/inventoryMovementsApi.js';
import { createSessionJwt } from '../../lib/appwrite';
import { fetchTeamMemberships } from '../../lib/teamApi.js';
import { downloadCsv } from '../../lib/reportsExport.js';
import {
  exportInventoryMovementsCsv,
  fetchAllInventoryMovementsInPeriod,
} from '../../lib/inventoryMovementsExport.js';
import { formatSaleIdShort } from '../../lib/salesHistory';
import { useSalesStore } from '../../store/useSalesStore';
import SaleDetailModal from '../sales/SaleDetailModal.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import ReportDataTable, { VirtualTableSpacer } from './shared/ReportDataTable.jsx';
import { useRegisterReportsExport } from '../../hooks/useReportsExportSlot.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportKpiCard from './shared/ReportKpiCard.jsx';
import SearchableSelect from '../shared/SearchableSelect.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import { useToast } from '../../hooks/useToast.js';
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
  { value: 'entry', label: 'Entrada' },
  { value: 'initial', label: 'Cadastro inicial' },
  { value: 'sale', label: 'Venda' },
  { value: 'return', label: 'Devolução' },
  { value: 'adjustment', label: 'Ajuste' },
  { value: 'loss', label: 'Perda' },
  { value: 'rental', label: 'Aluguel' },
  { value: 'other', label: 'Outros' },
];

const EMPTY_TOTALS = {
  entradas_un: 0,
  saidas_un: 0,
  ajustes_liquido: 0,
  saldo_liquido: 0,
  total_unidades: 0,
  total_faturado: 0,
  total_devolucoes: 0,
  registros: 0,
  with_balance_snapshot: 0,
  without_balance_snapshot: 0,
};

function formatSignedQty(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

function qtyClassName(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n === 0) return 'reports-qty reports-qty--zero';
  return n > 0 ? 'reports-qty reports-qty--in' : 'reports-qty reports-qty--out';
}

function ReportsStockCashBadge({ row }) {
  const txId = String(row.financial_tx_id || '').trim();
  if (!txId) {
    if (row.movement_kind === 'entry' && row.purchase_price > 0) {
      return <span className="reports-cash-badge reports-cash-badge--muted">Caixa pendente</span>;
    }
    return <span className="reports-cash-badge reports-cash-badge--muted">Só estoque</span>;
  }
  const st = String(row.financial_tx_status || '').toLowerCase();
  if (st === 'cancelled') {
    return <span className="reports-cash-badge reports-cash-badge--warn">Estornada no Caixa</span>;
  }
  const label =
    row.purchase_price != null && row.purchase_price > 0
      ? formatBRL(row.purchase_price)
      : 'Ver lançamento';
  return (
    <Link
      to={`/financeiro?tab=movimentacoes&tx=${encodeURIComponent(txId)}`}
      className="reports-cash-badge reports-cash-badge--link"
    >
      No Caixa · {label}
    </Link>
  );
}

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

const KIND_FILTER_OPTIONS = KIND_OPTIONS;

function balanceSnapshotClass(row) {
  if (row.quantity_before != null && row.quantity_before < 0) {
    return 'reports-balance-snapshot reports-balance-snapshot--warn';
  }
  return 'reports-balance-snapshot';
}

function OperationalKpiGrid({ totals, compactFinance = false }) {
  const saldo = Number(totals.saldo_liquido) || 0;
  return (
    <div className="reports-kpi-grid reports-kpi-grid--operational">
      <ReportKpiCard
        label="Entradas"
        value={`+${totals.entradas_un ?? 0} un.`}
        icon={<ArrowDownToLine size={18} strokeWidth={2.25} />}
        highlight="success"
      />
      <ReportKpiCard
        label="Saídas"
        value={`−${totals.saidas_un ?? totals.total_unidades ?? 0} un.`}
        icon={<ArrowUpFromLine size={18} strokeWidth={2.25} />}
        highlight="danger"
      />
      <ReportKpiCard
        label="Ajustes (líq.)"
        value={formatSignedQty(totals.ajustes_liquido ?? 0)}
        sublabel="unidades"
        icon={<SlidersHorizontal size={18} strokeWidth={2.25} />}
        highlight={
          Number(totals.ajustes_liquido) > 0
            ? 'success'
            : Number(totals.ajustes_liquido) < 0
              ? 'danger'
              : 'default'
        }
      />
      <ReportKpiCard
        label="Saldo líquido"
        value={`${formatSignedQty(saldo)} un.`}
        icon={<Scale size={18} strokeWidth={2.25} />}
        highlight={saldo > 0 ? 'success' : saldo < 0 ? 'danger' : 'default'}
      />
      <ReportKpiCard
        label="Devoluções"
        value={`${totals.total_devolucoes ?? 0} un.`}
        icon={<RotateCcw size={18} strokeWidth={2.25} />}
      />
      {!compactFinance ? (
        <ReportKpiCard
          label="Faturado (vendas)"
          value={formatBRL(totals.total_faturado ?? 0)}
          icon={<Wallet size={18} strokeWidth={2.25} />}
          sublabel="no período"
        />
      ) : null}
    </div>
  );
}

function productSizeLabel(row) {
  const parts = [row.product_name];
  const v = [row.variant_size, row.variant_color].filter(Boolean).join(' / ');
  if (v && v !== 'Único') parts.push(v);
  return parts.filter(Boolean).join(' · ') || '—';
}

function ReportsMoveMobileCard({ row, hasFinance, showValueColumns, onOpenSale }) {
  return (
    <article className="reports-move-mobile-card">
      <div className="reports-move-mobile-card__head">
        <time className="reports-move-mobile-card__date">{formatMoveDate(row.date)}</time>
        <span className={qtyClassName(row.quantidade)}>{formatSignedQty(row.quantidade)} un.</span>
      </div>
      <p className="reports-move-mobile-card__product">{productSizeLabel(row)}</p>
      <p className="reports-move-mobile-card__meta">
        <span>{row.movement_kind_label || row.tipo}</span>
        {row.balance_label ? (
          <>
            <span className="reports-move-mobile-card__dot" aria-hidden>
              ·
            </span>
            <span className={balanceSnapshotClass(row)}>Saldo {row.balance_label}</span>
          </>
        ) : null}
      </p>
      {(row.cliente_nome || row.operador_nome) && (
        <p className="reports-move-mobile-card__people">
          {row.cliente_nome ? <span>{row.cliente_nome}</span> : null}
          {row.cliente_nome && row.operador_nome ? (
            <span className="reports-move-mobile-card__dot" aria-hidden>
              ·
            </span>
          ) : null}
          {row.operador_nome ? <span>{row.operador_nome}</span> : null}
        </p>
      )}
      {hasFinance && (row.movement_kind === 'entry' || row.financial_tx_id) ? (
        <div className="reports-move-mobile-card__caixa">
          <ReportsStockCashBadge row={row} />
        </div>
      ) : null}
      {showValueColumns && row.line_total != null ? (
        <p className="reports-move-mobile-card__amount">{formatBRL(row.line_total)}</p>
      ) : null}
      {row.sale_id ? (
        <button
          type="button"
          className="reports-moves-sale-chip"
          onClick={() => onOpenSale(row.sale_id)}
        >
          Venda #{formatSaleIdShort(row.sale_id)}
        </button>
      ) : null}
    </article>
  );
}

function ReportsByProductMobileCard({ row, onDrillDown }) {
  return (
    <article className="reports-move-mobile-card">
      <button
        type="button"
        className="reports-product-drill-link reports-move-mobile-card__product"
        onClick={() => onDrillDown(row)}
      >
        {row.product_name}
      </button>
      <div className="reports-move-mobile-card__stats">
        <span>
          <strong>{row.movimentos}</strong> mov.
        </span>
        <span className="reports-qty reports-qty--in">+{row.entradas_un}</span>
        <span className="reports-qty reports-qty--out">−{row.saidas_un}</span>
        <span className={qtyClassName(row.saldo_liquido)}>{formatSignedQty(row.saldo_liquido)}</span>
      </div>
    </article>
  );
}

function ReportsConciliationMobileCard({ row, onOpenSale }) {
  return (
    <article className="reports-move-mobile-card">
      <div className="reports-move-mobile-card__head">
        <time className="reports-move-mobile-card__date">{formatMoveDate(row.date)}</time>
        {row.line_total != null ? (
          <span className="reports-move-mobile-card__amount">{formatBRL(row.line_total)}</span>
        ) : null}
      </div>
      <p className="reports-move-mobile-card__product">{productSizeLabel(row)}</p>
      <p className="reports-move-mobile-card__people">{row.cliente_nome || '—'}</p>
      <p className="reports-move-mobile-card__meta">
        Na saída: {row.payment_status_at_move_label} · Hoje: {row.status_atual_venda_label}
      </p>
      <span
        className={`reports-conc-badge reports-conc-badge--${
          row.conciliacao_status === 'ok'
            ? 'ok'
            : row.conciliacao_status === 'settled_after'
              ? 'info'
              : row.conciliacao_status === 'reversed' || row.conciliacao_status === 'cancelled_after'
                ? 'danger'
                : 'warn'
        }`}
      >
        {row.conciliacao_status_label}
      </span>
      {row.sale_id ? (
        <button
          type="button"
          className="reports-moves-sale-chip"
          onClick={() => onOpenSale(row.sale_id)}
        >
          Venda #{formatSaleIdShort(row.sale_id)}
        </button>
      ) : null}
    </article>
  );
}

export default function ReportsEstoqueMovimentacoesSection({
  academyId,
  from,
  to,
  hasFinance = false,
  panelView = 'movements',
  onPanelViewChange,
}) {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [saleDetail, setSaleDetail] = useState(null);
  const [saleDetailLoading, setSaleDetailLoading] = useState(false);
  const [team, setTeam] = useState([]);
  const fetchSaleDetail = useSalesStore((s) => s.fetchSaleDetail);
  const toast = useToast();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [exporting, setExporting] = useState(false);
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
  const [clientSearchDebounced, setClientSearchDebounced] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const [products, setProducts] = useState([]);
  const [byProduct, setByProduct] = useState([]);
  const [showValueColumns, setShowValueColumns] = useState(false);

  const clientFilterPending = clientSearch.trim() !== clientSearchDebounced.trim();

  useEffect(() => {
    const timer = setTimeout(() => setClientSearchDebounced(clientSearch), 300);
    return () => clearTimeout(timer);
  }, [clientSearch]);

  const productFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...products.map((p) => ({ value: p.id, label: p.nome })),
    ],
    [products]
  );

  const operatorFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...team.map((m) => ({ value: m.id, label: m.nome })),
    ],
    [team]
  );

  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      if (!academyId) return;
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
  }, [academyId]);

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

  const openSaleDetail = useCallback(async (saleId) => {
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
  }, [fetchSaleDetail]);

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
          cliente_q: clientSearchDebounced.trim() || undefined,
          limit: 50,
          cursor: append ? cursor : undefined,
        });
        const list = body.movements || [];
        setRows((prev) => (append ? [...prev, ...list] : list));
        if (!append) {
          setTotals(body.totals || EMPTY_TOTALS);
          setByProduct(body.by_product || []);
        }
        setNextCursor(body.pagination?.next_cursor || null);
      } catch (e) {
        setError(friendlyError(e, 'load'));
        if (!append) {
          setRows([]);
          setTotals(EMPTY_TOTALS);
          setByProduct([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [academyId, from, to, productId, movementKind, operatorFilter, clientSearchDebounced]
  );

  useEffect(() => {
    if (panelView === 'movements' || panelView === 'by_product') void loadPage();
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
      setConcError(friendlyError(e, 'load'));
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

  const displayRows = rows;
  const missingBalanceInPeriod = Number(totals.without_balance_snapshot) || 0;
  const totalInPeriod = Number(totals.registros) || 0;

  const drillDownToProduct = useCallback(
    (productRow) => {
      const pid = String(productRow?.product_id || '').trim();
      if (!pid) return;
      setProductId(pid);
      onPanelViewChange?.('movements');
    },
    [onPanelViewChange]
  );

  const movTableScrollRef = useRef(null);
  const shouldVirtualizeMoves = displayRows.length > MOVES_VIRTUAL_THRESHOLD;
  const movesRowVirtualizer = useVirtualizer({
    count: shouldVirtualizeMoves ? displayRows.length : 0,
    getScrollElement: () => movTableScrollRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  const moveColumns = useMemo(
    () => {
      const cols = [
        { key: 'date', label: 'Data', render: (r) => formatMoveDate(r.date) },
        { key: 'product', label: 'Produto / tamanho', render: (r) => productSizeLabel(r) },
        { key: 'tipo', label: 'Tipo', render: (r) => r.movement_kind_label || r.tipo },
        {
          key: 'quantidade',
          label: 'Qtd',
          align: 'right',
          render: (r) => <span className={qtyClassName(r.quantidade)}>{formatSignedQty(r.quantidade)}</span>,
        },
        {
          key: 'balance',
          label: 'Saldo',
          align: 'right',
          render: (r) =>
            r.balance_label ? (
              <span className={balanceSnapshotClass(r)} title="Saldo antes → depois desta movimentação">
                {r.balance_label}
              </span>
            ) : (
              <span className="text-muted text-small" title="Disponível após backfill de histórico">
                —
              </span>
            ),
        },
      ];

      if (hasFinance) {
        cols.push({
          key: 'caixa',
          label: 'Caixa',
          render: (r) =>
            r.movement_kind === 'entry' || r.financial_tx_id ? (
              <ReportsStockCashBadge row={r} />
            ) : (
              '—'
            ),
        });
      }

      cols.push(
        { key: 'cliente_nome', label: 'Cliente' },
        { key: 'operador_nome', label: 'Operador' },
        {
          key: 'notes',
          label: 'Obs.',
          render: (r) => {
            const text = String(r.notes || '').trim();
            if (!text) return '—';
            return (
              <span className="reports-move-notes" title={text}>
                {text.length > 40 ? `${text.slice(0, 37)}…` : text}
              </span>
            );
          },
        },
      );

      if (showValueColumns) {
        cols.push(
          {
            key: 'unit_price',
            label: 'Valor unit.',
            align: 'right',
            render: (r) => (r.unit_price != null ? formatBRL(r.unit_price) : '—'),
          },
          {
            key: 'line_total',
            label: 'Total linha',
            align: 'right',
            render: (r) => (r.line_total != null ? formatBRL(r.line_total) : '—'),
          },
          {
            key: 'payment_status_label',
            label: 'Status pag.',
            render: (r) => r.payment_status_label || '—',
          }
        );
      }

      cols.push(
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
        }
      );

      return cols;
    },
    [openSaleDetail, hasFinance, showValueColumns]
  );

  const byProductColumns = useMemo(
    () => [
      {
        key: 'product_name',
        label: 'Produto',
        render: (r) => (
          <button
            type="button"
            className="reports-product-drill-link"
            title={`Ver movimentações de ${r.product_name}`}
            onClick={() => drillDownToProduct(r)}
          >
            {r.product_name}
          </button>
        ),
      },
      { key: 'movimentos', label: 'Mov.', align: 'right' },
      {
        key: 'entradas_un',
        label: 'Entradas',
        align: 'right',
        render: (r) => <span className="reports-qty reports-qty--in">+{r.entradas_un}</span>,
      },
      {
        key: 'saidas_un',
        label: 'Saídas',
        align: 'right',
        render: (r) => <span className="reports-qty reports-qty--out">−{r.saidas_un}</span>,
      },
      {
        key: 'ajustes_liquido',
        label: 'Ajustes',
        align: 'right',
        render: (r) => <span className={qtyClassName(r.ajustes_liquido)}>{formatSignedQty(r.ajustes_liquido)}</span>,
      },
      {
        key: 'saldo_liquido',
        label: 'Saldo líq.',
        align: 'right',
        render: (r) => (
          <span className={qtyClassName(r.saldo_liquido)}>{formatSignedQty(r.saldo_liquido)}</span>
        ),
      },
    ],
    [drillDownToProduct]
  );

  const movementKindOptions = useMemo(
    () => KIND_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
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
        return bodyRows.map((r) => (
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
          {paddingTop > 0 ? <VirtualTableSpacer colSpan={columns.length} height={paddingTop} /> : null}
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
          {paddingBottom > 0 ? <VirtualTableSpacer colSpan={columns.length} height={paddingBottom} /> : null}
        </>
      );
    },
    [shouldVirtualizeMoves, movesRowVirtualizer]
  );

  const exportCsv = async () => {
    const needsFullFetch =
      Boolean(nextCursor) || (totalInPeriod > 0 && displayRows.length < totalInPeriod);
    setExporting(true);
    try {
      let rowsToExport = displayRows;
      if (needsFullFetch) {
        toast.info('Buscando todas as movimentações do período…');
        rowsToExport = await fetchAllInventoryMovementsInPeriod({
          from,
          to,
          academyId,
          product_id: productId || undefined,
          movement_kind: movementKind || undefined,
          usuario_id: operatorFilter || undefined,
          cliente_q: clientSearchDebounced.trim() || undefined,
        });
      }
      exportInventoryMovementsCsv(rowsToExport, { from, to });
      toast.success(`${rowsToExport.length} movimentação(ões) exportada(s)`);
    } catch (e) {
      toast.error(e, 'export');
    } finally {
      setExporting(false);
    }
  };

  const exportByProductCsv = () => {
    downloadCsv(
      byProduct.map((r) => ({
        produto: r.product_name,
        movimentos: r.movimentos,
        entradas: r.entradas_un,
        saidas: r.saidas_un,
        ajustes_liquido: r.ajustes_liquido,
        saldo_liquido: r.saldo_liquido,
      })),
      `movimentacoes-estoque-por-produto-${from}_${to}.csv`
    );
  };

  const canExportMoves = panelView === 'movements' && !loading && !error && displayRows.length > 0;
  const canExportByProduct =
    panelView === 'by_product' && !loading && !error && byProduct.length > 0;
  const canExportConc = panelView === 'conciliation' && !concLoading && !concError && concRows.length > 0;

  useRegisterReportsExport(
    canExportMoves
      ? {
          disabled: exporting,
          loading: loading || exporting,
          title: exporting ? 'Exportando…' : 'Exportar CSV do período completo',
          onExport: () => void exportCsv(),
        }
      : canExportByProduct
        ? {
            disabled: false,
            loading,
            title: 'Exportar CSV por produto',
            onExport: exportByProductCsv,
          }
        : canExportConc
        ? {
            disabled: false,
            loading: concLoading,
            title: 'Exportar CSV de pagamento vs saída',
            onExport: exportConciliationCsv,
          }
        : null
  );

  const openSaleFromCard = useCallback((saleId) => void openSaleDetail(saleId), [openSaleDetail]);

  return (
    <>
        {panelView === 'conciliation' ? (
          <div id="reports-estoque-conciliation" role="tabpanel" aria-labelledby="reports-estoque-tab-conciliation">
          <>
            <div className="reports-moves-filters reports-moves-filters--chips" role="toolbar" aria-label="Filtro de auditoria">
              <span className="navi-eyebrow">Exibir</span>
              <div className="filter-strip">
                {CONCILIATION_FILTER_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`btn-outline btn-sm${concStatusFilter === o.value ? ' is-active' : ''}`}
                    onClick={() => setConcStatusFilter(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {concLoading ? (
              <ReportsPanelSection>
                <PageSkeleton variant="list" rows={6} />
              </ReportsPanelSection>
            ) : null}
            {concError ? <ErrorBanner message={friendlyError(concError, 'load')} /> : null}
            {!concLoading && !concError ? (
              <ReportsPanelSection
                title="Pagamento vs saída de estoque"
                subtitle="Visão financeira: compara o status na saída com vendas e Caixa hoje."
              >
                {concSummary ? (
                  <div className="reports-moves-footer reports-moves-footer--top" role="status">
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
                ) : isMobile ? (
                  <div className="reports-move-mobile-list">
                    {concRows.map((r) => (
                      <ReportsConciliationMobileCard
                        key={r.move_id}
                        row={r}
                        onOpenSale={openSaleFromCard}
                      />
                    ))}
                  </div>
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
              </ReportsPanelSection>
            ) : null}
          </>
          </div>
        ) : null}

        {(panelView === 'movements' || panelView === 'by_product') ? (
        <div
          id={panelView === 'movements' ? 'reports-estoque-movements' : 'reports-estoque-by_product'}
          role="tabpanel"
          aria-labelledby={panelView === 'movements' ? 'reports-estoque-tab-movements' : 'reports-estoque-tab-by_product'}
        >
        <>
        <div className="reports-moves-filters" role="search">
          <div className="form-group">
            <label className="text-small text-muted" htmlFor="reports-moves-product">Produto</label>
            <SearchableSelect
              id="reports-moves-product"
              value={productId}
              options={productFilterOptions}
              placeholder="Digite para buscar produto…"
              emptyMessage="Nenhum produto encontrado para essa busca."
              onChange={setProductId}
            />
          </div>
          <div className="form-group reports-moves-filters__field reports-moves-filters__field--kind">
            <label className="text-small text-muted" htmlFor="reports-moves-kind">Tipo</label>
            <SearchableSelect
              id="reports-moves-kind"
              value={movementKind}
              options={movementKindOptions}
              placeholder="Todos os tipos"
              emptyMessage="Nenhum tipo encontrado."
              onChange={setMovementKind}
            />
          </div>
          <div className="form-group reports-moves-filters__field reports-moves-filters__field--client">
            <label className="text-small text-muted" htmlFor="reports-moves-client">Cliente</label>
            <input
              id="reports-moves-client"
              className="form-input navi-control--toolbar"
              type="search"
              placeholder="Buscar por nome…"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              aria-busy={clientFilterPending}
            />
            {clientFilterPending ? (
              <span className="text-muted text-small reports-moves-filter-hint" aria-live="polite">
                Buscando…
              </span>
            ) : null}
          </div>
          <div className="form-group reports-moves-filters__field reports-moves-filters__field--operator">
            <label className="text-small text-muted" htmlFor="reports-moves-operator">Operador</label>
            <SearchableSelect
              id="reports-moves-operator"
              value={operatorFilter}
              options={operatorFilterOptions}
              placeholder="Digite para buscar operador…"
              emptyMessage="Nenhum operador encontrado para essa busca."
              onChange={setOperatorFilter}
            />
          </div>
        </div>

        {loading ? (
          <ReportsPanelSection>
            <PageSkeleton variant="list" rows={8} />
          </ReportsPanelSection>
        ) : null}
        {error ? <ErrorBanner message={friendlyError(error, 'load')} /> : null}

        {panelView === 'movements' && !loading && !error ? (
          <ReportsPanelSection
            title={
              <span className="reports-section-title-with-icon">
                <ArrowLeftRight size={18} className="reports-section-title-icon" aria-hidden />
                Movimentações de estoque
              </span>
            }
            subtitle={`${from} — ${to}`}
          >
            <OperationalKpiGrid totals={totals} />

            <div className="reports-moves-toolbar" role="toolbar" aria-label="Opções da tabela">
              <button
                type="button"
                className={`btn-outline btn-sm${showValueColumns ? ' is-active' : ''}`}
                aria-pressed={showValueColumns}
                onClick={() => setShowValueColumns((v) => !v)}
              >
                {showValueColumns ? 'Ocultar valores' : 'Mostrar valores'}
              </button>
              <span className="text-muted text-small">
                {displayRows.length} carregada(s) · {totalInPeriod} no período
                {nextCursor ? ' · use Carregar mais ou exporte o período completo' : ''}
              </span>
            </div>

            {missingBalanceInPeriod > 0 && totalInPeriod > 0 ? (
              <StatusBanner variant="info" className="reports-moves-saldo-hint">
                {missingBalanceInPeriod === totalInPeriod
                  ? 'A coluna Saldo (antes → depois) ainda não está disponível para este período.'
                  : `${missingBalanceInPeriod} de ${totalInPeriod} movimentação(ões) sem saldo gravado — as demais já mostram antes → depois.`}
              </StatusBanner>
            ) : null}

            {!displayRows.length ? (
              <EmptyState
                insideCard
                variant="compact"
                tone="dashed"
                title="Nenhuma movimentação encontrada para os filtros selecionados"
                description="Altere o período, produto, cliente ou tipo de movimento."
                role="status"
              />
            ) : isMobile ? (
              <div className="reports-move-mobile-list">
                {displayRows.map((r) => (
                  <ReportsMoveMobileCard
                    key={r.move_id}
                    row={r}
                    hasFinance={hasFinance}
                    showValueColumns={showValueColumns}
                    onOpenSale={openSaleFromCard}
                  />
                ))}
              </div>
            ) : (
              <ReportDataTable
                columns={moveColumns}
                rows={displayRows}
                emptyMessage="Nenhuma movimentação encontrada para os filtros selecionados"
                scrollRef={movTableScrollRef}
                wrapClassName="reports-mov-table-wrap"
                stickyHeader
                renderBody={renderMoveBody}
              />
            )}

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
          </ReportsPanelSection>
        ) : null}

        {panelView === 'by_product' && !loading && !error ? (
          <ReportsPanelSection
            title={
              <span className="reports-section-title-with-icon">
                <Package size={18} className="reports-section-title-icon" aria-hidden />
                Movimentações por produto
              </span>
            }
            subtitle={`${from} — ${to} · clique no produto para ver o detalhe`}
          >
            <OperationalKpiGrid totals={totals} compactFinance />

            <p className="text-muted text-small reports-moves-by-product-hint">
              {byProduct.length} produtos · totais do período com os filtros atuais
            </p>

            {!byProduct.length ? (
              <EmptyState
                insideCard
                variant="compact"
                tone="dashed"
                title="Nenhum produto com movimentação no período"
                description="Altere o período ou os filtros acima."
                role="status"
              />
            ) : isMobile ? (
              <div className="reports-move-mobile-list">
                {byProduct.map((r) => (
                  <ReportsByProductMobileCard key={r.product_id} row={r} onDrillDown={drillDownToProduct} />
                ))}
              </div>
            ) : (
              <ReportDataTable
                columns={byProductColumns}
                rows={byProduct.map((r) => ({ ...r, id: r.product_id }))}
                emptyMessage="Nenhum produto com movimentação no período"
                wrapClassName="reports-mov-table-wrap"
                stickyHeader
              />
            )}
          </ReportsPanelSection>
        ) : null}
        </>
        </div>
        ) : null}

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

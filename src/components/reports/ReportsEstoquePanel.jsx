import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, AlertTriangle, PauseCircle, RefreshCw, Boxes } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { fetchInventoryReport } from '../../lib/inventoryReportApi.js';
import { downloadCsv } from '../../lib/reportsExport.js';
import { kpiRagProps } from '../../lib/reportKpiGoalsUi.js';
import { useRegisterReportsExport } from '../../hooks/useReportsExportSlot.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import './reports.css';

const ReportsEstoqueMovimentacoesSection = lazy(() => import('./ReportsEstoqueMovimentacoesSection.jsx'));
const movimentacoesFallback = <PageSkeleton variant="list" rows={6} />;

const CURVE_BADGE = {
  A: { label: 'A', className: 'reports-abc-badge reports-abc-badge--a' },
  B: { label: 'B', className: 'reports-abc-badge reports-abc-badge--b' },
  C: { label: 'C', className: 'reports-abc-badge reports-abc-badge--c' },
};

function daysStockTone(row) {
  if (row.units_sold <= 0 || row.days_of_stock == null) return 'stalled';
  const d = Number(row.days_of_stock);
  if (d > 30) return 'ok';
  if (d >= 7) return 'warn';
  return 'critical';
}

const DAYS_CLASS = {
  ok: 'reports-days-stock--ok',
  warn: 'reports-days-stock--warn',
  critical: 'reports-days-stock--critical',
  stalled: 'reports-days-stock--stalled',
};

const ESTOQUE_COLUMNS = [
  { key: 'nome', label: 'Produto' },
  {
    key: 'curve',
    label: 'Curva',
    render: (p) => {
      const badge = CURVE_BADGE[p.curve] || CURVE_BADGE.C;
      return <span className={badge.className}>{badge.label}</span>;
    },
  },
  { key: 'units_sold', label: 'Vendidos', align: 'right' },
  {
    key: 'revenue',
    label: 'Receita',
    align: 'right',
    render: (p) => formatBRL(p.revenue),
  },
  {
    key: 'gross_margin',
    label: 'Margem',
    align: 'right',
    render: (p) => formatBRL(p.gross_margin),
  },
  {
    key: 'days_of_stock_label',
    label: 'Dias de estoque',
    align: 'right',
    render: (p) => {
      const tone = daysStockTone(p);
      return <span className={DAYS_CLASS[tone]}>{p.days_of_stock_label}</span>;
    },
  },
  {
    key: 'last_sale_date',
    label: 'Última venda',
    render: (p) =>
      p.last_sale_date
        ? new Date(`${p.last_sale_date}T12:00:00`).toLocaleDateString('pt-BR')
        : '—',
  },
];

export default function ReportsEstoquePanel({ academyId, from, to, hasInventory, kpiGoals = {} }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [hubSection, setHubSection] = useState('estoque');

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!academyId || !hasInventory) return;
      setLoading(true);
      setError('');
      try {
        const body = await fetchInventoryReport({ from, to, academyId });
        if (active) setData(body);
      } catch (e) {
        if (active) {
          setError(friendlyError(e, 'load'));
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [academyId, from, to, hasInventory]);

  const products = useMemo(() => data?.products || [], [data]);

  const restockRows = useMemo(() => {
    return products
      .filter((p) => {
        const stock = Number(p.current_stock) || 0;
        const min = Number(p.minimum_stock) || 0;
        if (stock <= 0) return true;
        if (min > 0 && stock <= min) return true;
        return false;
      })
      .slice(0, 5)
      .map((p) => {
        const stock = Number(p.current_stock) || 0;
        const min = Number(p.minimum_stock) || 0;
        const zerado = stock <= 0;
        return {
          id: p.product_id,
          nome: p.nome,
          estoque: stock,
          minimo: min > 0 ? min : '—',
          status: zerado ? 'Zerado' : 'Crítico',
          statusClass: zerado ? 'reports-stock-pill--zero' : 'reports-stock-pill--critical',
        };
      });
  }, [products]);

  const filtered = useMemo(() => {
    const list = products.slice();
    if (filter === 'a') return list.filter((p) => p.curve === 'A' && p.units_sold > 0);
    if (filter === 'stalled') return list.filter((p) => p.units_sold <= 0);
    if (filter === 'critical') {
      return list.filter((p) => {
        const stock = Number(p.current_stock) || 0;
        const min = Number(p.minimum_stock) || 0;
        if (stock <= 0) return true;
        if (min > 0 && stock <= min) return true;
        const tone = daysStockTone(p);
        return tone === 'critical' || tone === 'stalled';
      });
    }
    return list;
  }, [products, filter]);

  const summary = data?.summary || { curve_a: 0, curve_b: 0, curve_c: 0, stalled: 0 };

  const estoqueKpis = useMemo(() => {
    const criticalCount = products.filter((p) => {
      const stock = Number(p.current_stock) || 0;
      const min = Number(p.minimum_stock) || 0;
      if (stock <= 0) return true;
      if (min > 0 && stock <= min) return true;
      return false;
    }).length;

    const stockValue = products.reduce((sum, p) => {
      const qty = Number(p.current_stock) || 0;
      if (qty <= 0) return sum;
      let unit = Number(p.sale_price) || 0;
      if (p._variants?.length) {
        const costs = p._variants.map((v) => Number(v.average_cost) || 0).filter((c) => c > 0);
        if (costs.length) unit = costs.reduce((a, b) => a + b, 0) / costs.length;
      }
      if (!unit && p.units_sold > 0 && p.cmv) unit = p.cmv / p.units_sold;
      return sum + qty * unit;
    }, 0);

    const withDays = products.filter((p) => p.units_sold > 0 && p.days_of_stock != null);
    const giroMedio = withDays.length
      ? Math.round(withDays.reduce((s, p) => s + Number(p.days_of_stock), 0) / withDays.length)
      : null;

    return {
      stockValue,
      criticalCount,
      stalledCount: summary.stalled ?? 0,
      giroMedio,
    };
  }, [products, summary.stalled]);

  const exportCsv = () => {
    const rows = filtered.map((p) => ({
      produto: p.nome,
      curva: p.curve,
      vendidos: p.units_sold,
      receita: p.revenue,
      margem: p.gross_margin,
      dias_estoque: p.days_of_stock_label,
      ultima_venda: p.last_sale_date || '',
    }));
    downloadCsv(rows, `relatorio-estoque-${from}_${to}.csv`);
  };

  if (!hasInventory) {
    return (
      <ReportsPanelShell>
        <ReportsPanelSection className="reports-empty">
          <EmptyState
            insideCard
            variant="compact"
            tone="solid"
            title="Módulo de estoque desativado"
            description="Ative estoque nas configurações da academia para ver giro e curva ABC aqui."
            role="status"
            primaryAction={{
              label: 'Configurar estoque',
              onClick: () => navigate('/loja?tab=estoque'),
            }}
          />
        </ReportsPanelSection>
      </ReportsPanelShell>
    );
  }

  useRegisterReportsExport(
    hasInventory && hubSection === 'estoque' && !loading && !error && data && filtered.length > 0
      ? {
          disabled: false,
          loading,
          title: 'Exportar CSV de estoque',
          onExport: exportCsv,
        }
      : null
  );

  return (
    <ReportsPanelShell>
      <div className="reports-moves-view-tabs" role="tablist" aria-label="Seções do estoque">
        <button
          type="button"
          className={hubSection === 'estoque' ? 'btn-secondary btn-sm' : 'btn-outline btn-sm'}
          onClick={() => setHubSection('estoque')}
        >
          Estoque
        </button>
        <button
          type="button"
          className={hubSection === 'movimentacoes' ? 'btn-secondary btn-sm' : 'btn-outline btn-sm'}
          onClick={() => setHubSection('movimentacoes')}
        >
          Movimentações
        </button>
      </div>

      {hubSection === 'movimentacoes' ? (
        <Suspense fallback={movimentacoesFallback}>
          <ReportsEstoqueMovimentacoesSection academyId={academyId} from={from} to={to} />
        </Suspense>
      ) : null}

      {hubSection === 'estoque' && loading ? (
        <ReportsPanelSection aria-busy="true">
          <div className="reports-kpi-grid">
            {[1, 2, 3, 4].map((i) => (
              <ReportKpiCardSkeleton key={i} />
            ))}
          </div>
        </ReportsPanelSection>
      ) : null}
      {hubSection === 'estoque' && error ? <ErrorBanner message={friendlyError(error)} /> : null}
      {hubSection === 'estoque' && !loading && !error && data ? (
        <>
          <ReportsPanelSection title="Estoque" subtitle={`${from} — ${to}`}>
            <div className="reports-kpi-grid">
              <ReportKpiCard
                label="Valor em estoque"
                value={formatBRL(estoqueKpis.stockValue)}
                icon={<Boxes size={20} strokeWidth={2.25} />}
              />
              <ReportKpiCard
                label="Itens críticos"
                value={estoqueKpis.criticalCount}
                icon={<AlertTriangle size={20} strokeWidth={2.25} />}
                {...kpiRagProps('criticalItems', Number(estoqueKpis.criticalCount), kpiGoals)}
              />
              <ReportKpiCard
                label="Itens parados"
                value={estoqueKpis.stalledCount}
                icon={<PauseCircle size={20} strokeWidth={2.25} />}
                {...kpiRagProps('stalledItems', Number(estoqueKpis.stalledCount), kpiGoals)}
              />
              <ReportKpiCard
                label="Giro médio"
                value={estoqueKpis.giroMedio != null ? `${estoqueKpis.giroMedio} dias` : '—'}
                icon={<RefreshCw size={20} strokeWidth={2.25} />}
              />
            </div>
          </ReportsPanelSection>

          {restockRows.length > 0 ? (
            <ReportsPanelSection title="Atenção — Reposição necessária">
              <ReportDataTable
                columns={[
                  { key: 'nome', label: 'Produto' },
                  { key: 'estoque', label: 'Estoque atual', align: 'right' },
                  { key: 'minimo', label: 'Mínimo configurado', align: 'right' },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (row) => (
                      <span className={`reports-stock-pill ${row.statusClass}`}>{row.status}</span>
                    ),
                  },
                ]}
                rows={restockRows}
                footer={
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={() => setFilter('critical')}
                  >
                    Ver todos críticos →
                  </button>
                }
              />
            </ReportsPanelSection>
          ) : null}

          <ReportsPanelSection
            title={
              <span className="reports-section-title-with-icon">
                <Package size={18} className="reports-section-title-icon" aria-hidden />
                Giro e curva ABC
              </span>
            }
            subtitle={`${from} — ${to}`}
          >
            <div className="reports-estoque-filters" role="toolbar" aria-label="Filtros">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'a', label: 'Só A' },
                { id: 'stalled', label: 'Só parados' },
                { id: 'critical', label: 'Críticos' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`btn-outline btn-sm${filter === f.id ? ' is-active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                insideCard
                variant="compact"
                title="Nenhum produto neste filtro"
                description="Altere o filtro ou o período."
                role="status"
              />
            ) : (
              <ReportDataTable
                columns={ESTOQUE_COLUMNS}
                rows={filtered.map((p) => ({ ...p, id: p.product_id }))}
                emptyMessage="Nenhum produto neste filtro"
                wrapClassName="reports-estoque-table-wrap"
                stickyHeader
              />
            )}
          </ReportsPanelSection>
        </>
      ) : null}
    </ReportsPanelShell>
  );
}

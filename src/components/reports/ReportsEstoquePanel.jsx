import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Package } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { fetchInventoryReport } from '../../lib/inventoryReportApi.js';
import { downloadCsv } from '../../lib/reportsExport.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import ReportKpiCard from './shared/ReportKpiCard.jsx';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import './reports.css';

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

export default function ReportsEstoquePanel({ academyId, from, to, hasInventory }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

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

  const headingAction = (
    <button type="button" className="btn-outline btn-sm" onClick={exportCsv} disabled={!filtered.length}>
      <Download size={14} aria-hidden />
      Exportar CSV
    </button>
  );

  return (
    <ReportsPanelShell>
      {loading ? (
        <ReportsPanelSection>
          <PageSkeleton variant="list" rows={6} />
        </ReportsPanelSection>
      ) : null}
      {error ? <ErrorBanner message={friendlyError(error)} /> : null}
      {!loading && !error && data ? (
        <>
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
              <>
                <Package size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
                Giro e curva ABC
              </>
            }
            subtitle={`${from} — ${to}`}
            action={headingAction}
          >
            <div className="reports-abc-summary" role="group" aria-label="Resumo curva ABC">
              <ReportKpiCard label="Produtos A" value={summary.curve_a} />
              <ReportKpiCard label="Produtos B" value={summary.curve_b} />
              <ReportKpiCard label="Produtos C" value={summary.curve_c} />
              <ReportKpiCard label="Parados (0 vendas)" value={summary.stalled} highlight="warning" />
            </div>

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

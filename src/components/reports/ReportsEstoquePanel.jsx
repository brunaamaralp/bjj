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
import { FINANCE_PAGE_CSS } from '../finance/financePageStyles.js';

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
          setError(String(e?.message || e));
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

  const filtered = useMemo(() => {
    const list = products.slice();
    if (filter === 'a') return list.filter((p) => p.curve === 'A' && p.units_sold > 0);
    if (filter === 'stalled') return list.filter((p) => p.units_sold <= 0);
    if (filter === 'critical') {
      return list.filter((p) => {
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
      <div className="reports-empty card mt-4">
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
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FINANCE_PAGE_CSS }} />
      <style>{`
        .reports-abc-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .reports-abc-summary__card { padding: 12px 14px; border-radius: 10px; background: var(--surface-2, #f4f4f8); border: 1px solid var(--border, #e5e5ef); }
        .reports-abc-summary__value { font-size: 1.35rem; font-weight: 700; line-height: 1.2; }
        .reports-abc-summary__label { font-size: 0.75rem; color: var(--text-muted, #666); margin-top: 2px; }
        .reports-abc-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 1.5rem; padding: 2px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
        .reports-abc-badge--a { background: #dcfce7; color: #166534; }
        .reports-abc-badge--b { background: #fef9c3; color: #854d0e; }
        .reports-abc-badge--c { background: #f1f5f9; color: #475569; }
        .reports-days-stock--ok { color: #166534; font-weight: 600; }
        .reports-days-stock--warn { color: #854d0e; font-weight: 600; }
        .reports-days-stock--critical { color: #b91c1c; font-weight: 600; }
        .reports-days-stock--stalled { color: #b91c1c; font-weight: 600; }
        .reports-estoque-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .reports-estoque-filters .btn-outline.is-active { border-color: var(--accent, #4f46e5); color: var(--accent, #4f46e5); }
      `}</style>
      <div className="mt-4">
        {loading ? (
          <div className="card" style={{ padding: 16 }}>
            <PageSkeleton variant="list" rows={6} />
          </div>
        ) : null}
        {error ? (
          <ErrorBanner message={friendlyError(error)} className="mt-3" />
        ) : null}
        {!loading && !error && data ? (
          <div className="card" style={{ padding: 16 }}>
            <div className="flex justify-between items-center gap-2 mb-3">
              <h3 className="navi-section-heading" style={{ margin: 0 }}>
                <Package size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
                Giro e curva ABC
              </h3>
              <button type="button" className="btn-outline btn-sm" onClick={exportCsv} disabled={!filtered.length}>
                <Download size={14} aria-hidden />
                Exportar CSV
              </button>
            </div>

            <div className="reports-abc-summary" role="group" aria-label="Resumo curva ABC">
              <div className="reports-abc-summary__card">
                <div className="reports-abc-summary__value">{summary.curve_a}</div>
                <div className="reports-abc-summary__label">Produtos A</div>
              </div>
              <div className="reports-abc-summary__card">
                <div className="reports-abc-summary__value">{summary.curve_b}</div>
                <div className="reports-abc-summary__label">Produtos B</div>
              </div>
              <div className="reports-abc-summary__card">
                <div className="reports-abc-summary__value">{summary.curve_c}</div>
                <div className="reports-abc-summary__label">Produtos C</div>
              </div>
              <div className="reports-abc-summary__card">
                <div className="reports-abc-summary__value">{summary.stalled}</div>
                <div className="reports-abc-summary__label">Parados (0 vendas)</div>
              </div>
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
              <div className="navi-desktop-table-wrap">
                <table className="navi-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Curva</th>
                      <th className="text-right">Vendidos</th>
                      <th className="text-right">Receita</th>
                      <th className="text-right">Margem</th>
                      <th className="text-right">Dias de estoque</th>
                      <th>Última venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const badge = CURVE_BADGE[p.curve] || CURVE_BADGE.C;
                      const tone = daysStockTone(p);
                      return (
                        <tr key={p.product_id}>
                          <td>{p.nome}</td>
                          <td>
                            <span className={badge.className}>{badge.label}</span>
                          </td>
                          <td className="text-right">{p.units_sold}</td>
                          <td className="text-right">{formatBRL(p.revenue)}</td>
                          <td className="text-right">{formatBRL(p.gross_margin)}</td>
                          <td className={`text-right ${DAYS_CLASS[tone]}`}>{p.days_of_stock_label}</td>
                          <td className="text-small text-muted">
                            {p.last_sale_date
                              ? new Date(`${p.last_sale_date}T12:00:00`).toLocaleDateString('pt-BR')
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

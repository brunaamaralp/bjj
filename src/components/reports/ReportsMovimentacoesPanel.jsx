import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, ArrowLeftRight } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { fetchInventoryMovements } from '../../lib/inventoryMovementsApi.js';
import { createSessionJwt } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { downloadCsv } from '../../lib/reportsExport.js';
import { formatSaleIdShort } from '../../lib/salesHistory';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import { FINANCE_PAGE_CSS } from '../finance/financePageStyles.js';

const KIND_OPTIONS = [
  { value: '', label: 'Todos os tipos' },
  { value: 'sale', label: 'Venda' },
  { value: 'return', label: 'Devolução' },
  { value: 'adjustment', label: 'Ajuste' },
  { value: 'entry', label: 'Entrada' },
  { value: 'rental', label: 'Aluguel' },
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
  const [summary, setSummary] = useState({ units_out: 0, revenue_total: 0, count: 0 });
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
        const list = (data.products || data.variants || []).map((p) => ({
          id: p.id,
          nome: p.nome || p.name || p.display_label || p.id,
        }));
        setProducts(list);
      } catch {
        if (active) setProducts([]);
      }
    };
    void loadProducts();
    return () => {
      active = false;
    };
  }, [academyId, hasInventory]);

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
          limit: 100,
          cursor: append ? cursor : undefined,
        });
        const list = body.movements || [];
        setRows((prev) => (append ? [...prev, ...list] : list));
        if (!append) {
          setSummary(body.summary || { units_out: 0, revenue_total: 0, count: 0 });
        }
        setNextCursor(body.pagination?.next_cursor || null);
      } catch (e) {
        setError(String(e?.message || e));
        if (!append) {
          setRows([]);
          setSummary({ units_out: 0, revenue_total: 0, count: 0 });
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [academyId, from, to, productId, movementKind]
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const filtered = useMemo(() => {
    const q = String(clientSearch || '').trim().toLowerCase();
    const op = String(operatorFilter || '').trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (q && !String(r.cliente_nome || '').toLowerCase().includes(q)) return false;
      if (op && !String(r.operador_nome || '').toLowerCase().includes(op)) return false;
      return true;
    });
  }, [rows, clientSearch, operatorFilter]);

  const footerTotals = useMemo(() => {
    let units = 0;
    let revenue = 0;
    for (const r of filtered) {
      if (r.movement_kind === 'sale') {
        units += Math.abs(Number(r.quantidade) || 0);
        if (Number.isFinite(r.line_total)) revenue += r.line_total;
      }
    }
    return { units, revenue };
  }, [filtered]);

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
      <style dangerouslySetInnerHTML={{ __html: FINANCE_PAGE_CSS }} />
      <style>{`
        .reports-moves-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; align-items: flex-end; }
        .reports-moves-filters .form-group { margin: 0; min-width: 140px; }
        .reports-moves-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .reports-moves-table th, .reports-moves-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #e5e5ef); }
        .reports-moves-table th { font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted, #666); }
        .reports-moves-footer { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border, #e5e5ef); font-size: 0.9rem; }
        .reports-moves-sale-chip { display: inline-flex; padding: 2px 8px; border-radius: 6px; background: var(--surface-2, #f0f0f8); font-size: 0.78rem; font-weight: 600; text-decoration: none; color: var(--accent, #4f46e5); }
        .reports-moves-sale-chip:hover { text-decoration: underline; }
      `}</style>
      <div className="mt-4">
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
          <div className="form-group" style={{ minWidth: 160 }}>
            <label className="text-small text-muted">Operador</label>
            <input
              className="form-input"
              type="search"
              placeholder="Nome do operador…"
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
            />
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
            <div className="flex justify-between items-center gap-2 mb-3">
              <h3 className="navi-section-heading" style={{ margin: 0 }}>
                <ArrowLeftRight size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
                Movimentações de estoque
              </h3>
              <button type="button" className="btn-outline btn-sm" onClick={exportCsv} disabled={!filtered.length}>
                <Download size={14} aria-hidden />
                Exportar CSV
              </button>
            </div>

            {!filtered.length ? (
              <EmptyState
                insideCard
                variant="compact"
                tone="dashed"
                title="Nenhuma movimentação no período"
                description="Ajuste os filtros ou registre vendas e movimentos de estoque."
                role="status"
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="reports-moves-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Produto / tamanho</th>
                      <th>Tipo</th>
                      <th>Cliente</th>
                      <th>Operador</th>
                      <th>Qtd</th>
                      <th>Valor unit.</th>
                      <th>Total linha</th>
                      <th>Status pag.</th>
                      <th>Venda #</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.move_id}>
                        <td>{formatMoveDate(r.date)}</td>
                        <td>{productSizeLabel(r)}</td>
                        <td>{r.movement_kind_label || r.tipo}</td>
                        <td>{r.cliente_nome}</td>
                        <td>{r.operador_nome}</td>
                        <td>{r.quantidade}</td>
                        <td>{r.unit_price != null ? formatBRL(r.unit_price) : '—'}</td>
                        <td>{r.line_total != null ? formatBRL(r.line_total) : '—'}</td>
                        <td>{r.payment_status_label || '—'}</td>
                        <td>
                          {r.sale_id ? (
                            <Link
                              to="/loja?tab=history"
                              className="reports-moves-sale-chip"
                              title={`Ver venda ${r.sale_id}`}
                            >
                              #{formatSaleIdShort(r.sale_id)}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="reports-moves-footer" role="status">
              <span>
                <strong>Unidades saídas (vendas):</strong> {footerTotals.units}
              </span>
              <span>
                <strong>Faturado (linhas de venda):</strong> {formatBRL(footerTotals.revenue)}
              </span>
              <span className="text-muted text-small">
                {filtered.length} registro(s) exibido(s)
                {summary.count !== filtered.length ? ` · ${summary.count} no servidor` : ''}
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
      </div>
    </>
  );
}

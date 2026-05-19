import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackagePlus, ClipboardCheck, AlertTriangle, CheckCircle2, Settings2, Pencil, Trash2 } from 'lucide-react';
import { STOCK_STATUS_LABELS } from '../../lib/stockInventory';
import { formatBRL } from '../../lib/moneyBr';
import EmptyState from '../shared/EmptyState.jsx';
import Hint from '../shared/Hint.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';

const STATUS_STYLES = {
  ok: { color: 'var(--success)', Icon: CheckCircle2, label: STOCK_STATUS_LABELS.ok },
  attention: { color: 'var(--warning, #c9a227)', Icon: AlertTriangle, label: STOCK_STATUS_LABELS.attention },
  critical: { color: 'var(--status-danger-text, var(--danger))', Icon: AlertTriangle, label: STOCK_STATUS_LABELS.critical },
};

export default function InventoryBalanceView({
  items,
  loading,
  onRefresh,
  onRegisterEntry,
  onCheckItem,
  onConfigureItem,
  onDeleteItem,
  deleteBusyId = null,
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [forSaleOnly, setForSaleOnly] = useState(false);
  const [showPrices, setShowPrices] = useState(false);

  const categories = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      const c = String(it.categoria || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && String(it.categoria || '') !== categoryFilter) return false;
      if (forSaleOnly && it.is_for_sale === false) return false;
      return true;
    });
  }, [items, statusFilter, categoryFilter, forSaleOnly]);

  return (
    <section className="mt-4 animate-in">
      <div className="flex justify-between items-center gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
        <h2 className="navi-section-heading" style={{ margin: 0 }}>Saldo atual</h2>
        <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
          <label className="inventory-show-prices-toggle" title="Exibir colunas de preço de venda e custo">
            <span className="inventory-show-prices-toggle__track" aria-hidden>
              <span
                className={`inventory-show-prices-toggle__thumb${showPrices ? ' inventory-show-prices-toggle__thumb--on' : ''}`}
              />
            </span>
            <input
              type="checkbox"
              className="inventory-show-prices-toggle__input"
              checked={showPrices}
              onChange={(e) => setShowPrices(e.target.checked)}
            />
            <span className="inventory-show-prices-toggle__label">Mostrar preços</span>
          </label>
          <button type="button" className="btn-outline btn-sm" onClick={() => void onRefresh()} disabled={loading}>
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="text-xs">Status</label>
            <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="ok">OK</option>
              <option value="attention">Atenção</option>
              <option value="critical">Crítico</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
            <label className="text-xs">Categoria</label>
            <select className="form-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
            <label className="text-xs">&nbsp;</label>
            <label className="form-input flex items-center gap-2" style={{ cursor: 'pointer', minHeight: 38 }}>
              <input type="checkbox" checked={forSaleOnly} onChange={(e) => setForSaleOnly(e.target.checked)} />
              Somente produtos para venda
            </label>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <PageSkeleton variant="table" rows={6} columns={showPrices ? 9 : 7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="compact"
            tone="dashed"
            title={items.length === 0 ? 'Nenhum item cadastrado' : 'Nenhum item neste filtro'}
            description={
              items.length === 0
                ? 'Cadastre produtos em Produtos ou ajuste os filtros.'
                : 'Ajuste os filtros.'
            }
            role="status"
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="navi-table" style={{ width: '100%', minWidth: showPrices ? 800 : 640 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Item</th>
                  <th>Categoria</th>
                  <th>Unidade</th>
                  {showPrices ? <th>Preço venda</th> : null}
                  {showPrices ? <th>Preço custo</th> : null}
                  <th>Saldo</th>
                  <th>Mín.</th>
                  <th>
                    <span className="inventory-th-with-hint">
                      Status
                      <Hint
                        text="OK: acima do mínimo. Atenção: no mínimo. Crítico: abaixo do estoque mínimo."
                        position="top"
                      />
                    </span>
                  </th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const st = STATUS_STYLES[it.status] || STATUS_STYLES.ok;
                  const StIcon = st.Icon;
                  const label = it.Tamanho ? `${it.nome} · ${it.Tamanho}` : it.nome;
                  const rowClass =
                    it.status === 'critical'
                      ? 'inventory-row--critical'
                      : it.status === 'attention'
                        ? 'inventory-row--attention'
                        : '';
                  return (
                    <tr key={it.id} className={rowClass}>
                      <td style={{ fontWeight: 600 }}>{label}</td>
                      <td className="text-small text-muted">{it.categoria || '—'}</td>
                      <td className="text-small">{it.unit}</td>
                      {showPrices ? (
                        <td className="text-small">{it.sale_price != null ? formatBRL(it.sale_price) : '—'}</td>
                      ) : null}
                      {showPrices ? (
                        <td className="text-small">{it.cost_price != null ? formatBRL(it.cost_price) : '—'}</td>
                      ) : null}
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{it.current_quantity}</td>
                      <td className="text-small text-muted">{it.minimum_level > 0 ? it.minimum_level : '—'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: st.color, fontSize: 12, fontWeight: 600 }}>
                          <StIcon size={14} aria-hidden />
                          {st.label}
                        </span>
                      </td>
                      <td className="inventory-table__actions">
                        <div className="inventory-table__actions-inner">
                          <Link
                            to={`/produtos?edit=${it.id}`}
                            className="btn-outline btn-sm"
                            title="Editar produto"
                            aria-label="Editar produto"
                          >
                            <Pencil size={14} aria-hidden />
                          </Link>
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() => onRegisterEntry(it)}
                            title="Registrar entrada"
                            aria-label="Registrar entrada"
                          >
                            <PackagePlus size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() => void onCheckItem(it)}
                            title="Conferir estoque"
                            aria-label="Conferir estoque"
                          >
                            <ClipboardCheck size={14} aria-hidden />
                          </button>
                          {onConfigureItem ? (
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              onClick={() => onConfigureItem(it)}
                              title="Configurar mínimo e unidade"
                              aria-label="Configurar mínimo e unidade"
                            >
                              <Settings2 size={14} aria-hidden />
                            </button>
                          ) : null}
                          {onDeleteItem ? (
                            <button
                              type="button"
                              className="btn-outline btn-sm inventory-delete-btn"
                              title="Excluir item"
                              aria-label="Excluir item"
                              onClick={() => onDeleteItem(it)}
                              disabled={deleteBusyId === it.id}
                            >
                              <Trash2 size={14} aria-hidden style={{ color: 'var(--status-danger-text, var(--danger))' }} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <style>{`
        .inventory-show-prices-toggle {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid var(--border-mid);
          background: var(--surface-1, #fff);
        }
        .inventory-show-prices-toggle__input {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
          pointer-events: none;
        }
        .inventory-show-prices-toggle__track {
          position: relative;
          width: 40px;
          height: 22px;
          border-radius: 999px;
          background: var(--border-mid);
          flex-shrink: 0;
        }
        .inventory-show-prices-toggle__thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform 0.15s ease;
        }
        .inventory-show-prices-toggle__thumb--on {
          transform: translateX(18px);
        }
        .inventory-show-prices-toggle:has(.inventory-show-prices-toggle__input:checked) .inventory-show-prices-toggle__track {
          background: var(--v500);
        }
        .inventory-show-prices-toggle__label {
          font-size: 13px;
          font-weight: 600;
          color: var(--mid);
        }
        .inventory-row--critical {
          border-left: 3px solid var(--status-danger-text, var(--danger));
        }
        .inventory-row--attention {
          border-left: 3px solid var(--warning, #c9a227);
        }
        .inventory-table__actions {
          text-align: right;
          white-space: nowrap;
          width: 1%;
        }
        .inventory-table__actions-inner {
          display: inline-flex;
          gap: 4px;
          justify-content: flex-end;
          flex-wrap: nowrap;
        }
        .inventory-delete-btn { flex-shrink: 0; }
      `}</style>
    </section>
  );
}

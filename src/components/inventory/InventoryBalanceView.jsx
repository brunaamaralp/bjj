import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PackagePlus, ClipboardCheck, AlertTriangle, CheckCircle2, Settings2, Trash2 } from 'lucide-react';
import { STOCK_STATUS_LABELS } from '../../lib/stockInventory';
import { formatBRL } from '../../lib/moneyBr';
import EmptyState from '../shared/EmptyState.jsx';
import Hint from '../shared/Hint.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';

function itemVariationSuffix(it) {
  const tam = String(it.Tamanho || '').trim();
  if (tam) return `· ${tam}`;
  return '';
}

function isDefaultUnit(unit) {
  const u = String(unit || '').trim().toLowerCase();
  return !u || u === 'unidade';
}

function StockStatusBadge({ status, onCriticalClick, item }) {
  const label = STOCK_STATUS_LABELS[status] || status;
  const Icon = status === 'ok' ? CheckCircle2 : AlertTriangle;

  if (status === 'critical' && onCriticalClick && item) {
    return (
      <button
        type="button"
        className="inventory-status-badge inventory-status-badge--critical inventory-status-badge--clickable"
        title="Registrar entrada"
        onClick={(e) => {
          e.stopPropagation();
          onCriticalClick(item);
        }}
      >
        <Icon size={14} aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <span className={`inventory-status-badge inventory-status-badge--${status}`}>
      <Icon size={14} aria-hidden />
      {label}
    </span>
  );
}

export default function InventoryBalanceView({
  items,
  loading,
  highlightItemId = '',
  onRefresh,
  onRegisterEntry,
  onRequestCheck,
  onConfigureItem,
  onDeleteItem,
  deleteBusyId = null,
}) {
  const highlightRef = useRef(null);
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

  const showUnitColumn = useMemo(
    () => filtered.some((it) => !isDefaultUnit(it.unit)),
    [filtered]
  );

  useEffect(() => {
    if (!highlightItemId || loading) return;
    const row = highlightRef.current;
    if (!row) return;
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightItemId, loading, filtered.length]);

  return (
    <section className="mt-4 animate-in">
      <div className="flex justify-between items-center gap-2 mb-2 inventory-balance-toolbar">
        <h2 className="navi-section-heading" style={{ margin: 0 }}>Saldo atual</h2>
        <div className="flex gap-2 items-center inventory-balance-toolbar__controls">
          <label className="navi-inline-toggle" title="Exibir colunas de preço de venda e custo">
            <span className="navi-inline-toggle__track" aria-hidden>
              <span
                className={`navi-inline-toggle__thumb${showPrices ? ' navi-inline-toggle__thumb--on' : ''}`}
              />
            </span>
            <input
              type="checkbox"
              className="navi-inline-toggle__input"
              checked={showPrices}
              onChange={(e) => setShowPrices(e.target.checked)}
            />
            <span className="navi-inline-toggle__label">Mostrar preços</span>
          </label>
          <button type="button" className="btn-outline btn-sm" onClick={() => void onRefresh()} disabled={loading}>
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="card inventory-filters-card">
        <div className="inventory-filters-row">
          <div className="form-group inventory-filter-field">
            <label className="text-xs">Status</label>
            <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="ok">OK</option>
              <option value="attention">Atenção</option>
              <option value="critical">Crítico</option>
            </select>
          </div>
          <div className="form-group inventory-filter-field">
            <label className="text-xs">Categoria</label>
            <select className="form-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <label className="navi-inline-toggle inventory-filter-toggle" title="Somente produtos para venda">
            <span className="navi-inline-toggle__track" aria-hidden>
              <span
                className={`navi-inline-toggle__thumb${forSaleOnly ? ' navi-inline-toggle__thumb--on' : ''}`}
              />
            </span>
            <input
              type="checkbox"
              className="navi-inline-toggle__input"
              checked={forSaleOnly}
              onChange={(e) => setForSaleOnly(e.target.checked)}
            />
            <span className="navi-inline-toggle__label">Somente produtos para venda</span>
          </label>
        </div>

        {loading && items.length === 0 ? (
          <PageSkeleton variant="table" rows={6} columns={showPrices ? 8 : 6} />
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
          <>
            <div className="navi-desktop-table-wrap inventory-desktop-table-wrap">
              <table className="navi-table inventory-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Categoria</th>
                    {showUnitColumn ? <th>Unidade</th> : null}
                    {showPrices ? <th>Preço venda</th> : null}
                    {showPrices ? <th>Preço custo</th> : null}
                    <th>Saldo</th>
                    <th>
                      <span className="inventory-th-with-hint">
                        Mín. ideal
                        <Hint
                          text="Quantidade mínima recomendada em estoque. Abaixo disso o status fica Crítico."
                          position="top"
                        />
                      </span>
                    </th>
                    <th>
                      <span className="inventory-th-with-hint">
                        Status
                        <Hint
                          text="OK: acima do mínimo. Atenção: no mínimo. Crítico: abaixo do estoque mínimo — clique para registrar entrada."
                          position="top"
                        />
                      </span>
                    </th>
                    <th className="inventory-table__actions-head">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const variation = itemVariationSuffix(it);
                    const qty = Number(it.current_quantity) || 0;
                    const rowClass = [
                      it.status === 'critical' ? 'inventory-row--critical' : '',
                      it.status === 'attention' ? 'inventory-row--attention' : '',
                      qty === 0 ? 'inventory-row--zero' : '',
                      highlightItemId === it.id ? 'inventory-row--highlight' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <tr
                        key={it.id}
                        ref={highlightItemId === it.id ? highlightRef : undefined}
                        className={rowClass || undefined}
                        data-item-id={it.id}
                      >
                        <td>
                          <div className="inventory-table__name-row">
                            <span className="inventory-table__name">{it.nome}</span>
                            {variation ? (
                              <span className="inventory-table__variation">{variation}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="text-small text-muted">{it.categoria || '—'}</td>
                        {showUnitColumn ? (
                          <td className="text-small text-muted">
                            {isDefaultUnit(it.unit) ? '—' : it.unit}
                          </td>
                        ) : null}
                        {showPrices ? (
                          <td className="text-small inventory-table__price">
                            {it.sale_price != null ? formatBRL(it.sale_price) : '—'}
                          </td>
                        ) : null}
                        {showPrices ? (
                          <td className="text-small inventory-table__price">
                            {it.cost_price != null ? formatBRL(it.cost_price) : '—'}
                          </td>
                        ) : null}
                        <td className="inventory-table__qty">{qty}</td>
                        <td className="text-small text-muted inventory-table__min">
                          {it.minimum_level > 0 ? it.minimum_level : '—'}
                        </td>
                        <td>
                          <StockStatusBadge
                            status={it.status}
                            item={it}
                            onCriticalClick={onRegisterEntry}
                          />
                        </td>
                        <td className="inventory-table__actions">
                          <div className="inventory-table__actions-inner">
                            <button
                              type="button"
                              className="inventory-icon-btn"
                              onClick={() => onRegisterEntry(it)}
                              title="Registrar entrada"
                              aria-label="Registrar entrada"
                            >
                              <PackagePlus size={16} aria-hidden />
                            </button>
                            {onConfigureItem ? (
                              <button
                                type="button"
                                className="inventory-icon-btn"
                                onClick={() => onConfigureItem(it)}
                                title="Ajustar mínimo e unidade"
                                aria-label="Ajustar mínimo e unidade"
                              >
                                <Settings2 size={16} aria-hidden />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="inventory-icon-btn"
                              onClick={() => onRequestCheck(it)}
                              title="Registrar conferência"
                              aria-label="Registrar conferência"
                            >
                              <ClipboardCheck size={16} aria-hidden />
                            </button>
                            {onDeleteItem ? (
                              <button
                                type="button"
                                className="inventory-icon-btn inventory-icon-btn--danger"
                                title="Excluir item"
                                aria-label="Excluir item"
                                onClick={() => onDeleteItem(it)}
                                disabled={deleteBusyId === it.id}
                              >
                                <Trash2 size={16} aria-hidden />
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
            <div className="navi-mobile-list inventory-mobile-list" aria-label="Lista de estoque">
              {filtered.map((it) => {
                const variation = itemVariationSuffix(it);
                const qty = Number(it.current_quantity) || 0;
                const rowClass = [
                  'navi-mobile-card',
                  'inventory-mobile-card',
                  it.status === 'critical' ? 'inventory-mobile-card--critical' : '',
                  it.status === 'attention' ? 'inventory-mobile-card--attention' : '',
                  qty === 0 ? 'inventory-mobile-card--zero' : '',
                  highlightItemId === it.id ? 'inventory-row--highlight' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const unitSuffix = !isDefaultUnit(it.unit) ? ` · ${it.unit}` : '';
                return (
                  <article
                    key={it.id}
                    ref={highlightItemId === it.id ? highlightRef : undefined}
                    className={rowClass}
                    data-item-id={it.id}
                  >
                    <div className="inventory-mobile-card__body">
                      <div className="inventory-mobile-card__title-row">
                        <span className="inventory-mobile-card__title">{it.nome}</span>
                        {variation ? (
                          <span className="inventory-mobile-card__variation">{variation}</span>
                        ) : null}
                      </div>
                      <div className="inventory-mobile-card__meta text-small text-muted">
                        {it.categoria || '—'}
                        {unitSuffix}
                      </div>
                      <div className="inventory-mobile-card__stats text-small">
                        <span>
                          Saldo: <strong>{qty}</strong>
                        </span>
                        <span>
                          Mín. ideal: <strong>{it.minimum_level > 0 ? it.minimum_level : '—'}</strong>
                        </span>
                        <StockStatusBadge
                          status={it.status}
                          item={it}
                          onCriticalClick={onRegisterEntry}
                        />
                      </div>
                    </div>
                    <div className="navi-mobile-card__actions inventory-mobile-card__actions">
                      <button
                        type="button"
                        className="inventory-icon-btn"
                        onClick={() => onRegisterEntry(it)}
                        title="Registrar entrada"
                        aria-label="Registrar entrada"
                      >
                        <PackagePlus size={16} aria-hidden />
                      </button>
                      {onConfigureItem ? (
                        <button
                          type="button"
                          className="inventory-icon-btn"
                          onClick={() => onConfigureItem(it)}
                          title="Ajustar mínimo e unidade"
                          aria-label="Ajustar mínimo e unidade"
                        >
                          <Settings2 size={16} aria-hidden />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inventory-icon-btn"
                        onClick={() => onRequestCheck(it)}
                        title="Registrar conferência"
                        aria-label="Registrar conferência"
                      >
                        <ClipboardCheck size={16} aria-hidden />
                      </button>
                      {onDeleteItem ? (
                        <button
                          type="button"
                          className="inventory-icon-btn inventory-icon-btn--danger"
                          title="Excluir item"
                          aria-label="Excluir item"
                          onClick={() => onDeleteItem(it)}
                          disabled={deleteBusyId === it.id}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PackagePlus,
  ClipboardCheck,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Settings2,
} from 'lucide-react';
import SearchField from '../shared/SearchField.jsx';
import { STOCK_STATUS_LABELS } from '../../lib/stockInventory';
import {
  filterInventoryParents,
  parentSizeSummary,
  variantSizeLabel,
} from '../../lib/inventoryCatalogMerge.js';
import ProductThumb from '../products/ProductThumb';
import EmptyState from '../shared/EmptyState.jsx';
import Hint from '../shared/Hint.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import { DropdownMenu, DropdownMenuPanel, DropdownMenuItem } from '../shared/menu';

function isDefaultUnit(unit) {
  const u = String(unit || '').trim().toLowerCase();
  return !u || u === 'unidade';
}

function StockStatusBadge({ status, item, onRegisterEntry }) {
  const label = STOCK_STATUS_LABELS[status] || status;

  if (status === 'ok') {
    return <span className="inventory-status inventory-status--ok">{label}</span>;
  }

  const Icon = status === 'critical' ? AlertCircle : AlertTriangle;
  const clickable = (status === 'critical' || status === 'reorder') && onRegisterEntry && item;

  if (clickable) {
    return (
      <button
        type="button"
        className={`inventory-status inventory-status--badge inventory-status--${status} inventory-status--clickable`}
        title="Registrar entrada"
        onClick={(e) => {
          e.stopPropagation();
          onRegisterEntry(item);
        }}
      >
        <Icon size={11} aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <span className={`inventory-status inventory-status--badge inventory-status--${status}`}>
      <Icon size={11} aria-hidden />
      {label}
    </span>
  );
}

function VariantActionsMenu({ variant, isOpen, onToggle, onClose, onAdjust, onConfigure }) {
  return (
    <DropdownMenu open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <button
        type="button"
        className="inventory-icon-btn"
        title="Mais ações"
        aria-label="Mais ações"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {isOpen ? (
        <DropdownMenuPanel onClick={(e) => e.stopPropagation()}>
          {onAdjust ? (
            <DropdownMenuItem
              onClick={() => {
                onClose();
                onAdjust(variant);
              }}
            >
              Ajustar saldo
            </DropdownMenuItem>
          ) : null}
          {onConfigure ? (
            <DropdownMenuItem
              onClick={() => {
                onClose();
                onConfigure(variant);
              }}
            >
              Ajustar mínimo e unidade
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
}

function ParentActionsMenu({ parent, isOpen, onToggle, onClose, onConfigure, onAdjust }) {
  const firstVariant = parent.variants?.[0];

  return (
    <DropdownMenu open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <button
        type="button"
        className="inventory-icon-btn"
        title="Mais ações"
        aria-label="Mais ações"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {isOpen && firstVariant ? (
        <DropdownMenuPanel onClick={(e) => e.stopPropagation()}>
          {onAdjust ? (
            <DropdownMenuItem
              onClick={() => {
                onClose();
                onAdjust(firstVariant);
              }}
            >
              Ajustar saldo
            </DropdownMenuItem>
          ) : null}
          {onConfigure ? (
            <DropdownMenuItem
              onClick={() => {
                onClose();
                onConfigure(firstVariant);
              }}
            >
              Ajustar mínimo e unidade
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
}

export default function InventoryBalanceView({
  catalogParents = [],
  items = [],
  loading,
  highlightItemId = '',
  onRefresh,
  onRegisterEntry,
  onRequestCheck,
  onConfigureItem,
  onAdjustItem,
}) {
  const highlightRef = useRef(null);
  const autoExpandedRef = useRef(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [forSaleOnly, setForSaleOnly] = useState(false);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [actionsMenuId, setActionsMenuId] = useState(null);
  const [variantMenuId, setVariantMenuId] = useState(null);

  const parentRows = catalogParents;

  const categories = useMemo(() => {
    const set = new Set();
    for (const row of parentRows) {
      const c = String(row.categoria || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [parentRows]);

  const filtered = useMemo(
    () =>
      filterInventoryParents(parentRows, {
        search,
        category: categoryFilter,
        statusFilter,
        forSaleOnly,
      }),
    [parentRows, search, categoryFilter, statusFilter, forSaleOnly]
  );

  const showSizeColumn = useMemo(
    () =>
      filtered.some(
        (row) =>
          row.hasVariants ||
          (row.variants || []).some((v) => variantSizeLabel(v) !== 'Único')
      ),
    [filtered]
  );

  useEffect(() => {
    if (loading || autoExpandedRef.current || !parentRows.length) return;
    autoExpandedRef.current = true;
    const ids = parentRows.filter((p) => (p.variants || []).length > 1).map((p) => p.id);
    setExpandedIds(new Set(ids));
  }, [loading, parentRows]);

  const showUnitColumn = useMemo(
    () =>
      filtered.some((row) =>
        (row.variants || []).some((v) => !isDefaultUnit(v.unit))
      ),
    [filtered]
  );

  const anyExpanded = useMemo(
    () => filtered.some((row) => (row.variants || []).length > 1 && expandedIds.has(row.id)),
    [filtered, expandedIds]
  );

  const showMinColumn = anyExpanded || filtered.some((row) => (row.variants || []).length <= 1);

  const toggleExpanded = (parentId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  useEffect(() => {
    if (!highlightItemId || loading) return;
    const row = highlightRef.current;
    if (!row) return;
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightItemId, loading, filtered.length]);

  return (
    <section className="inventory-balance-section animate-in">
      <div className="flex justify-between items-center gap-2 mb-2 inventory-balance-toolbar">
        <h2 className="navi-section-heading" style={{ margin: 0 }}>Saldo atual</h2>
        <div className="flex gap-2 items-center inventory-balance-toolbar__controls">
          <button type="button" className="btn-outline navi-btn--toolbar" onClick={() => void onRefresh()} disabled={loading}>
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="card inventory-filters-card">
        <div className="filter-bar navi-toolbar inventory-filters-row">
          <div className="form-group filter-field inventory-filter-field inventory-filter-field--search" style={{ flex: '1 1 200px', minWidth: 160 }}>
            <label className="text-xs">Busca</label>
            <SearchField
              placeholder="Nome, tamanho, categoria…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar no estoque"
            />
          </div>
          <div className="form-group filter-field inventory-filter-field">
            <label className="text-xs">Status</label>
            <select className="form-input navi-control--toolbar" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="ok">OK</option>
              <option value="reorder">A repor</option>
              <option value="critical">Crítico</option>
            </select>
          </div>
          <div className="form-group filter-field inventory-filter-field">
            <label className="text-xs">Categoria</label>
            <select className="form-input navi-control--toolbar" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
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
          <PageSkeleton variant="table" rows={6} columns={6} />
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
            <div className="navi-desktop-table-wrap inventory-desktop-table-wrap products-desktop-table-wrap">
              <table className="navi-table inventory-table products-table">
                <colgroup>
                  <col className="inventory-table__col-thumb" />
                  <col className="inventory-table__col-name products-table__col-product" />
                  {showSizeColumn ? <col className="inventory-table__col-size" /> : null}
                  <col className="inventory-table__col-cat" />
                  {showUnitColumn ? <col className="inventory-table__col-unit" /> : null}
                  <col className="inventory-table__col-qty" />
                  {showMinColumn ? <col className="inventory-table__col-min" /> : null}
                  <col className="inventory-table__col-status" />
                  <col className="inventory-table__col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="inventory-table__thumb-head" aria-hidden />
                    <th className="inventory-table__th inventory-table__col-name products-table__col-product">
                      Produto
                    </th>
                    {showSizeColumn ? (
                      <th className="inventory-table__th inventory-table__col-size">Tamanho</th>
                    ) : null}
                    <th className="inventory-table__th inventory-table__col-cat">Categoria</th>
                    {showUnitColumn ? <th className="inventory-table__th">Unidade</th> : null}
                    <th className="inventory-table__th inventory-table__col-qty">Saldo</th>
                    {showMinColumn ? (
                      <th className="inventory-table__th inventory-table__col-min">
                        {anyExpanded ? (
                          <span className="inventory-th-with-hint">
                            Mín.
                            <Hint
                              text="Quantidade mínima recomendada. Abaixo disso o status fica A repor; zerado fica Crítico."
                              position="top"
                            />
                          </span>
                        ) : (
                          <span className="inventory-th-with-hint">
                            Mín. ideal
                            <Hint
                              text="Quantidade mínima recomendada. Abaixo disso o status fica A repor; zerado fica Crítico."
                              position="top"
                            />
                          </span>
                        )}
                      </th>
                    ) : null}
                    <th className="inventory-table__th inventory-table__col-status">
                      <span className="inventory-th-with-hint">
                        Status
                        <Hint
                          text="OK: saldo adequado. A repor: abaixo do mínimo. Crítico: sem estoque — clique no badge para registrar entrada."
                          position="top"
                        />
                      </span>
                    </th>
                    <th className="inventory-table__actions-head" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((parent) => {
                    const variants = parent.variants || [];
                    const hasVariants = variants.length > 1;
                    const expanded = expandedIds.has(parent.id);
                    const solo = !hasVariants;
                    const soloVariant = variants[0];
                    const rowHighlight =
                      highlightItemId === parent.id ||
                      (parent.variants || []).some((v) => v.id === highlightItemId);
                    const rowClass = [
                      'inventory-table__row',
                      parent.status === 'critical' ? 'inventory-row--critical' : '',
                      parent.status === 'reorder' ? 'inventory-row--reorder' : '',
                      rowHighlight ? 'inventory-row--highlight' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <React.Fragment key={parent.id}>
                        <tr
                          ref={rowHighlight ? highlightRef : undefined}
                          className={rowClass}
                          data-item-id={parent.id}
                        >
                          <td className="inventory-table__thumb-cell" onClick={(e) => e.stopPropagation()}>
                            <div className="inventory-table__thumb-inner">
                              {hasVariants ? (
                                <button
                                  type="button"
                                  className="inventory-table__expand-btn"
                                  aria-expanded={expanded}
                                  aria-label={expanded ? 'Recolher variantes' : 'Expandir variantes'}
                                  onClick={() => toggleExpanded(parent.id)}
                                >
                                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              ) : (
                                <span className="inventory-table__expand-spacer" aria-hidden />
                              )}
                              <ProductThumb imageUrl={parent.image_url} alt={parent.nome} size={32} />
                            </div>
                          </td>
                          <td className="inventory-table__col-name products-table__col-product">
                            <span className="inventory-table__name products-table__name">{parent.nome}</span>
                            {hasVariants ? (
                              <span className="inventory-table__variant-hint text-small text-muted">
                                {variants.length} tamanhos
                              </span>
                            ) : null}
                          </td>
                          {showSizeColumn ? (
                            <td className="inventory-table__col-size text-small">
                              {solo ? (
                                <strong className="inventory-table__size-label">{variantSizeLabel(soloVariant)}</strong>
                              ) : (
                                <span className="text-muted">{parentSizeSummary(parent)}</span>
                              )}
                            </td>
                          ) : null}
                          <td className="inventory-table__col-cat text-small text-muted">
                            {parent.categoria || '—'}
                          </td>
                          {showUnitColumn ? (
                            <td className="text-small text-muted">
                              {solo && !isDefaultUnit(soloVariant?.unit) ? soloVariant.unit : '—'}
                            </td>
                          ) : null}
                          <td className="inventory-table__col-qty inventory-table__qty">
                            {parent.total_quantity}
                          </td>
                          {showMinColumn ? (
                            <td
                              className={`inventory-table__col-min inventory-table__min text-small text-muted${solo && onConfigureItem ? ' inventory-table__min--editable' : ''}`}
                              onClick={
                                solo && onConfigureItem
                                  ? (e) => {
                                      e.stopPropagation();
                                      onConfigureItem(soloVariant);
                                    }
                                  : undefined
                              }
                              title={solo && onConfigureItem ? 'Clique para ajustar o mínimo' : undefined}
                            >
                              {solo && soloVariant?.minimum_level > 0 ? soloVariant.minimum_level : '—'}
                            </td>
                          ) : null}
                          <td className="inventory-table__col-status">
                            <StockStatusBadge
                              status={parent.status}
                              item={solo ? soloVariant : null}
                              onRegisterEntry={solo ? onRegisterEntry : undefined}
                            />
                          </td>
                          <td className="inventory-table__actions" onClick={(e) => e.stopPropagation()}>
                            <div className="inventory-table__actions-inner">
                              {solo ? (
                                <>
                                  <button
                                    type="button"
                                    className="inventory-icon-btn"
                                    onClick={() => onRegisterEntry(soloVariant)}
                                    title="Registrar entrada"
                                    aria-label="Registrar entrada"
                                  >
                                    <PackagePlus size={16} aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    className="inventory-icon-btn"
                                    onClick={() => onRequestCheck(soloVariant)}
                                    title="Registrar conferência"
                                    aria-label="Registrar conferência"
                                  >
                                    <ClipboardCheck size={16} aria-hidden />
                                  </button>
                                  {onAdjustItem || onConfigureItem ? (
                                    <VariantActionsMenu
                                      variant={soloVariant}
                                      isOpen={variantMenuId === soloVariant.id}
                                      onToggle={() =>
                                        setVariantMenuId((id) =>
                                          id === soloVariant.id ? null : soloVariant.id
                                        )
                                      }
                                      onClose={() => setVariantMenuId(null)}
                                      onAdjust={onAdjustItem}
                                      onConfigure={onConfigureItem}
                                    />
                                  ) : null}
                                  {onConfigureItem ? (
                                    <button
                                      type="button"
                                      className="inventory-icon-btn"
                                      onClick={() => onConfigureItem(soloVariant)}
                                      title="Ajustar mínimo e unidade"
                                      aria-label="Ajustar mínimo e unidade"
                                    >
                                      <Settings2 size={16} aria-hidden />
                                    </button>
                                  ) : null}
                                </>
                              ) : (
                                <ParentActionsMenu
                                  parent={parent}
                                  isOpen={actionsMenuId === parent.id}
                                  onToggle={() =>
                                    setActionsMenuId((id) => (id === parent.id ? null : parent.id))
                                  }
                                  onClose={() => setActionsMenuId(null)}
                                  onConfigure={onConfigureItem}
                                  onAdjust={onAdjustItem}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded && hasVariants
                          ? variants.map((v) => {
                              const vHighlight = highlightItemId === v.id;
                              const vClass = [
                                'inventory-table__row',
                                'inventory-table__row--variant',
                                v.status === 'critical' ? 'inventory-row--critical' : '',
                                v.status === 'reorder' ? 'inventory-row--reorder' : '',
                                vHighlight ? 'inventory-row--highlight' : '',
                              ]
                                .filter(Boolean)
                                .join(' ');
                              return (
                                <tr
                                  key={v.id}
                                  ref={vHighlight ? highlightRef : undefined}
                                  className={vClass}
                                  data-item-id={v.id}
                                >
                                  <td className="inventory-table__thumb-cell" aria-hidden />
                                  <td className="inventory-table__col-name products-table__variant-label">
                                    {parent.nome}
                                  </td>
                                  {showSizeColumn ? (
                                    <td className="inventory-table__col-size">
                                      <strong className="inventory-table__size-label">
                                        {variantSizeLabel(v)}
                                      </strong>
                                    </td>
                                  ) : null}
                                  <td
                                    className="inventory-table__col-cat inventory-table__cell-empty products-table__cell-empty"
                                    aria-hidden
                                  />
                                  {showUnitColumn ? (
                                    <td className="text-small text-muted">
                                      {isDefaultUnit(v.unit) ? '—' : v.unit}
                                    </td>
                                  ) : null}
                                  <td className="inventory-table__col-qty inventory-table__qty">
                                    {v.current_quantity}
                                  </td>
                                  {showMinColumn ? (
                                    <td
                                      className={`inventory-table__col-min inventory-table__min text-small text-muted${onConfigureItem ? ' inventory-table__min--editable' : ''}`}
                                      onClick={
                                        onConfigureItem
                                          ? (e) => {
                                              e.stopPropagation();
                                              onConfigureItem(v);
                                            }
                                          : undefined
                                      }
                                      title={onConfigureItem ? 'Clique para ajustar o mínimo' : undefined}
                                    >
                                      {v.minimum_level > 0 ? v.minimum_level : '—'}
                                    </td>
                                  ) : null}
                                  <td className="inventory-table__col-status">
                                    <StockStatusBadge
                                      status={v.status}
                                      item={v}
                                      onRegisterEntry={onRegisterEntry}
                                    />
                                  </td>
                                  <td className="inventory-table__actions" onClick={(e) => e.stopPropagation()}>
                                    <div className="inventory-table__actions-inner">
                                      <button
                                        type="button"
                                        className="inventory-icon-btn"
                                        onClick={() => onRegisterEntry(v)}
                                        title="Registrar entrada"
                                        aria-label="Registrar entrada"
                                      >
                                        <PackagePlus size={16} aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="inventory-icon-btn"
                                        onClick={() => onRequestCheck(v)}
                                        title="Registrar conferência"
                                        aria-label="Registrar conferência"
                                      >
                                        <ClipboardCheck size={16} aria-hidden />
                                      </button>
                                      {onAdjustItem || onConfigureItem ? (
                                        <VariantActionsMenu
                                          variant={v}
                                          isOpen={variantMenuId === v.id}
                                          onToggle={() =>
                                            setVariantMenuId((id) => (id === v.id ? null : v.id))
                                          }
                                          onClose={() => setVariantMenuId(null)}
                                          onAdjust={onAdjustItem}
                                          onConfigure={onConfigureItem}
                                        />
                                      ) : null}
                                      {onConfigureItem ? (
                                        <button
                                          type="button"
                                          className="inventory-icon-btn"
                                          onClick={() => onConfigureItem(v)}
                                          title="Ajustar mínimo e unidade"
                                          aria-label="Ajustar mínimo e unidade"
                                        >
                                          <Settings2 size={16} aria-hidden />
                                        </button>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="navi-mobile-list inventory-mobile-list" aria-label="Lista de estoque">
              {filtered.map((parent) => {
                const variants = parent.variants || [];
                const hasVariants = variants.length > 1;
                const expanded = expandedIds.has(parent.id);
                const solo = !hasVariants;
                const soloVariant = variants[0];
                const rowHighlight =
                  highlightItemId === parent.id ||
                  (parent.variants || []).some((v) => v.id === highlightItemId);
                const cardClass = [
                  'navi-mobile-card',
                  'inventory-mobile-card',
                  parent.status === 'critical' ? 'inventory-mobile-card--critical' : '',
                  parent.status === 'reorder' ? 'inventory-mobile-card--reorder' : '',
                  rowHighlight ? 'inventory-row--highlight' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <article
                    key={parent.id}
                    ref={rowHighlight ? highlightRef : undefined}
                    className={cardClass}
                    data-item-id={parent.id}
                  >
                    <div className="inventory-mobile-card__main">
                      <ProductThumb imageUrl={parent.image_url} alt={parent.nome} size={36} />
                      <div className="inventory-mobile-card__body">
                        <div className="inventory-mobile-card__title-row">
                          {hasVariants ? (
                            <button
                              type="button"
                              className="inventory-mobile-expand"
                              aria-expanded={expanded}
                              onClick={() => toggleExpanded(parent.id)}
                            >
                              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          ) : null}
                          <span className="inventory-mobile-card__title">{parent.nome}</span>
                        </div>
                        <div className="inventory-mobile-card__meta text-small text-muted">
                          {parent.categoria || '—'}
                          {solo && soloVariant ? (
                            <> · <strong>{variantSizeLabel(soloVariant)}</strong></>
                          ) : hasVariants ? (
                            <> · {variants.length} tamanhos</>
                          ) : null}
                        </div>
                        <div className="inventory-mobile-card__stats text-small">
                          <span>
                            Saldo: <strong>{parent.total_quantity}</strong>
                          </span>
                          {solo && soloVariant?.minimum_level > 0 ? (
                            <span>
                              Mín.: <strong>{soloVariant.minimum_level}</strong>
                            </span>
                          ) : null}
                          <StockStatusBadge
                            status={parent.status}
                            item={solo ? soloVariant : null}
                            onRegisterEntry={solo ? onRegisterEntry : undefined}
                          />
                        </div>
                      </div>
                    </div>
                    {solo ? (
                      <div className="navi-mobile-card__actions inventory-mobile-card__actions">
                        <button
                          type="button"
                          className="inventory-icon-btn"
                          onClick={() => onRegisterEntry(soloVariant)}
                          title="Registrar entrada"
                          aria-label="Registrar entrada"
                        >
                          <PackagePlus size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="inventory-icon-btn"
                          onClick={() => onRequestCheck(soloVariant)}
                          title="Registrar conferência"
                          aria-label="Registrar conferência"
                        >
                          <ClipboardCheck size={16} aria-hidden />
                        </button>
                        {onConfigureItem ? (
                          <button
                            type="button"
                            className="inventory-icon-btn"
                            onClick={() => onConfigureItem(soloVariant)}
                            title="Ajustar mínimo e unidade"
                            aria-label="Ajustar mínimo e unidade"
                          >
                            <Settings2 size={16} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {expanded && hasVariants ? (
                      <ul className="inventory-mobile-variants">
                        {variants.map((v) => (
                          <li key={v.id} className="inventory-mobile-variant">
                            <div className="inventory-mobile-variant__label">
                              <strong>{variantSizeLabel(v)}</strong>
                            </div>
                            <div className="inventory-mobile-variant__meta text-small">
                              <span>Saldo: {v.current_quantity}</span>
                              {onConfigureItem ? (
                                <button
                                  type="button"
                                  className="inventory-mobile-min-btn"
                                  onClick={() => onConfigureItem(v)}
                                >
                                  Mín.: <strong>{v.minimum_level > 0 ? v.minimum_level : '—'}</strong>
                                </button>
                              ) : v.minimum_level > 0 ? (
                                <span>Mín.: {v.minimum_level}</span>
                              ) : null}
                              <StockStatusBadge
                                status={v.status}
                                item={v}
                                onRegisterEntry={onRegisterEntry}
                              />
                            </div>
                            <div className="inventory-mobile-variant__actions">
                              <button
                                type="button"
                                className="inventory-icon-btn"
                                onClick={() => onRegisterEntry(v)}
                                title="Registrar entrada"
                                aria-label="Registrar entrada"
                              >
                                <PackagePlus size={16} aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="inventory-icon-btn"
                                onClick={() => onRequestCheck(v)}
                                title="Registrar conferência"
                                aria-label="Registrar conferência"
                              >
                                <ClipboardCheck size={16} aria-hidden />
                              </button>
                              {onConfigureItem ? (
                                <button
                                  type="button"
                                  className="inventory-icon-btn"
                                  onClick={() => onConfigureItem(v)}
                                  title="Ajustar mínimo e unidade"
                                  aria-label="Ajustar mínimo e unidade"
                                >
                                  <Settings2 size={16} aria-hidden />
                                </button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
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

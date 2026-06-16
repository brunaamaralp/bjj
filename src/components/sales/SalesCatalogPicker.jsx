import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingCart } from 'lucide-react';
import {
  catalogStockBadgeLabel,
  defaultLineKindForParent,
  filterCatalogProducts,
  groupByCategory,
  parentShowsDualPickActions,
} from '../../lib/salesCatalog';
import { formatBRL } from '../../lib/moneyBr';
import ProductThumb from '../products/ProductThumb';

const CATALOG_PAGE_SIZE = 80;

function stockBadgeClass(level) {
  if (level === 'out') return 'sales-stock-badge--out';
  if (level === 'low') return 'sales-stock-badge--low';
  return 'sales-stock-badge--ok';
}

function catalogPriceLabel(p, lineKind) {
  if (lineKind === 'rental') {
    return p.rental_price != null ? formatBRL(p.rental_price) : 'Aluguel a definir';
  }
  return p.sale_price != null ? formatBRL(p.sale_price) : 'Preço a definir';
}

function pickButtonTitle(p, lineKind) {
  const isRental = lineKind === 'rental';
  const can = isRental ? p.canRent : p.canSell;
  if (can) return isRental ? `Alugar ${p.display_label || p.nome}` : `Vender ${p.display_label || p.nome}`;
  return isRental ? 'Sem estoque para aluguel' : 'Sem estoque para venda';
}

function CatalogCardBody({ p, variantHint }) {
  return (
    <>
      <div className="sales-catalog__card-media" aria-hidden={!p.image_url}>
        <ProductThumb imageUrl={p.image_url} alt={p.display_label || p.nome} size={64} />
      </div>
      <div className="sales-catalog__card-top">
        <div className="sales-catalog__card-name">{p.display_label || p.nome}</div>
        {variantHint ? <span className="sales-catalog__card-var">{variantHint}</span> : null}
      </div>
      <span className={`sales-stock-badge ${stockBadgeClass(p.stockLevel)}`}>
        {catalogStockBadgeLabel(p)}
      </span>
    </>
  );
}

function CatalogCard({ p, flashProductId, onPick }) {
  const dual = parentShowsDualPickActions(p);
  const defaultKind = defaultLineKindForParent(p);
  const isOut = !p.canAdd;
  const isFlashing = flashProductId === p.id;
  const variantHint =
    p.variant_count > 1 ? `${p.variant_count} variantes` : p._singleVariant?.Tamanho || p.Tamanho || null;

  if (dual) {
    return (
      <div
        className={`sales-catalog__card sales-catalog__card--dual${isOut ? ' sales-catalog__card--out' : ''}${
          isFlashing ? ' sales-catalog__card--flash' : ''
        }`}
      >
        <CatalogCardBody p={p} variantHint={variantHint} />
        <div className="sales-catalog__card-dual-prices">
          <div className="sales-catalog__card-price-row">
            <span className="sales-catalog__card-price-tag">Venda</span>
            <span className="sales-catalog__card-price">{catalogPriceLabel(p, 'sale')}</span>
          </div>
          <div className="sales-catalog__card-price-row">
            <span className="sales-catalog__card-price-tag sales-catalog__card-price-tag--rental">
              Aluguel
            </span>
            <span className="sales-catalog__card-price sales-catalog__card-price--rental">
              {catalogPriceLabel(p, 'rental')}
            </span>
          </div>
        </div>
        <div className="sales-catalog__card-actions">
          <button
            type="button"
            className="btn-outline btn-sm sales-catalog__pick-btn"
            disabled={!p.canSell}
            title={pickButtonTitle(p, 'sale')}
            aria-label={pickButtonTitle(p, 'sale')}
            onClick={() => p.canSell && onPick(p, 'sale')}
          >
            Vender
          </button>
          <button
            type="button"
            className="btn-outline btn-sm sales-catalog__pick-btn sales-catalog__pick-btn--rental"
            disabled={!p.canRent}
            title={pickButtonTitle(p, 'rental')}
            aria-label={pickButtonTitle(p, 'rental')}
            onClick={() => p.canRent && onPick(p, 'rental')}
          >
            Alugar
          </button>
        </div>
      </div>
    );
  }

  const lineKind = defaultKind;
  const priceLabel = catalogPriceLabel(p, lineKind);
  return (
    <button
      type="button"
      className={`sales-catalog__card${isOut ? ' sales-catalog__card--out' : ''}${
        isFlashing ? ' sales-catalog__card--flash' : ''
      }`}
      disabled={!p.canAdd}
      onClick={() => p.canAdd && onPick(p, lineKind)}
      title={
        p.canAdd
          ? p.variant_count > 1
            ? lineKind === 'rental'
              ? 'Escolher variante para alugar'
              : 'Escolher variante'
            : lineKind === 'rental'
              ? 'Alugar'
              : 'Adicionar ao carrinho'
          : 'Sem estoque'
      }
    >
      <CatalogCardBody p={p} variantHint={variantHint} />
      <div className="sales-catalog__card-price-wrap">
        {lineKind === 'rental' ? (
          <span className="sales-catalog__card-price-tag sales-catalog__card-price-tag--rental">
            Aluguel
          </span>
        ) : null}
        <div className="sales-catalog__card-price">{priceLabel}</div>
      </div>
    </button>
  );
}

export default function SalesCatalogPicker({
  products,
  loading,
  onPick,
  flashProductId,
  onNavigateAway,
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const filterKey = `${search}|${category}|${products.length}`;
  const [limitState, setLimitState] = useState({ key: filterKey, limit: CATALOG_PAGE_SIZE });
  const visibleLimit = limitState.key === filterKey ? limitState.limit : CATALOG_PAGE_SIZE;
  const setVisibleLimit = (next) => {
    const resolved = typeof next === 'function' ? next(visibleLimit) : next;
    setLimitState({ key: filterKey, limit: resolved });
  };

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      if (p.categoria) set.add(p.categoria);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [products]);

  const filtered = useMemo(
    () => filterCatalogProducts(products, { search, category }),
    [products, search, category]
  );

  const groups = useMemo(() => groupByCategory(filtered), [filtered]);

  const displayGroups = category === 'all' ? groups : groups.filter((g) => g.categoria === category);

  const flatProducts = useMemo(() => {
    const rows = [];
    for (const g of displayGroups) {
      for (const p of g.items) {
        rows.push({ product: p, categoria: g.categoria });
      }
    }
    return rows;
  }, [displayGroups]);

  const usePagination = products.length > CATALOG_PAGE_SIZE;
  const visibleRows = usePagination ? flatProducts.slice(0, visibleLimit) : flatProducts;
  const hasMore = usePagination && flatProducts.length > visibleLimit;

  const catalogEmpty = !loading && products.length === 0;
  const filterEmpty = !loading && products.length > 0 && displayGroups.length === 0;

  const visibleByGroup = useMemo(() => {
    const map = new Map();
    for (const row of visibleRows) {
      if (!map.has(row.categoria)) map.set(row.categoria, []);
      map.get(row.categoria).push(row.product);
    }
    return Array.from(map.entries()).map(([categoria, items]) => ({ categoria, items }));
  }, [visibleRows]);

  return (
    <section className="sales-catalog" aria-label="Catálogo de produtos">
      <div className="navi-filters-stack sales-catalog__filters">
        <div className="sales-catalog__search form-group">
          <label>Busca rápida</label>
          <div className="sales-catalog__search-wrap">
            <Search size={14} className="sales-catalog__search-icon" aria-hidden />
            <input
              className="form-input"
              placeholder="Filtrar por nome, categoria ou variação…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="sales-catalog__chips" role="tablist" aria-label="Categorias">
        <button
          type="button"
          role="tab"
          aria-selected={category === 'all'}
          className={`sales-catalog__chip${category === 'all' ? ' active' : ''}`}
          onClick={() => setCategory('all')}
        >
          Todas
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            className={`sales-catalog__chip${category === c ? ' active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
        </div>
      </div>

      {loading ? (
        <p className="text-small text-muted sales-catalog__status">Carregando catálogo…</p>
      ) : catalogEmpty ? (
        <div className="sales-catalog-empty">
          <div className="sales-catalog-empty__icon" aria-hidden>
            <ShoppingCart size={40} strokeWidth={1.5} />
          </div>
          <h4 className="sales-catalog-empty__title">Nenhum produto disponível</h4>
          <p className="sales-catalog-empty__hint">
            Cadastre produtos com estoque de venda ou aluguel para registrar movimentações no PDV.
          </p>
          <Link
            to="/produtos"
            className="btn-primary sales-catalog-empty__cta"
            onClick={(e) => {
              if (!onNavigateAway) return;
              e.preventDefault();
              onNavigateAway('/produtos');
            }}
          >
            Cadastrar produtos
          </Link>
        </div>
      ) : filterEmpty ? (
        <p className="text-small text-muted sales-catalog__status">Nenhum produto corresponde à busca.</p>
      ) : (
        <>
          {visibleByGroup.map((g) => (
            <div key={g.categoria} className="sales-catalog__group">
              <h4 className="sales-catalog__group-title">{g.categoria}</h4>
              <div className="sales-catalog__grid">
                {g.items.map((p) => (
                  <CatalogCard key={p.id} p={p} flashProductId={flashProductId} onPick={onPick} />
                ))}
              </div>
            </div>
          ))}
          {hasMore ? (
            <div className="sales-catalog__more">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setVisibleLimit((n) => n + CATALOG_PAGE_SIZE)}
              >
                Carregar mais ({flatProducts.length - visibleLimit} restantes)
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

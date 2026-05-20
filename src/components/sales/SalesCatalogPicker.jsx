import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingCart } from 'lucide-react';
import { filterCatalogProducts, groupByCategory } from '../../lib/salesCatalog';
import { formatBRL } from '../../lib/moneyBr';

const CATALOG_PAGE_SIZE = 80;

function stockBadgeClass(level) {
  if (level === 'out') return 'sales-stock-badge--out';
  if (level === 'low') return 'sales-stock-badge--low';
  return 'sales-stock-badge--ok';
}

function stockBadgeLabel(p) {
  if (p.stockLevel === 'out') return 'Esgotado';
  if (p.stockLevel === 'low') return `Baixo · ${p.current_quantity}`;
  return `Disp. ${p.current_quantity}`;
}

function CatalogCard({ p, flashProductId, onPick }) {
  const priceLabel = p.sale_price != null ? formatBRL(p.sale_price) : 'Preço a definir';
  const isOut = p.stockLevel === 'out';
  const isFlashing = flashProductId === p.id;
  return (
    <button
      type="button"
      className={`sales-catalog__card${isOut ? ' sales-catalog__card--out' : ''}${
        isFlashing ? ' sales-catalog__card--flash' : ''
      }`}
      disabled={!p.canAdd}
      onClick={() => p.canAdd && onPick(p)}
      title={p.canAdd ? 'Adicionar ao carrinho' : 'Sem estoque'}
    >
      <div className="sales-catalog__card-top">
        <div className="sales-catalog__card-name">{p.display_label}</div>
        {p.Tamanho ? <span className="sales-catalog__card-var">{p.Tamanho}</span> : null}
      </div>
      <div className="sales-catalog__card-price">{priceLabel}</div>
      <span className={`sales-stock-badge ${stockBadgeClass(p.stockLevel)}`}>
        {stockBadgeLabel(p)}
      </span>
    </button>
  );
}

export default function SalesCatalogPicker({ products, loading, onPick, flashProductId }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [visibleLimit, setVisibleLimit] = useState(CATALOG_PAGE_SIZE);

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

  useEffect(() => {
    setVisibleLimit(CATALOG_PAGE_SIZE);
  }, [search, category, products.length]);

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
          className={`sales-catalog__chip${category === 'all' ? ' active' : ''}`}
          onClick={() => setCategory('all')}
        >
          Todas
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={`sales-catalog__chip${category === c ? ' active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-small text-muted sales-catalog__status">Carregando catálogo…</p>
      ) : catalogEmpty ? (
        <div className="sales-catalog-empty">
          <div className="sales-catalog-empty__icon" aria-hidden>
            <ShoppingCart size={40} strokeWidth={1.5} />
          </div>
          <h4 className="sales-catalog-empty__title">Nenhum produto disponível para venda</h4>
          <p className="sales-catalog-empty__hint">
            Cadastre os produtos da academia para começar a registrar vendas.
          </p>
          <Link to="/produtos" className="btn-primary sales-catalog-empty__cta">
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

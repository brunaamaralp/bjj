import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { filterCatalogProducts, groupByCategory } from '../../lib/salesCatalog';
import { formatBRL } from '../../lib/moneyBr';

const STOCK_STYLES = {
  ok: { borderColor: 'var(--success)', color: 'var(--success)' },
  low: { borderColor: 'var(--warning, #c9a227)', color: 'var(--warning, #c9a227)' },
  out: { borderColor: 'var(--danger)', color: 'var(--danger)', opacity: 0.75 },
};

function stockLabel(p) {
  if (p.stockLevel === 'out') return 'Esgotado';
  if (p.stockLevel === 'low') return `Baixo: ${p.current_quantity}`;
  return `Disp: ${p.current_quantity}`;
}

export default function SalesCatalogPicker({ products, loading, onPick }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

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

  return (
    <section className="sales-catalog">
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Busca rápida</label>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} aria-hidden />
          <input
            className="form-input"
            style={{ paddingLeft: 30 }}
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
        <p className="text-small text-muted">Carregando catálogo…</p>
      ) : displayGroups.length === 0 ? (
        <p className="text-small text-muted">Nenhum produto para venda no catálogo.</p>
      ) : (
        displayGroups.map((g) => (
          <div key={g.categoria} className="sales-catalog__group">
            <h4 className="sales-catalog__group-title">{g.categoria}</h4>
            <div className="sales-catalog__grid">
              {g.items.map((p) => {
                const st = STOCK_STYLES[p.stockLevel] || STOCK_STYLES.ok;
                const priceLabel =
                  p.sale_price != null ? formatBRL(p.sale_price) : 'Preço a definir';
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="sales-catalog__card"
                    disabled={!p.canAdd}
                    style={{
                      borderColor: st.borderColor,
                      cursor: p.canAdd ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => p.canAdd && onPick(p)}
                    title={p.canAdd ? 'Adicionar ao carrinho' : 'Sem estoque'}
                  >
                    <div className="sales-catalog__card-name">{p.display_label}</div>
                    <div className="sales-catalog__card-meta">
                      <span>{priceLabel}</span>
                      <span style={{ color: st.color, fontWeight: 600 }}>{stockLabel(p)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}



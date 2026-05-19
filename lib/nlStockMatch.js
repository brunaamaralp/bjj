/**
 * Correspondência de produtos do estoque para comandos NL (vendas).
 */

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s) {
  const n = norm(s);
  return n ? n.split(/\s+/).filter(Boolean) : [];
}

function productHaystack(p) {
  return norm(
    [
      p.nome,
      p.display_label,
      p.categoria,
      p.Tamanho,
      p.sku,
      p.descricao,
      p.variacao,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function scoreProduct(query, product) {
  const q = norm(query);
  if (!q) return 0;
  const hay = productHaystack(product);
  if (!hay) return 0;
  if (hay === q) return 100;
  if (hay.includes(q) || q.includes(hay)) return 85;

  const qTok = tokens(query);
  if (!qTok.length) return 0;
  let hits = 0;
  for (const t of qTok) {
    if (hay.includes(t)) hits += 1;
  }
  const ratio = hits / qTok.length;
  return Math.round(ratio * 70);
}

/**
 * @param {string} query
 * @param {object[]} products — catálogo mapeado (id, display_label, sale_price, current_quantity, …)
 * @param {{ stockItemId?: string, minScore?: number }} [opts]
 */
export function matchStockProduct(query, products, opts = {}) {
  const list = (products || []).filter((p) => p && String(p.id || '').trim());
  const stockItemId = String(opts.stockItemId || '').trim();
  const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 42;

  if (stockItemId) {
    const exact = list.find((p) => String(p.id).trim() === stockItemId);
    if (exact) {
      return { status: 'ok', product: exact, suggestions: [], score: 100 };
    }
    return {
      status: 'not_found',
      product: null,
      suggestions: list.slice(0, 5).map((p) => formatProductSuggestion(p)),
      score: 0,
    };
  }

  const q = String(query || '').trim();
  if (!q) {
    return { status: 'not_found', product: null, suggestions: [], score: 0 };
  }

  const ranked = list
    .map((p) => ({ p, score: scoreProduct(q, p) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    const fallback = list
      .map((p) => ({ p, score: scoreProduct(q.slice(0, Math.max(3, q.length - 2)), p) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return {
      status: 'not_found',
      product: null,
      suggestions: fallback.map((x) => formatProductSuggestion(x.p)),
      score: 0,
    };
  }

  const top = ranked[0];
  const second = ranked[1];
  if (second && top.score - second.score < 8 && second.score >= minScore) {
    return {
      status: 'ambiguous',
      product: null,
      suggestions: ranked.slice(0, 5).map((x) => formatProductSuggestion(x.p, x.score)),
      score: top.score,
    };
  }

  return {
    status: 'ok',
    product: top.p,
    suggestions: ranked.slice(1, 4).map((x) => formatProductSuggestion(x.p)),
    score: top.score,
  };
}

export function formatProductSuggestion(product, score) {
  const label = String(product.display_label || product.nome || product.id || '').trim();
  const qty = Number(product.current_quantity);
  const price = Number(product.sale_price);
  const parts = [label];
  if (Number.isFinite(qty)) parts.push(`estoque: ${qty}`);
  if (Number.isFinite(price) && price > 0) parts.push(`R$ ${price.toFixed(2).replace('.', ',')}`);
  return {
    id: String(product.id || '').trim(),
    label: parts.join(' · '),
    score: Number.isFinite(score) ? score : undefined,
  };
}

export function catalogProductsForNl(products) {
  return (products || [])
    .filter((p) => p && p.is_for_sale !== false && p.is_active !== false)
    .slice(0, 200)
    .map((p) => ({
      id: String(p.id || '').trim(),
      display_label: String(p.display_label || p.nome || '').trim(),
      nome: String(p.nome || '').trim(),
      categoria: String(p.categoria || '').trim(),
      Tamanho: String(p.Tamanho || p.variacao || p.sku || '').trim(),
      sku: String(p.sku || '').trim(),
      sale_price: p.sale_price != null ? Number(p.sale_price) : null,
      current_quantity: Number(p.current_quantity) || 0,
    }));
}

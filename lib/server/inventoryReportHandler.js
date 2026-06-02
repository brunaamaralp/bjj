/**
 * GET relatório de giro / curva ABC por produto pai.
 */
import { Query } from 'node-appwrite';
import {
  listCatalog,
  isParentVariantCatalogEnabled,
  PRODUCT_VARIANTS_COL,
} from './productCatalogDb.js';
import { buildParentCatalogRows } from '../../src/lib/productCatalog.js';
import { variantInventoryLabel } from '../../src/lib/stockInventory.js';
import { readAverageCost } from '../../src/lib/weightedAverageCost.js';
import { roundMoney } from './salePayments.js';

const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';

function periodDaysInclusive(from, to) {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  const diff = Math.max(1, Math.round((b - a) / 86400000) + 1);
  return diff;
}

function assignAbcCurve(rows) {
  const withSales = rows.filter((r) => r.units_sold > 0);
  const noSales = rows.filter((r) => r.units_sold <= 0);
  const sorted = withSales.slice().sort((a, b) => b.revenue - a.revenue);
  const totalRev = sorted.reduce((s, r) => s + r.revenue, 0);
  let cum = 0;
  for (const r of sorted) {
    cum += r.revenue;
    const share = totalRev > 0 ? cum / totalRev : 1;
    if (share <= 0.8) r.curve = 'A';
    else if (share <= 0.95) r.curve = 'B';
    else r.curve = 'C';
  }
  for (const r of noSales) {
    r.curve = 'C';
    r.stalled = true;
  }
  return [...sorted, ...noSales];
}

export async function buildInventoryReport(databases, dbId, stockItemsCol, academyId, from, to) {
  const days = periodDaysInclusive(from, to);
  const fromIso = new Date(`${from}T00:00:00`).toISOString();
  const toEnd = new Date(`${to}T00:00:00`);
  toEnd.setDate(toEnd.getDate() + 1);
  const toIso = toEnd.toISOString();

  let parents = [];
  const variantById = new Map();
  const parentByVariant = new Map();

  if (isParentVariantCatalogEnabled()) {
    const catalog = await listCatalog(databases, dbId, stockItemsCol, academyId);
    parents = buildParentCatalogRows(catalog.products || [], catalog.variants || []);
    for (const v of catalog.variants || []) {
      variantById.set(v.id, v);
      parentByVariant.set(v.id, v.product_id);
    }
  } else {
    const list = await databases.listDocuments(dbId, stockItemsCol, [
      Query.equal('academy_id', academyId),
      Query.limit(500),
    ]);
    for (const doc of list.documents || []) {
      if (doc.migrated === true) continue;
      const id = doc.$id;
      const nome = String(doc.nome || doc.name || '').trim();
      parents.push({
        id,
        nome,
        categoria: String(doc.categoria || doc.category || '').trim(),
        sale_price: doc.sale_price != null ? Number(doc.sale_price) : null,
        variants: [{ id, display_label: nome, current_quantity: Number(doc.current_quantity) || 0 }],
        total_quantity: Number(doc.current_quantity) || 0,
      });
      variantById.set(id, { id, display_label: nome, product_id: id, sale_price: Number(doc.sale_price) || 0 });
      parentByVariant.set(id, id);
    }
  }

  const metrics = new Map();
  for (const p of parents) {
    metrics.set(p.id, {
      product_id: p.id,
      nome: p.nome,
      categoria: p.categoria || '',
      sale_price: p.sale_price,
      current_stock: Number(p.total_quantity) || 0,
      minimum_stock: Math.max(
        0,
        ...(p.variants || []).map((v) => Number(v.minimum_level ?? v.minimum_stock ?? 0) || 0)
      ),
      units_sold: 0,
      revenue: 0,
      cmv: 0,
      last_sale_date: null,
      curve: 'C',
      stalled: false,
    });
  }

  if (SALES_COL && SALE_ITEMS_COL) {
    const saleQueries = [
      Query.equal('academy_id', academyId),
      Query.equal('status', 'concluida'),
      Query.greaterThanEqual('$createdAt', fromIso),
      Query.lessThan('$createdAt', toIso),
      Query.limit(500),
    ];
    let sales;
    try {
      sales = await databases.listDocuments(dbId, SALES_COL, saleQueries);
    } catch {
      sales = await databases.listDocuments(dbId, SALES_COL, [
        Query.equal('status', 'concluida'),
        Query.greaterThanEqual('$createdAt', fromIso),
        Query.lessThan('$createdAt', toIso),
        Query.limit(500),
      ]);
      sales.documents = (sales.documents || []).filter(
        (s) => !s.academy_id || String(s.academy_id) === academyId
      );
    }

    const saleDateById = new Map();
    for (const s of sales.documents || []) {
      saleDateById.set(s.$id, (s.$createdAt || '').slice(0, 10));
    }

    for (const vendaId of saleDateById.keys()) {
      let items;
      try {
        items = await databases.listDocuments(dbId, SALE_ITEMS_COL, [
          Query.equal('venda_id', vendaId),
          Query.limit(100),
        ]);
      } catch {
        continue;
      }
      const saleDate = saleDateById.get(vendaId);
      for (const it of items.documents || []) {
        const variantId = String(it.product_variant_id || it.item_estoque_id || '').trim();
        if (!variantId) continue;
        const parentId = parentByVariant.get(variantId) || variantId;
        if (!metrics.has(parentId)) continue;

        const qty = Math.max(0, Number(it.quantidade) || 0);
        const unit = Number(it.preco_unitario) || 0;
        const lineRevenue = roundMoney(unit * qty);
        let lineCmv = Number(it.cmv);
        if (!Number.isFinite(lineCmv) || lineCmv < 0) {
          const v = variantById.get(variantId);
          let stockDoc = v;
          if (!stockDoc?.average_cost && PRODUCT_VARIANTS_COL) {
            try {
              stockDoc = await databases.getDocument(dbId, PRODUCT_VARIANTS_COL, variantId);
            } catch {
              stockDoc = v;
            }
          }
          lineCmv = roundMoney(qty * readAverageCost(stockDoc || {}));
        }

        const row = metrics.get(parentId);
        row.units_sold += qty;
        row.revenue = roundMoney(row.revenue + lineRevenue);
        row.cmv = roundMoney(row.cmv + lineCmv);
        if (saleDate && (!row.last_sale_date || saleDate > row.last_sale_date)) {
          row.last_sale_date = saleDate;
        }
      }
    }
  }

  const rows = assignAbcCurve(
    Array.from(metrics.values()).map((r) => {
      const dailyRate = r.units_sold > 0 ? r.units_sold / days : 0;
      const daysOfStock =
        r.units_sold <= 0 ? null : dailyRate > 0 ? Math.round(r.current_stock / dailyRate) : null;
      return {
        ...r,
        gross_margin: roundMoney(r.revenue - r.cmv),
        days_of_stock: daysOfStock,
        days_of_stock_label:
          daysOfStock == null ? (r.units_sold <= 0 ? '∞' : '—') : String(daysOfStock),
      };
    })
  );

  rows.sort((a, b) => b.revenue - a.revenue);

  const parentById = new Map(parents.map((p) => [p.id, p]));
  const productsWithVariants = rows.map((r) => {
    const p = parentById.get(r.product_id);
    if (!p?.variants?.length) return r;
    return {
      ...r,
      _variants: p.variants.map((v) => {
        const doc = variantById.get(v.id) || v;
        return {
          id: v.id,
          label: String(v.display_label || '').trim() || variantInventoryLabel(doc),
          average_cost: readAverageCost(doc),
        };
      }),
    };
  });

  const summary = {
    curve_a: rows.filter((r) => r.curve === 'A' && !r.stalled).length,
    curve_b: rows.filter((r) => r.curve === 'B').length,
    curve_c: rows.filter((r) => r.curve === 'C' && r.units_sold > 0).length,
    stalled: rows.filter((r) => r.units_sold <= 0).length,
  };

  return {
    from,
    to,
    period_days: days,
    summary,
    products: productsWithVariants,
  };
}

export async function handleInventoryReportGet(req, res, databases, dbId, stockItemsCol, academyId) {
  const from = String(req.query.from || '').trim().slice(0, 10);
  const to = String(req.query.to || '').trim().slice(0, 10);
  if (!from || !to) {
    return res.status(400).json({ sucesso: false, erro: 'from e to obrigatórios (YYYY-MM-DD)' });
  }
  try {
    const report = await buildInventoryReport(databases, dbId, stockItemsCol, academyId, from, to);
    return res.status(200).json({ sucesso: true, ...report });
  } catch (e) {
    console.error('[inventory] report:', e);
    return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro no relatório' });
  }
}

/**
 * Respostas em linguagem natural sobre relatório de estoque (IA).
 */
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { buildInventoryReport } from './inventoryReportHandler.js';
import { formatBRL } from '../../src/lib/moneyBr.js';

const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const STOCK_ITEMS_COL =
  process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '';

function monthBounds() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { from, to };
}

function formatTopSellers(products, limit = 5) {
  const top = (products || []).filter((p) => p.units_sold > 0).slice(0, limit);
  if (!top.length) return 'Nenhuma venda no período.';
  return top
    .map(
      (p, i) =>
        `${i + 1}. ${p.nome} (${p.units_sold} un, ${formatBRL(p.revenue)})`
    )
    .join('\n');
}

function formatSlowMovers(products) {
  const stalled = (products || []).filter((p) => p.units_sold <= 0);
  if (!stalled.length) return 'Todos os produtos tiveram ao menos uma venda no período.';
  const names = stalled.slice(0, 8).map((p) => p.nome);
  const extra = stalled.length > 8 ? ` e mais ${stalled.length - 8}` : '';
  return `${stalled.length} produto(s) sem venda: ${names.join(', ')}${extra}.`;
}

function formatMarginQuery(products, filterName) {
  const q = String(filterName || '').trim().toLowerCase();
  if (!q) return 'Informe o nome do produto para consultar a margem.';
  const hit = (products || []).find((p) => p.nome.toLowerCase().includes(q));
  if (!hit) return `Não encontrei "${filterName}" no catálogo.`;
  const price = Number(hit.sale_price);
  if (!Number.isFinite(price) || price <= 0) {
    return `${hit.nome}: sem preço de venda cadastrado.`;
  }
  const variants = hit._variants;
  if (variants?.length) {
    const lines = variants.map((v) => {
      const avg = Number(v.average_cost) || 0;
      const margin = price - avg;
      const pct = price > 0 ? Math.round((margin / price) * 100) : 0;
      return `· ${v.label}: custo médio ${formatBRL(avg)}, margem ${formatBRL(margin)} (${pct}%)`;
    });
    return `${hit.nome} — preço ${formatBRL(price)}\n${lines.join('\n')}`;
  }
  const margin = Number(hit.gross_margin) || 0;
  const pct = price > 0 ? Math.round((margin / price) * 100) : 0;
  return `${hit.nome}: receita ${formatBRL(hit.revenue)}, margem ${formatBRL(margin)} (${pct}%) no período.`;
}

function formatStockLevel(products, filterName) {
  const q = String(filterName || '').trim().toLowerCase();
  const list = q
    ? (products || []).filter((p) => p.nome.toLowerCase().includes(q))
    : (products || []).slice(0, 10);
  if (!list.length) return q ? `Nenhum produto parecido com "${filterName}".` : 'Sem produtos no catálogo.';
  return list
    .map((p) => `· ${p.nome}: ${p.current_stock} un em estoque${p.units_sold > 0 ? `, ${p.units_sold} vendidas no período` : ''}`)
    .join('\n');
}

export async function answerInventoryQuery(databases, {
  academyId,
  from,
  to,
  queryType,
  productNameFilter,
}) {
  const report = await buildInventoryReport(databases, DB_ID, STOCK_ITEMS_COL, academyId, from, to);
  const { products, summary } = report;

  switch (String(queryType || '').trim()) {
    case 'top_sellers':
      return {
        resposta: `Seus produtos que mais venderam (${from} a ${to}):\n${formatTopSellers(products)}`,
        report,
      };
    case 'slow_movers':
      return {
        resposta: formatSlowMovers(products),
        report,
      };
    case 'margin':
      return {
        resposta: formatMarginQuery(products, productNameFilter),
        report,
      };
    case 'stock_level':
      return {
        resposta: formatStockLevel(products, productNameFilter),
        report,
      };
    default:
      return {
        resposta: `No período: ${summary.curve_a} produtos curva A, ${summary.stalled} parados (0 vendas). ${formatTopSellers(products, 3)}`,
        report,
      };
  }
}

export async function handleInventoryQueryAgent(req, res, databases) {
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const text = String(body.message || body.text || '').trim().toLowerCase();
  let queryType = String(body.query_type || '').trim();
  let productNameFilter = String(body.product_name_filter || body.product_query || '').trim();

  if (!queryType && text) {
    if (/parado|sem venda|não vend|nao vend/.test(text)) queryType = 'slow_movers';
    else if (/mais vend|top|melhor/.test(text)) queryType = 'top_sellers';
    else if (/margem/.test(text)) queryType = 'margin';
    else if (/estoque|saldo|quanto tenho/.test(text)) queryType = 'stock_level';
    else queryType = 'top_sellers';
    if (/camisa|boné|bone|bermuda|kimono/.test(text)) {
      const m = text.match(/(camisa[^.?]*|bon[eé][^.?]*|bermuda[^.?]*|kimono[^.?]*)/i);
      if (m) productNameFilter = m[1].trim();
    }
  }

  const bounds = monthBounds();
  const from = String(body.from || bounds.from).slice(0, 10);
  const to = String(body.to || bounds.to).slice(0, 10);

  try {
    const out = await answerInventoryQuery(databases, {
      academyId: access.academyId,
      from,
      to,
      queryType,
      productNameFilter,
    });
    return res.status(200).json({ sucesso: true, ...out });
  } catch (e) {
    console.error('[inventoryQuery]', e?.message || e);
    return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro na consulta' });
  }
}

export default handleInventoryQueryAgent;

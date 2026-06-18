/** Política de exclusão de produto — vendas vs movimentações de setup. */
import { Query } from 'node-appwrite';

const SETUP_ENTRADA_MOTIVOS = new Set(['cadastro_inicial']);

/** Tipos ligados a venda/aluguel — únicos que bloqueiam exclusão (além de SALE_ITEMS). */
const SALE_RELATED_MOVE_TIPOS = new Set(['saida_venda', 'saida_aluguel']);

/** Entrada de saldo inicial no cadastro — não bloqueia exclusão. */
export function isSetupOnlyStockMove(doc) {
  const tipo = String(doc?.tipo || '').toLowerCase();
  const motivo = String(doc?.motivo || '').trim().toLowerCase();
  if (tipo === 'entrada' && SETUP_ENTRADA_MOTIVOS.has(motivo)) return true;
  return false;
}

export function isSaleRelatedStockMove(doc) {
  const tipo = String(doc?.tipo || '').toLowerCase();
  return SALE_RELATED_MOVE_TIPOS.has(tipo);
}

/**
 * Movimentações que impedem exclusão: apenas baixas de venda/aluguel.
 * Ajustes, entradas e conferências são apagados junto com o produto.
 * @param {object[]} documents
 */
export function hasBlockingStockMovesFromDocuments(documents) {
  return (documents || []).some((doc) => isSaleRelatedStockMove(doc));
}

/**
 * Conta vendas ligadas ao item — só consulta legacy quando explicitamente vinculado.
 * @param {import('node-appwrite').Databases} databases
 * @param {object} opts
 */
export async function countSalesLinkedToStockItem(databases, opts) {
  const { dbId, saleItemsCol, salesCol, stockItemsCol, itemId, legacyStockItemId, academyId } = opts;
  const vid = String(itemId || '').trim();
  if (!vid) return 0;

  let total = await countSaleItemsByField(
    databases,
    dbId,
    saleItemsCol,
    stockItemsCol,
    salesCol,
    academyId,
    'item_estoque_id',
    vid
  );
  total = Math.max(
    total,
    await countSaleItemsByField(
      databases,
      dbId,
      saleItemsCol,
      stockItemsCol,
      salesCol,
      academyId,
      'product_variant_id',
      vid
    )
  );

  const legacyId = String(legacyStockItemId || '').trim();
  if (legacyId && legacyId !== vid) {
    total = Math.max(
      total,
      await countSaleItemsByField(
        databases,
        dbId,
        saleItemsCol,
        stockItemsCol,
        salesCol,
        academyId,
        'item_estoque_id',
        legacyId
      )
    );
  }

  if (total > 0) return total;

  return countSalesInSnapshots(databases, dbId, salesCol, academyId, [vid, legacyId].filter(Boolean));
}

async function countSaleItemsByField(
  databases,
  dbId,
  saleItemsCol,
  stockItemsCol,
  salesCol,
  academyId,
  field,
  id
) {
  if (!saleItemsCol || saleItemsCol === stockItemsCol) return 0;
  const queries = [Query.equal(field, [id]), Query.limit(25)];
  try {
    if (academyId) queries.unshift(Query.equal('academy_id', academyId));
  } catch {
    void 0;
  }
  try {
    const res = await databases.listDocuments(dbId, saleItemsCol, queries);
    const items = res.documents || [];
    if (!items.length) return 0;
    if (!salesCol) return items.length;

    const saleStatusCache = new Map();
    let blocking = 0;
    for (const item of items) {
      const vendaId = String(item.venda_id || '').trim();
      if (!vendaId) continue;
      let status = saleStatusCache.get(vendaId);
      if (status === undefined) {
        try {
          const sale = await databases.getDocument(dbId, salesCol, vendaId);
          status = sale.status;
        } catch {
          status = null;
        }
        saleStatusCache.set(vendaId, status);
      }
      if (isSaleBlockingStatus(status)) blocking += 1;
    }
    return blocking;
  } catch {
    return 0;
  }
}

/** Venda cancelada/rascunho não impede excluir produto. */
export function isSaleBlockingStatus(status) {
  const st = String(status || '').toLowerCase();
  if (!st || st === 'cancelada' || st === 'cancelled') return false;
  if (st === 'rascunho' || st === 'pendente') return false;
  return st === 'concluida';
}

async function countSalesInSnapshots(databases, dbId, salesCol, academyId, ids) {
  if (!salesCol || !academyId || !ids.length) return 0;
  const idSet = new Set(ids.map(String));
  try {
    const page = await databases.listDocuments(dbId, salesCol, [
      Query.equal('academyId', [String(academyId)]),
      Query.limit(100),
    ]);
    for (const sale of page.documents || []) {
      if (!isSaleBlockingStatus(sale.status)) continue;
      const raw = sale.itens_snapshot_json || sale.itens_snapshot;
      if (!raw) continue;
      let lines = [];
      try {
        lines = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        lines = [];
      }
      if (!Array.isArray(lines)) continue;
      if (
        lines.some((ln) => {
          const ref = String(ln?.item_estoque_id || ln?.product_variant_id || '');
          return ref && idSet.has(ref);
        })
      ) {
        return 1;
      }
    }
  } catch {
    return 0;
  }
  return 0;
}

/** Lista movimentações do item e indica se alguma bloqueia exclusão. */
export async function hasBlockingStockMovesForItem(databases, dbId, stockMovesCol, stockItemsCol, itemId) {
  if (!stockMovesCol || stockMovesCol === stockItemsCol) return false;
  const id = String(itemId || '').trim();
  if (!id) return false;
  try {
    const list = await databases.listDocuments(dbId, stockMovesCol, [
      Query.equal('item_estoque_id', [id]),
      Query.limit(100),
    ]);
    return hasBlockingStockMovesFromDocuments(list.documents || []);
  } catch (e) {
    console.warn('[products] hasBlockingStockMoves:', e?.message || e);
    return false;
  }
}

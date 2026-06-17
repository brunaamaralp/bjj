/** Política de exclusão de produto — vendas vs movimentações de setup. */
import { Query } from 'node-appwrite';

const SETUP_ENTRADA_MOTIVOS = new Set(['cadastro_inicial']);

/** Entrada de saldo inicial no cadastro — não bloqueia exclusão. */
export function isSetupOnlyStockMove(doc) {
  const tipo = String(doc?.tipo || '').toLowerCase();
  const motivo = String(doc?.motivo || '').trim().toLowerCase();
  return tipo === 'entrada' && SETUP_ENTRADA_MOTIVOS.has(motivo);
}

/**
 * Movimentações que impedem exclusão (vendas, ajustes, entradas operacionais).
 * @param {object[]} documents
 */
export function hasBlockingStockMovesFromDocuments(documents) {
  return (documents || []).some((doc) => !isSetupOnlyStockMove(doc));
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
  academyId,
  field,
  id
) {
  if (!saleItemsCol || saleItemsCol === stockItemsCol) return 0;
  const queries = [Query.equal(field, [id]), Query.limit(1)];
  try {
    if (academyId) queries.unshift(Query.equal('academy_id', academyId));
  } catch {
    void 0;
  }
  try {
    const res = await databases.listDocuments(dbId, saleItemsCol, queries);
    return Number(res.total) || (res.documents || []).length;
  } catch {
    return 0;
  }
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

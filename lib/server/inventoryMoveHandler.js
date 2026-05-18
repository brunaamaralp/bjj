/**
 * Movimentação de estoque + tarefas de reposição + espelho no Caixa.
 */
import { ID, Permission, Query, Role } from 'node-appwrite';
import {
  buildRestockTaskDescription,
  buildRestockTaskTitle,
  isStockRestockTask,
  itemDisplayName,
  parseStockItemIdFromTaskDescription,
  quantityDeltaForMoveType,
  resolveCurrentQuantity,
  STOCK_RESTOCK_MARKER,
} from '../../src/lib/stockInventory.js';
import {
  academyHasFinanceModule,
  readStockPurchaseExpenseCategory,
  parseAcademySettings,
} from '../../src/lib/stockSettings.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const TASKS_COL = process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function hasOpenRestockTask(tasks, itemId) {
  return (tasks || []).some((t) => {
    if (String(t.status || '') === 'done') return false;
    if (!isStockRestockTask(t)) return false;
    return parseStockItemIdFromTaskDescription(t.description) === String(itemId);
  });
}

async function listOpenRestockTasksForItem(databases, dbId, academyId, itemId) {
  if (!TASKS_COL) return [];
  const res = await databases.listDocuments(dbId, TASKS_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('status', 'pending'),
    Query.limit(100),
  ]);
  return (res.documents || []).filter(
    (t) => isStockRestockTask(t) && parseStockItemIdFromTaskDescription(t.description) === String(itemId)
  );
}

async function listAcademyPendingTasks(databases, dbId, academyId) {
  if (!TASKS_COL) return [];
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const queries = [Query.equal('academy_id', academyId), Query.limit(PAGE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, TASKS_COL, queries);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return all;
}

async function createRestockTask(databases, dbId, academyId, item, currentQty) {
  if (!TASKS_COL) return null;
  const itemId = item.$id;
  const tasks = await listOpenRestockTasksForItem(databases, dbId, academyId, itemId);
  if (tasks.length > 0) return null;

  const name = itemDisplayName(item);
  const unit = String(item.unit || 'unidade').trim() || 'unidade';
  const min = Number(item.minimum_level || 0);
  const title = buildRestockTaskTitle(name);
  const description = buildRestockTaskDescription({
    itemId,
    currentQty,
    unit,
    minimumLevel: min,
  });

  return databases.createDocument(
    dbId,
    TASKS_COL,
    ID.unique(),
    {
      academy_id: academyId,
      title,
      description,
      status: 'pending',
      due_date: todayYmd(),
      assigned_to: '',
      lead_id: '',
      lead_name: '',
      created_by: 'system',
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
  );
}

async function closeRestockTasksForItem(databases, dbId, academyId, itemId) {
  const open = await listOpenRestockTasksForItem(databases, dbId, academyId, itemId);
  const ts = nowIso();
  for (const t of open) {
    await databases.updateDocument(dbId, TASKS_COL, t.$id, {
      status: 'done',
      updated_at: ts,
    });
  }
  return open.length;
}

async function maybeCreateFinanceExpense(databases, dbId, academyDoc, {
  academyId,
  purchasePrice,
  itemName,
  quantity,
  unit,
  paymentMethod,
  moveDate,
}) {
  if (!FINANCIAL_TX_COL || !academyHasFinanceModule(academyDoc)) return null;
  const price = Number(purchasePrice);
  if (!Number.isFinite(price) || price <= 0) return null;

  const settings = parseAcademySettings(academyDoc.settings);
  const category = readStockPurchaseExpenseCategory(settings);
  const u = String(unit || 'unidade').trim() || 'unidade';
  const q = Number(quantity) || 0;
  const note = `Compra de estoque: ${itemName} — ${q} ${u}`;
  const settledAt = moveDate ? String(moveDate).slice(0, 10) : todayYmd();

  const payload = {
    academyId,
    saleId: '',
    lead_id: '',
    method: String(paymentMethod || 'pix').trim() || 'pix',
    installments: 1,
    type: 'expense',
    planName: category,
    gross: price,
    fee: 0,
    net: price,
    status: 'settled',
    note,
    settledAt: settledAt.length === 10 ? `${settledAt}T12:00:00.000Z` : settledAt,
  };

  try {
    return await databases.createDocument(dbId, FINANCIAL_TX_COL, ID.unique(), payload, [
      Permission.read(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ]);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown attribute')) {
      delete payload.lead_id;
      return databases.createDocument(dbId, FINANCIAL_TX_COL, ID.unique(), payload, [
        Permission.read(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]);
    }
    throw e;
  }
}

function validateMoveTipo(tipo, quantidade) {
  if (tipo === 'avulso') return { avulso: true };
  const known = ['entrada', 'ajuste', 'saida_venda', 'saida_aluguel', 'devolucao', 'reversao_venda'];
  if (!known.includes(String(tipo || '').toLowerCase())) return { error: 'invalid_tipo' };
  if (['entrada', 'saida_venda', 'saida_aluguel', 'devolucao', 'reversao_venda'].includes(tipo) && quantidade < 0) {
    return { error: 'invalid_quantity' };
  }
  return { ok: true };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {object} opts
 */
export async function executeInventoryMove(databases, opts) {
  const {
    dbId,
    stockItemsCol,
    stockMovesCol,
    itemEstoqueId,
    tipo,
    quantidade,
    motivo,
    referencia_id,
    usuario_id,
    status_par,
    purchase_price,
    payment_method,
    academy_id,
    academyDoc,
  } = opts;

  if (!itemEstoqueId || !tipo || typeof quantidade !== 'number' || quantidade === 0) {
    return { ok: false, error: 'invalid_payload', status: 400 };
  }
  if (tipo === 'ajuste' && !String(motivo || '').trim()) {
    return { ok: false, error: 'motivo_required', status: 400 };
  }

  const item = await databases.getDocument(dbId, stockItemsCol, itemEstoqueId);
  const academyId = String(academy_id || item.academy_id || '').trim();

  if (academyId && item.academy_id && String(item.academy_id) !== academyId) {
    return { ok: false, error: 'academy_mismatch', status: 403 };
  }

  const delta = quantityDeltaForMoveType(tipo, quantidade);
  const prevQty = resolveCurrentQuantity(item);

  if (delta < 0 && prevQty + delta < 0) {
    return { ok: false, error: 'no_stock', status: 409 };
  }

  const tipoCheck = validateMoveTipo(tipo, quantidade);
  if (tipoCheck.error) {
    return { ok: false, error: tipoCheck.error, status: 400 };
  }

  const itemUpdates = { last_updated: nowIso() };

  if (tipo === 'avulso') {
    itemUpdates.status_par = status_par || item.status_par || 'completo';
  } else {
    itemUpdates.current_quantity = prevQty + delta;
  }

  const updated =
    Object.keys(itemUpdates).length > 0
      ? await databases.updateDocument(dbId, stockItemsCol, itemEstoqueId, itemUpdates)
      : item;

  const movePayload = {
    item_estoque_id: itemEstoqueId,
    tipo,
    quantidade,
    referencia_id: referencia_id || null,
    motivo: motivo || '',
    usuario_id: usuario_id || '',
  };
  if (purchase_price != null && purchase_price !== '') {
    movePayload.purchase_price = Number(purchase_price);
  }
  if (academyId) movePayload.academy_id = academyId;

  const move = await databases.createDocument(dbId, stockMovesCol, ID.unique(), movePayload);

  const newQty = resolveCurrentQuantity(updated);
  const minLevel = Number(updated.minimum_level || 0);
  let restockTaskCreated = false;
  let restockTasksClosed = 0;
  let financialTxId = null;

  if (academyId && minLevel > 0) {
    if (newQty <= minLevel) {
      const task = await createRestockTask(databases, dbId, academyId, updated, newQty);
      restockTaskCreated = Boolean(task);
    } else if (newQty > minLevel) {
      restockTasksClosed = await closeRestockTasksForItem(databases, dbId, academyId, itemEstoqueId);
    }
  }

  if (tipo === 'entrada' && purchase_price != null && academyDoc && academyId) {
    const fin = await maybeCreateFinanceExpense(databases, dbId, academyDoc, {
      academyId,
      purchasePrice: purchase_price,
      itemName: itemDisplayName(updated),
      quantity: quantidade,
      unit: updated.unit,
      paymentMethod: payment_method,
      moveDate: todayYmd(),
    });
    financialTxId = fin?.$id || null;
  }

  return {
    ok: true,
    status: 200,
    movimento_id: move.$id,
    financial_tx_id: financialTxId,
    restock_task_created: restockTaskCreated,
    restock_tasks_closed: restockTasksClosed,
    saldos: {
      current_quantity: newQty,
    },
  };
}

/** Conferência manual: atualiza last_checked. */
export async function executeStockItemCheck(databases, { dbId, stockItemsCol, itemEstoqueId, academy_id }) {
  const item = await databases.getDocument(dbId, stockItemsCol, itemEstoqueId);
  const academyId = String(academy_id || item.academy_id || '').trim();
  if (academyId && item.academy_id && String(item.academy_id) !== academyId) {
    return { ok: false, error: 'academy_mismatch', status: 403 };
  }
  const ymd = todayYmd();
  const updated = await databases.updateDocument(dbId, stockItemsCol, itemEstoqueId, {
    last_checked: ymd,
    last_updated: nowIso(),
  });
  return {
    ok: true,
    status: 200,
    item: {
      id: updated.$id,
      last_checked: updated.last_checked || ymd,
      current_quantity: resolveCurrentQuantity(updated),
    },
  };
}

/** Varredura de alertas (cron / backup). */
export async function ensureRestockTasksForAcademy(databases, dbId, academyId, stockItemsCol) {
  if (!TASKS_COL || !stockItemsCol) return { created: 0 };

  const PAGE = 100;
  let created = 0;
  let cursor = null;
  const pendingTasks = await listAcademyPendingTasks(databases, dbId, academyId);

  for (;;) {
    const queries = [Query.limit(PAGE)];
    if (academyId) queries.unshift(Query.equal('academy_id', academyId));
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(dbId, stockItemsCol, queries);
    } catch {
      if (academyId) {
        res = await databases.listDocuments(dbId, stockItemsCol, [Query.limit(PAGE)]);
      } else break;
    }
    const batch = res.documents || [];
    if (!batch.length) break;

    for (const item of batch) {
      if (academyId && item.academy_id && String(item.academy_id) !== academyId) continue;
      const min = Number(item.minimum_level || 0);
      if (min <= 0) continue;
      const qty = resolveCurrentQuantity(item);
      if (qty > min) continue;
      if (hasOpenRestockTask(pendingTasks, item.$id)) continue;
      const task = await createRestockTask(databases, dbId, academyId, item, qty);
      if (task) {
        pendingTasks.push(task);
        created += 1;
      }
    }
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return { created };
}

export { STOCK_RESTOCK_MARKER };

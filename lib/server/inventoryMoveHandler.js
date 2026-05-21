/**
 * Movimentação de estoque + tarefas de reposição + espelho no Caixa.
 */
import { ID, Permission, Query, Role } from 'node-appwrite';
import {
  buildConsolidatedRestockTaskDescription,
  buildConsolidatedRestockTaskTitle,
  isConsolidatedRestockTask,
  isLegacyPerItemRestockTask,
  isOpenTaskStatus,
  isStockRestockTask,
  quantityDeltaForMoveType,
  resolveCurrentQuantity,
  getVariantStockStatus,
  itemDisplayName,
  variantInventoryLabel,
  STOCK_RESTOCK_MARKER,
  STOCK_RESTOCK_TITLE_PREFIX,
} from '../../src/lib/stockInventory.js';
import { INVENTORY_EVENT_TYPES, recordAcademyEvent } from './academyEvents.js';
import {
  ADJUSTMENT_TYPE,
  buildAdjustmentMotivo,
  isAdjustmentSubtype,
} from '../../src/lib/inventoryAdjust.js';
import { resolveStockDocument, PRODUCT_VARIANTS_COL } from './productCatalogDb.js';
import {
  computeWeightedAverageCost,
  entryUnitCostFromPurchaseTotal,
  readAverageCost,
} from '../../src/lib/weightedAverageCost.js';
import { roundMoney } from './salePayments.js';
import { academyHasFinanceModule } from '../../src/lib/stockSettings.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { competenceMonthFromIso } from '../../src/lib/financeCompetence.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const TASKS_COL = process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
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

function findOpenRestockTasksByTitleBase(tasks) {
  return (tasks || []).filter(
    (t) =>
      isOpenTaskStatus(t.status) &&
      isStockRestockTask(t) &&
      String(t.title || '').trim().startsWith(STOCK_RESTOCK_TITLE_PREFIX)
  );
}

function findOpenConsolidatedRestockTask(tasks) {
  const open = findOpenRestockTasksByTitleBase(tasks);
  return open.find((t) => isConsolidatedRestockTask(t)) || null;
}

async function closeRestockTasks(databases, dbId, taskIds) {
  if (!TASKS_COL || !taskIds?.length) return 0;
  const ts = nowIso();
  for (const id of taskIds) {
    await databases.updateDocument(dbId, TASKS_COL, id, {
      status: 'done',
      updated_at: ts,
    });
  }
  return taskIds.length;
}

async function listCriticalStockItems(databases, dbId, academyId, stockItemsCol) {
  const PAGE = 100;
  let cursor = null;
  const critical = [];

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
      const qty = resolveCurrentQuantity(item);
      if (getVariantStockStatus(qty, min) === 'critical') {
        critical.push({ item, currentQty: qty, minimumLevel: min });
      }
    }
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }

  return critical;
}

async function auditRestockTaskEvent(type, { academyId, taskId, productsCount, productIds }) {
  await recordAcademyEvent({
    event_type: type,
    academy_id: academyId,
    actor_user_id: 'system',
    actor_name: 'Sistema',
    target_id: taskId,
    timestamp: nowIso(),
    products_count: productsCount,
    product_ids: productIds,
    task_id: taskId,
  });
}

/**
 * Uma tarefa consolidada por academia; atualiza se já existir aberta com título "Repor estoque…".
 * @returns {{ created: number, updated: number, closed: number, taskId?: string }}
 */
export async function syncConsolidatedRestockForAcademy(databases, dbId, academyId, stockItemsCol) {
  if (!TASKS_COL || !stockItemsCol || !academyId) {
    return { created: 0, updated: 0, closed: 0 };
  }

  const critical = await listCriticalStockItems(databases, dbId, academyId, stockItemsCol);
  const pendingTasks = await listAcademyPendingTasks(databases, dbId, academyId);
  const openRestock = findOpenRestockTasksByTitleBase(pendingTasks);
  const consolidated = findOpenConsolidatedRestockTask(pendingTasks);
  const legacyOpen = openRestock.filter((t) => isLegacyPerItemRestockTask(t));

  const productIds = critical.map((c) => String(c.item.$id));

  if (critical.length === 0) {
    const toClose = openRestock.map((t) => t.$id);
    const closed = await closeRestockTasks(databases, dbId, toClose);
    return { created: 0, updated: 0, closed };
  }

  const title = buildConsolidatedRestockTaskTitle(critical.length);
  const description = buildConsolidatedRestockTaskDescription(critical);
  const ts = nowIso();
  const payload = {
    title,
    description,
    status: 'pending',
    due_date: todayYmd(),
    assigned_to: '',
    updated_at: ts,
  };

  let taskId;
  let created = 0;
  let updated = 0;

  if (consolidated) {
    await databases.updateDocument(dbId, TASKS_COL, consolidated.$id, payload);
    taskId = consolidated.$id;
    updated = 1;
    await auditRestockTaskEvent(INVENTORY_EVENT_TYPES.RESTOCK_TASK_UPDATED, {
      academyId,
      taskId,
      productsCount: critical.length,
      productIds,
    });
  } else {
    const doc = await databases.createDocument(
      dbId,
      TASKS_COL,
      ID.unique(),
      {
        academy_id: academyId,
        ...payload,
        lead_id: '',
        lead_name: '',
        created_by: 'system',
        created_at: ts,
      },
      [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
    );
    taskId = doc.$id;
    created = 1;
    await auditRestockTaskEvent(INVENTORY_EVENT_TYPES.RESTOCK_TASK_CREATED, {
      academyId,
      taskId,
      productsCount: critical.length,
      productIds,
    });
  }

  const legacyIds = legacyOpen.map((t) => t.$id);
  const extraConsolidated = openRestock
    .filter((t) => isConsolidatedRestockTask(t) && t.$id !== taskId)
    .map((t) => t.$id);
  const closed =
    (await closeRestockTasks(databases, dbId, [...legacyIds, ...extraConsolidated])) || 0;

  return { created, updated, closed, taskId };
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

  const u = String(unit || 'unidade').trim() || 'unidade';
  const q = Number(quantity) || 0;
  const note = `Compra de estoque: ${itemName} — ${q} ${u}`;
  const settledAt = moveDate ? String(moveDate).slice(0, 10) : todayYmd();

  const settledIso = settledAt.length === 10 ? `${settledAt}T12:00:00.000Z` : settledAt;

  const payload = {
    academyId,
    saleId: '',
    lead_id: '',
    method: String(paymentMethod || 'pix').trim() || 'pix',
    installments: 1,
    type: FINANCE_CATEGORIES.CUSTO_ESTOQUE.type,
    category: FINANCE_CATEGORIES.CUSTO_ESTOQUE.label,
    competence_month: competenceMonthFromIso(settledIso),
    planName: note,
    gross: price,
    fee: 0,
    net: price,
    status: 'settled',
    note,
    settledAt: settledIso,
  };

  try {
    const doc = await databases.createDocument(dbId, FINANCIAL_TX_COL, ID.unique(), payload, [
      Permission.read(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ]);
    void applyAccountingSideEffectsAutoServer(
      {
        id: doc.$id,
        type: payload.type,
        category: payload.category,
        gross: payload.gross,
        fee: 0,
        net: payload.net,
        status: 'settled',
        settledAt: payload.settledAt,
        competence_month: payload.competence_month,
        planName: payload.planName,
      },
      academyId
    );
    return doc;
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown attribute')) {
      const lean = { ...payload };
      for (const key of ['lead_id', 'competence_month', 'category']) delete lean[key];
      lean.type = FINANCE_CATEGORIES.CUSTO_ESTOQUE.type;
      const doc = await databases.createDocument(dbId, FINANCIAL_TX_COL, ID.unique(), lean, [
        Permission.read(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]);
      void applyAccountingSideEffectsAutoServer(
        {
          ...lean,
          id: doc.$id,
          type: FINANCE_CATEGORIES.CUSTO_ESTOQUE.type,
          category: FINANCE_CATEGORIES.CUSTO_ESTOQUE.label,
        },
        academyId
      );
      return doc;
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

  const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, itemEstoqueId);
  if (!resolved) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  const item = resolved.doc;
  const stockCol = resolved.collection || stockItemsCol;
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

  if (tipo === 'entrada' && purchase_price != null && purchase_price !== '') {
    const unitCost = entryUnitCostFromPurchaseTotal(purchase_price, quantidade);
    if (unitCost != null) {
      const prevAvg = readAverageCost(item);
      itemUpdates.average_cost = computeWeightedAverageCost(prevQty, prevAvg, quantidade, unitCost);
      itemUpdates.last_purchase_cost = unitCost;
    }
  }

  const updated =
    Object.keys(itemUpdates).length > 0
      ? await databases.updateDocument(dbId, stockCol, itemEstoqueId, itemUpdates)
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
  let restockTaskUpdated = false;
  let restockTasksClosed = 0;
  let financialTxId = null;

  if (academyId && stockItemsCol) {
    const sync = await syncConsolidatedRestockForAcademy(databases, dbId, academyId, stockItemsCol);
    restockTaskCreated = sync.created > 0;
    restockTaskUpdated = sync.updated > 0;
    restockTasksClosed = sync.closed || 0;
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
    restock_task_updated: restockTaskUpdated,
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

/** Varredura de alertas (cron / backup) — tarefa consolidada por academia. */
export async function ensureRestockTasksForAcademy(databases, dbId, academyId, stockItemsCol) {
  return syncConsolidatedRestockForAcademy(databases, dbId, academyId, stockItemsCol);
}

/**
 * Ajuste de saldo (perda/correção) — tipo adjustment, sem FINANCIAL_TX.
 * @param {import('node-appwrite').Databases} databases
 */
export async function executeInventoryAdjustment(databases, opts) {
  const {
    dbId,
    stockItemsCol,
    stockMovesCol,
    variantId,
    quantityChange,
    subtype,
    note,
    actorUserId,
    actorName,
    academy_id,
  } = opts;

  const itemId = String(variantId || '').trim();
  if (!itemId || !stockMovesCol) {
    return { ok: false, error: 'invalid_payload', status: 400 };
  }
  if (!isAdjustmentSubtype(subtype)) {
    return { ok: false, error: 'invalid_subtype', status: 400 };
  }

  const delta = Number(quantityChange);
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: 'invalid_quantity', status: 400 };
  }

  const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, itemId);
  if (!resolved) {
    return { ok: false, error: 'not_found', status: 404 };
  }

  const item = resolved.doc;
  const academyId = String(academy_id || item.academy_id || '').trim();
  if (academyId && item.academy_id && String(item.academy_id) !== academyId) {
    return { ok: false, error: 'academy_mismatch', status: 403 };
  }

  const stockCol = resolved.collection || stockItemsCol;
  const prevQty = resolveCurrentQuantity(item);
  const nextQty = prevQty + delta;
  if (nextQty < 0) {
    return { ok: false, error: 'no_stock', status: 409 };
  }

  const parentName = resolved.parent?.nome || itemDisplayName(item);
  const variantLabel =
    resolved.collection === PRODUCT_VARIANTS_COL || item.size != null || item.color != null
      ? variantInventoryLabel({
          size: item.size,
          color: item.color,
          Tamanho: item.Tamanho ?? item.tamanho,
        })
      : String(item.Tamanho || '').trim() || 'Único';
  const productName = parentName;
  const displayVariantLabel = variantLabel === 'Único' ? productName : `${productName} · ${variantLabel}`;

  const motivo = buildAdjustmentMotivo(subtype, note);
  const ts = nowIso();

  const updated = await databases.updateDocument(dbId, stockCol, itemId, {
    current_quantity: nextQty,
    last_updated: ts,
  });

  const movePayload = {
    item_estoque_id: itemId,
    tipo: 'ajuste',
    quantidade: delta,
    referencia_id: ADJUSTMENT_TYPE,
    motivo,
    usuario_id: String(actorUserId || '').trim(),
    adjustment_subtype: subtype,
    adjustment_type: ADJUSTMENT_TYPE,
  };
  if (academyId) movePayload.academy_id = academyId;

  const move = await databases.createDocument(dbId, stockMovesCol, ID.unique(), movePayload);

  if (academyId && stockItemsCol) {
    await syncConsolidatedRestockForAcademy(databases, dbId, academyId, stockItemsCol);
  }

  await recordAcademyEvent({
    event_type: INVENTORY_EVENT_TYPES.ADJUSTED,
    academy_id: academyId,
    actor_user_id: String(actorUserId || 'system').slice(0, 64),
    actor_name: String(actorName || '').slice(0, 128),
    target_id: itemId,
    target_name: displayVariantLabel.slice(0, 128),
    previous_value: String(prevQty),
    new_value: String(nextQty),
    timestamp: ts,
    variant_id: itemId,
    product_name: productName,
    variant_label: displayVariantLabel,
    subtype,
    quantity_before: prevQty,
    quantity_after: nextQty,
    quantity_change: delta,
    note: String(note || '').trim(),
    move_id: move.$id,
  });

  return {
    ok: true,
    status: 200,
    movimento_id: move.$id,
    quantity_before: prevQty,
    quantity_after: nextQty,
    variant_label: displayVariantLabel,
    product_name: productName,
    saldos: { current_quantity: nextQty },
  };
}

export { STOCK_RESTOCK_MARKER };

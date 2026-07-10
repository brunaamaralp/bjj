/**
 * PATCH /api/sales — action descartar_rascunho
 * Remove venda em status rascunho (falha parcial no create) sem fluxo de cancelamento.
 */
import { Query } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  databases,
  DB_ID,
} from './academyAccess.js';
import { saleBelongsToAcademy } from './saleAcademyScope.js';
import { revertSaleItemsStock } from './salesCancelHandler.js';
import { updateDocumentResilient } from './appwriteSchemaResilient.js';
import { recordAuditEvent, actorFromMe } from './auditLog.js';
import { AUDIT_EVENTS } from './auditEventTypes.js';

const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';
const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';

const DRAFT_DISCARD_MOTIVO = 'Rascunho descartado';

function json(res, status, body) {
  res.status(status).json(body);
}

async function listSaleItems(vendaId) {
  const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
    Query.equal('venda_id', vendaId),
    Query.limit(1000),
  ]);
  return res.documents || [];
}

export default async function salesDiscardDraftHandler(req, res) {
  if (!DB_ID || !SALES_COL || !SALE_ITEMS_COL || !STOCK_ITEMS_COL || !STOCK_MOVES_COL) {
    return json(res, 503, { ok: false, error: 'sales_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const vendaId = String(body?.id || body?.venda_id || '').trim();
  const action = String(body?.action || '').trim().toLowerCase();
  if (!vendaId || action !== 'descartar_rascunho') {
    return json(res, 400, { ok: false, error: 'invalid_payload' });
  }

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const bodyAid = String(body?.academy_id || '').trim();
  if (bodyAid && bodyAid !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const canDiscard = await isAcademyOwnerOrAdminUser(academyDoc, me);
  if (!canDiscard) {
    return json(res, 403, { ok: false, error: 'forbidden_role' });
  }

  let venda;
  try {
    venda = await databases.getDocument(DB_ID, SALES_COL, vendaId);
  } catch {
    return json(res, 404, { ok: false, error: 'not_found' });
  }

  if (!saleBelongsToAcademy(venda, academyId)) {
    return json(res, 403, { ok: false, error: 'forbidden_sale_academy' });
  }

  const statusNow = String(venda.status || '').toLowerCase();
  if (statusNow === 'cancelada' && String(venda.cancel_motivo || '').trim() === DRAFT_DISCARD_MOTIVO) {
    return json(res, 200, {
      ok: true,
      status: 'cancelada',
      venda_id: vendaId,
      discarded: true,
      cancelada_em: venda.cancelada_em || null,
    });
  }

  if (statusNow !== 'rascunho') {
    return json(res, 409, { ok: false, error: 'sale_not_draft' });
  }

  const usuarioId = String(me.$id || '').trim();
  const usuarioName = String(me.name || me.email || '').trim();
  const vendaAcademyId = String(venda.academyId || venda.academy_id || academyId).trim();

  let revertedItems = [];
  try {
    const itens = await listSaleItems(vendaId);
    revertedItems = await revertSaleItemsStock({
      itens,
      venda,
      vendaId,
      academyId: vendaAcademyId,
      motivo: DRAFT_DISCARD_MOTIVO,
      usuarioId,
      usuarioName,
    });
  } catch (e) {
    console.error('[salesDiscardDraft] stock:', e);
    return json(res, 500, {
      ok: false,
      error: 'stock_revert_failed',
      detail: String(e?.message || e),
    });
  }

  const cancelada_em = new Date().toISOString();
  await updateDocumentResilient(databases, DB_ID, SALES_COL, vendaId, {
    status: 'cancelada',
    cancelada_em,
    cancel_motivo: DRAFT_DISCARD_MOTIVO,
  });

  recordAuditEvent({
    eventType: AUDIT_EVENTS.SALES_DRAFT_DISCARDED,
    academyId: vendaAcademyId,
    actor: actorFromMe(me),
    target: { type: 'sale', id: vendaId },
    source: 'api.sales.patch.descartar_rascunho',
    payload: {
      sale_id: vendaId,
      items_reverted: revertedItems.length,
    },
  }).catch((e) => console.warn('[salesDiscardDraft] audit:', e?.message || e));

  return json(res, 200, {
    ok: true,
    status: 'cancelada',
    venda_id: vendaId,
    discarded: true,
    cancelada_em,
    cancel_motivo: DRAFT_DISCARD_MOTIVO,
    items: revertedItems,
  });
}

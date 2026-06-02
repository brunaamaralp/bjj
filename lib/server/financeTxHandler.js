/**
 * GET/POST/PATCH /api/finance-tx — lançamentos do Caixa.
 * RBAC: member registra entrada e liquida; owner/admin despesa, cancelar e editar pendente.
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  DB_ID,
  databases,
} from './academyAccess.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import {
  buildFinanceTxPayload,
  financeTxDocumentForAppwrite,
  financeTxDocumentWithOptionals,
  financeTxOptionalPatchForAppwrite,
  mapFinanceTxDoc,
  stripUnknownFinanceTxAttrs,
  financeCategoryLabelFromDoc,
  isExpenseType,
  normalizeRecurrenceType,
  normalizeRecurrenceDay,
  parseRecurrenceEnd,
} from './financeTxFields.js';
import { recordAcademyEvent, FINANCE_RECURRENCE_EVENT_TYPES } from './academyEvents.js';
import { listFinancialTxForPeriod } from './financeTxQuery.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

const PAGE_SIZE = 200;

function json(res, status, body) {
  res.status(status).json(body);
}

async function resolveRole(req, res, me, academyDoc) {
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;
  const isAdmin = await isAcademyOwnerOrAdminUser(academyDoc, me);
  return { ...access, isAdmin };
}

export async function handleListFinanceTx(req, res, academyId) {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const regimeRaw = String(req.query.regime || FINANCE_REGIME.CASH).toLowerCase();
  const regime =
    regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;

  const items = await listFinancialTxForPeriod(academyId, { from, to, regime });

  return json(res, 200, {
    ok: true,
    transactions: items,
    total: items.length,
    hasMore: false,
    nextCursor: null,
    regime,
  });
}

export async function handleCreateFinanceTx(req, res, academyId, me, academyDoc, role) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const type = String(body.type || 'other').toLowerCase();
  if (isExpenseType(type) && !role.isAdmin) {
    return json(res, 403, { ok: false, error: 'Apenas titular ou administrador pode registrar despesa' });
  }

  const receiveNow = body.receive_now === true || body.status === 'settled';
  const status = receiveNow ? 'settled' : 'pending';

  try {
    const payload = buildFinanceTxPayload(
      {
        ...body,
        academyId,
        status,
        settledAt: receiveNow ? body.settledAt : undefined,
      },
      {
        created_by: me.$id,
        updated_by: me.$id,
        origin_type: body.origin_type || 'manual',
        origin_id: body.origin_id || '',
      }
    );

    const forDb = financeTxDocumentWithOptionals(payload);
    let doc;
    try {
      doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), forDb, [
        Permission.read(Role.users()),
        Permission.update(Role.users()),
      ]);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/unknown attribute/i.test(msg)) throw e;
      const lean = stripUnknownFinanceTxAttrs(payload);
      doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), lean, [
        Permission.read(Role.users()),
        Permission.update(Role.users()),
      ]);
    }

    await recordFinancialAudit({
      action: 'tx_create',
      payment_id: doc.$id,
      academy_id: academyId,
      user_id: me.$id,
      amount: payload.gross,
      previous_status: '',
      new_status: payload.status,
    });

    const mapped = mapFinanceTxDoc(doc);
    if (mapped?.is_recurrence_template && mapped.recurrence_type && mapped.recurrence_type !== 'none') {
      await recordAcademyEvent({
        event_type: FINANCE_RECURRENCE_EVENT_TYPES.CREATED,
        academy_id: academyId,
        actor_user_id: me.$id,
        actor_name: String(me.name || me.email || '').slice(0, 128),
        template_id: doc.$id,
        tx_id: doc.$id,
        target_id: doc.$id,
        amount: payload.gross,
        category: financeCategoryLabelFromDoc(doc),
        timestamp: new Date().toISOString(),
      });
    }
    if (mapped?.status === 'settled') {
      void applyAccountingSideEffectsAutoServer(
        {
          ...mapped,
          competence_month: doc.competence_month,
          category: financeCategoryLabelFromDoc(doc),
        },
        academyId
      );
    }
    return json(res, 200, { ok: true, transaction: mapped });
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message || 'Erro ao criar lançamento' });
  }
}

export async function handlePatchFinanceTx(req, res, academyId, me, academyDoc, role) {
  const txId = String(req.query.id || '').trim();
  if (!txId) return json(res, 400, { ok: false, error: 'id_required' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const action = String(body.action || '').trim();

  let prev;
  try {
    prev = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, txId);
  } catch {
    return json(res, 404, { ok: false, error: 'not_found' });
  }
  if (String(prev.academyId || '') !== String(academyId)) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const prevStatus = String(prev.status || '').toLowerCase();

  if (action === 'cancel_recurrence') {
    if (!role.isAdmin) {
      return json(res, 403, { ok: false, error: 'Apenas titular ou administrador pode cancelar recorrência' });
    }
    if (prev.is_recurrence_template !== true) {
      return json(res, 400, { ok: false, error: 'not_recurrence_template' });
    }
    const doc = await databases.updateDocument(
      DB_ID,
      FINANCIAL_TX_COL,
      txId,
      financeTxOptionalPatchForAppwrite({
        recurrence_type: 'none',
        is_recurrence_template: false,
      })
    );
    await recordAcademyEvent({
      event_type: FINANCE_RECURRENCE_EVENT_TYPES.CANCELLED,
      academy_id: academyId,
      actor_user_id: me.$id,
      actor_name: String(me.name || me.email || '').slice(0, 128),
      template_id: txId,
      tx_id: txId,
      target_id: txId,
      amount: prev.gross,
      category: prev.category,
      timestamp: new Date().toISOString(),
    });
    return json(res, 200, { ok: true, transaction: mapFinanceTxDoc(doc) });
  }

  if (action === 'update_recurrence') {
    if (!role.isAdmin) {
      return json(res, 403, { ok: false, error: 'Apenas titular ou administrador pode editar recorrência' });
    }
    if (prev.is_recurrence_template !== true) {
      return json(res, 400, { ok: false, error: 'not_recurrence_template' });
    }
    const type = normalizeRecurrenceType(body.recurrence_type);
    if (type === 'none') {
      return json(res, 400, { ok: false, error: 'invalid_recurrence_type' });
    }
    const patch = financeTxOptionalPatchForAppwrite({
      recurrence_type: type,
      recurrence_day: normalizeRecurrenceDay(type, body.recurrence_day),
      is_recurrence_template: true,
      recurrence_end: parseRecurrenceEnd(body.recurrence_end) || '',
    });
    try {
      const doc = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, patch);
      return json(res, 200, { ok: true, transaction: mapFinanceTxDoc(doc) });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message || 'Erro ao atualizar recorrência' });
    }
  }

  if (action === 'settle') {
    if (prevStatus === 'settled') {
      return json(res, 400, { ok: false, error: 'already_settled' });
    }
    if (prevStatus === 'cancelled') {
      return json(res, 400, { ok: false, error: 'cannot_settle_cancelled' });
    }
    const now = new Date().toISOString();
    try {
      const doc = await databases.updateDocument(
        DB_ID,
        FINANCIAL_TX_COL,
        txId,
        financeTxDocumentForAppwrite({ status: 'settled', settledAt: now })
      );
      const mapped = mapFinanceTxDoc(doc);
      if (mapped) void applyAccountingSideEffectsAutoServer(mapped, academyId);
      await recordFinancialAudit({
        action: 'tx_settle',
        payment_id: txId,
        academy_id: academyId,
        user_id: me.$id,
        amount: prev.gross,
        previous_status: prevStatus,
        new_status: 'settled',
      });
      return json(res, 200, { ok: true, transaction: mapped, settledAt: now });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message || 'Erro ao liquidar' });
    }
  }

  if (action === 'cancel') {
    if (!role.isAdmin) {
      return json(res, 403, { ok: false, error: 'Apenas titular ou administrador pode cancelar' });
    }
    if (prevStatus === 'cancelled') {
      return json(res, 200, { ok: true, transaction: mapFinanceTxDoc(prev) });
    }
    const doc = await databases.updateDocument(
      DB_ID,
      FINANCIAL_TX_COL,
      txId,
      financeTxDocumentForAppwrite({ status: 'cancelled', settledAt: '' })
    );
    await recordFinancialAudit({
      action: 'tx_cancel',
      payment_id: txId,
      academy_id: academyId,
      user_id: me.$id,
      amount: prev.gross,
      previous_status: prevStatus,
      new_status: 'cancelled',
    });
    return json(res, 200, { ok: true, transaction: mapFinanceTxDoc(doc) });
  }

  if (prevStatus === 'settled') {
    return json(res, 400, {
      ok: false,
      error: 'Não é possível alterar valor após liquidação. Cancele e crie um novo lançamento.',
    });
  }

  if (!role.isAdmin && isExpenseType(prev.type)) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  try {
    const patch = buildFinanceTxPayload(
      {
        ...body,
        academyId,
        type: body.type || prev.type,
        status: prev.status,
        saleId: body.saleId ?? prev.saleId,
        lead_id: body.lead_id ?? prev.lead_id,
      },
      {
        updated_by: me.$id,
        origin_type: prev.origin_type || body.origin_type || 'manual',
        origin_id: prev.origin_id || body.origin_id || '',
        created_by: prev.created_by || me.$id,
      }
    );
    delete patch.created_by;
    const forDb = financeTxDocumentWithOptionals(patch);
    let doc;
    try {
      doc = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, forDb);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/unknown attribute/i.test(msg)) throw e;
      const lean = stripUnknownFinanceTxAttrs(patch);
      doc = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, lean);
    }
    await recordFinancialAudit({
      action: 'tx_edit',
      payment_id: txId,
      academy_id: academyId,
      user_id: me.$id,
      amount: patch.gross,
      previous_status: prevStatus,
      new_status: String(patch.status),
    });
    return json(res, 200, { ok: true, transaction: mapFinanceTxDoc(doc) });
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message || 'Erro ao atualizar' });
  }
}

export default async function financeTxHandler(req, res) {
  if (!FINANCIAL_TX_COL || !DB_ID) {
    return json(res, 503, { ok: false, error: 'financial_tx_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;
  const role = await resolveRole(req, res, me, academyDoc);
  if (!role) return;

  if (req.method === 'GET') return handleListFinanceTx(req, res, academyId);
  if (req.method === 'POST') return handleCreateFinanceTx(req, res, academyId, me, academyDoc, role);
  if (req.method === 'PATCH') return handlePatchFinanceTx(req, res, academyId, me, academyDoc, role);

  return json(res, 405, { ok: false, error: 'method_not_allowed' });
}

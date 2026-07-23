/**
 * GET/POST/PATCH /api/finance-tx — lançamentos do Caixa.
 * RBAC: member registra entrada, liquida recebimentos e contas a pagar; owner/admin despesa manual, cancelar e editar pendente.
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
import { logApiError } from './friendlyError.js';
import { createDocumentResilient, updateDocumentResilient } from './appwriteSchemaResilient.js';
import {
  buildFinanceTxPayload,
  financeTxDocumentForAppwrite,
  financeTxDocumentWithOptionals,
  financeTxOptionalPatchForAppwrite,
  financeTxMetadataNormalizationPatch,
  mapFinanceTxDoc,
  stripUnknownFinanceTxAttrs,
  financeCategoryLabelFromDoc,
  isExpenseType,
  txDirection,
  normalizeRecurrenceType,
  normalizeRecurrenceDay,
  parseRecurrenceEnd,
  validateManualFinanceTxIdentity,
} from './financeTxFields.js';
import { recordAcademyEvent, FINANCE_RECURRENCE_EVENT_TYPES } from './academyEvents.js';
import { listFinancialTxPage } from './financeTxQuery.js';
import { reverseSettledFinanceTx, cancelLinkedReversalsForTxIds } from './financeTxReverse.js';
import { canEditSettledTxValueInPlace } from './financeTxReversalIntegrity.js';
import {
  assignBankAccountEligibilityError,
  buildAssignBankAccountPatch,
  canAssignBankAccountRole,
  currentBankAccountLabel,
} from './financeTxAssignBankAccount.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { validateBankAccountForPayment } from '../../src/lib/bankAccounts.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import {
  enrichTransactionsWithLeadNames,
  enrichTransactionWithLeadName,
} from './financeTxLeadEnrichment.js';
import { notifyFinanceHubDataChanged } from './financeHubServerInvalidate.js';
import { ensureInitialPayableInstance, resolvePayableInstanceForSettle } from './financeRecurrenceInstance.js';
import {
  recurrenceTemplateSettleError,
  validateNotSettledRecurrenceTemplate,
} from './financeRecurrenceGuard.js';
import { FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE } from '../constants.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

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

async function mapAndEnrichTx(doc, academyId) {
  const mapped = mapFinanceTxDoc(doc);
  if (!mapped) return null;
  return enrichTransactionWithLeadName(databases, academyId, mapped);
}

export async function handleListFinanceTx(req, res, academyId) {
  const txId = String(req.query.id || '').trim();
  if (txId) {
    if (!FINANCIAL_TX_COL) return json(res, 503, { ok: false, error: 'not_configured' });
    try {
      const doc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, txId);
      if (String(doc.academyId || doc.academy_id || '') !== String(academyId)) {
        return json(res, 404, { ok: false, error: 'not_found' });
      }
      const transaction = await mapAndEnrichTx(doc, academyId);
      if (!transaction) return json(res, 404, { ok: false, error: 'not_found' });
      return json(res, 200, {
        ok: true,
        transaction,
        transactions: [transaction],
        total: 1,
        hasMore: false,
        nextCursor: null,
        truncated: false,
      });
    } catch {
      return json(res, 404, { ok: false, error: 'not_found' });
    }
  }

  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const regimeRaw = String(req.query.regime || FINANCE_REGIME.CASH).toLowerCase();
  const regime =
    regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;

  const cursor = String(req.query.cursor || '').trim();
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
  const direction = String(req.query.direction || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim().toLowerCase();

  const page = await listFinancialTxPage(academyId, {
    from,
    to,
    regime,
    cursor,
    limit,
    direction: direction === 'in' || direction === 'out' ? direction : '',
    status: status === 'settled' ? status : '',
  });
  const transactions = await enrichTransactionsWithLeadNames(
    databases,
    academyId,
    page.transactions || []
  );

  return json(res, 200, {
    ok: true,
    transactions,
    total: page.total,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
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

  const templateSettleErr = validateNotSettledRecurrenceTemplate(body);
  if (templateSettleErr) {
    return json(res, 400, { ok: false, error: FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE });
  }

  const identityError = validateManualFinanceTxIdentity(
    { ...body, status },
    { origin_type: body.origin_type || 'manual' }
  );
  if (identityError) {
    return json(res, 400, { ok: false, error: identityError });
  }

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
    const doc = await createDocumentResilient(
      databases,
      DB_ID,
      FINANCIAL_TX_COL,
      ID.unique(),
      forDb,
      [Permission.read(Role.users()), Permission.update(Role.users())]
    );

    await recordFinancialAudit({
      action: 'tx_create',
      payment_id: doc.$id,
      academy_id: academyId,
      user_id: me.$id,
      amount: payload.gross,
      previous_status: '',
      new_status: payload.status,
    });

    const mapped = await mapAndEnrichTx(doc, academyId);
    if (mapped?.is_recurrence_template && mapped.recurrence_type && mapped.recurrence_type !== 'none') {
      try {
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
      } catch (e) {
        logApiError('finance-tx recurrence event', e);
      }
      if (txDirection(mapped) === 'out' || isExpenseType(mapped.type)) {
        try {
          const inst = await ensureInitialPayableInstance(databases, DB_ID, FINANCIAL_TX_COL, doc);
          if (inst.created) notifyFinanceHubDataChanged(academyId);
        } catch (e) {
          logApiError('finance-tx recurrence initial instance', e);
        }
      }
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
    notifyFinanceHubDataChanged(academyId);
    return json(res, 200, { ok: true, transaction: mapped });
  } catch (e) {
    logApiError('finance-tx create', e);
    const msg = String(e?.message || '').trim();
    if (msg === 'valor_invalido' || msg === 'valor_acima_do_limite') {
      return json(res, 400, { ok: false, error: msg });
    }
    if (msg === 'cannot_settle_recurrence_template') {
      return json(res, 400, { ok: false, error: FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE });
    }
    if (msg === 'create_document_schema_incompatible') {
      return json(res, 400, { ok: false, error: 'schema_incompatible' });
    }
    if (msg.startsWith('finance_tx_type_too_long:')) {
      return json(res, 400, { ok: false, error: 'schema_incompatible' });
    }
    return json(res, 400, { ok: false, error: 'create_failed' });
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
    notifyFinanceHubDataChanged(academyId);
    return json(res, 200, { ok: true, transaction: await mapAndEnrichTx(doc, academyId) });
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
      notifyFinanceHubDataChanged(academyId);
      return json(res, 200, { ok: true, transaction: await mapAndEnrichTx(doc, academyId) });
    } catch (e) {
      logApiError('finance-tx update_recurrence', e);
      return json(res, 400, { ok: false, error: 'save_failed' });
    }
  }

  if (action === 'settle' || action === 'settle_payable_from_template') {
    let settleDoc = prev;
    let settleTxId = txId;

    if (action === 'settle') {
      const templateErr = recurrenceTemplateSettleError(prev);
      if (templateErr) {
        return json(res, 400, { ok: false, error: FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE });
      }
    } else if (action === 'settle_payable_from_template') {
      if (prev.is_recurrence_template !== true) {
        return json(res, 400, { ok: false, error: 'not_recurrence_template' });
      }
      try {
        const dueYmd = String(body.payable_due_date || body.due_date || prev.due_date || '').slice(0, 10);
        settleDoc = await resolvePayableInstanceForSettle(
          databases,
          DB_ID,
          FINANCIAL_TX_COL,
          prev,
          dueYmd
        );
        settleTxId = settleDoc.$id;
        notifyFinanceHubDataChanged(academyId);
      } catch (e) {
        const code = String(e?.message || '').trim();
        if (code === 'invalid_due_date') {
          return json(res, 400, { ok: false, error: 'Informe a data de vencimento da conta.' });
        }
        if (code === 'already_settled') {
          return json(res, 400, { ok: false, error: 'already_settled' });
        }
        if (code === 'cannot_settle_cancelled') {
          return json(res, 400, { ok: false, error: 'cannot_settle_cancelled' });
        }
        logApiError('finance-tx settle_payable_from_template', e);
        return json(res, 400, { ok: false, error: 'save_failed' });
      }
      const instanceErr = recurrenceTemplateSettleError(settleDoc);
      if (instanceErr) {
        return json(res, 400, { ok: false, error: FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE });
      }
    }

    const settleStatus = String(settleDoc.status || '').toLowerCase();
    if (settleStatus === 'settled') {
      return json(res, 400, { ok: false, error: 'already_settled' });
    }
    if (settleStatus === 'cancelled') {
      return json(res, 400, { ok: false, error: 'cannot_settle_cancelled' });
    }
    const now = body.settledAt || new Date().toISOString();
    const settlePatch = { status: 'settled', settledAt: now };
    if (body.gross != null && body.gross !== '') {
      const g = Number(body.gross);
      if (Number.isFinite(g) && g > 0) settlePatch.gross = g;
    }
    if (body.method) settlePatch.method = body.method;
    if (body.bank_account) settlePatch.bank_account = body.bank_account;
    if (body.direction) settlePatch.direction = body.direction;
    try {
      const doc = await updateDocumentResilient(
        databases,
        DB_ID,
        FINANCIAL_TX_COL,
        settleTxId,
        financeTxDocumentWithOptionals(settlePatch)
      );
      const mapped = await mapAndEnrichTx(doc, academyId);
      if (mapped) void applyAccountingSideEffectsAutoServer(mapped, academyId);
      await recordFinancialAudit({
        action: 'tx_settle',
        payment_id: settleTxId,
        academy_id: academyId,
        user_id: me.$id,
        amount: settleDoc.gross,
        previous_status: settleStatus,
        new_status: 'settled',
      });
      notifyFinanceHubDataChanged(academyId);
      return json(res, 200, { ok: true, transaction: mapped, settledAt: now });
    } catch (e) {
      logApiError('finance-tx settle', e);
      return json(res, 400, { ok: false, error: 'save_failed' });
    }
  }

  if (action === 'reverse') {
    if (!role.isAdmin) {
      return json(res, 403, { ok: false, error: 'Apenas titular ou administrador pode estornar' });
    }
    try {
      const reason = String(body.reason || body.note || '').trim();
      const { original, reversal } = await reverseSettledFinanceTx({
        prevDoc: prev,
        academyId,
        me,
        reason,
      });
      notifyFinanceHubDataChanged(academyId);
      return json(res, 200, {
        ok: true,
        transaction: original,
        reversal,
      });
    } catch (e) {
      logApiError('finance-tx reverse', e);
      const code = String(e?.message || '').trim();
      const known = [
        'only_settled_can_reverse',
        'already_reversed',
        'cannot_reverse_reversal',
        'cannot_reverse_recurrence_template',
        'already_cancelled',
      ];
      return json(res, 400, { ok: false, error: known.includes(code) ? code : 'save_failed' });
    }
  }

  if (action === 'assign_bank_account') {
    const eligibility = assignBankAccountEligibilityError(prev);
    if (eligibility) return json(res, 400, { ok: false, error: eligibility });
    if (!canAssignBankAccountRole(prev, role.isAdmin)) {
      return json(res, 403, { ok: false, error: 'forbidden' });
    }

    const financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc || {});
    const requested = String(body.bank_account || body.bankAccount || '').trim();
    const accountCheck = validateBankAccountForPayment(requested, financeConfig);
    if (!accountCheck.ok) {
      return json(res, 400, { ok: false, error: accountCheck.message || 'invalid_bank_account' });
    }

    const nextAccount = accountCheck.account || requested;
    if (currentBankAccountLabel(prev) === nextAccount) {
      return json(res, 200, { ok: true, transaction: await mapAndEnrichTx(prev, academyId) });
    }

    try {
      const patch = buildAssignBankAccountPatch(prev, nextAccount);
      let doc;
      try {
        doc = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, patch);
      } catch (e) {
        const msg = String(e?.message || '');
        if (!/unknown attribute/i.test(msg)) throw e;
        const { bank_account: _drop, ...lean } = patch;
        doc = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, lean);
      }

      const originType = String(prev.origin_type || '').toLowerCase();
      const paymentId = String(prev.origin_id || '').trim();
      if (originType === 'student_payment' && paymentId && PAYMENTS_COL) {
        try {
          await databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, { account: nextAccount });
        } catch (e) {
          console.error(
            JSON.stringify({
              event: 'assign_bank_payment_sync_failed',
              payment_id: paymentId,
              tx_id: txId,
              error: e?.message || String(e),
            })
          );
        }
      }

      await recordFinancialAudit({
        action: 'tx_assign_bank',
        payment_id: txId,
        academy_id: academyId,
        user_id: me.$id,
        amount: prev.gross,
        previous_status: prevStatus,
        new_status: prevStatus,
      });

      notifyFinanceHubDataChanged(academyId);
      return json(res, 200, { ok: true, transaction: await mapAndEnrichTx(doc, academyId) });
    } catch (e) {
      logApiError('finance-tx assign_bank', e);
      return json(res, 400, { ok: false, error: 'save_failed' });
    }
  }

  if (action === 'cancel') {
    if (!role.isAdmin) {
      return json(res, 403, { ok: false, error: 'Apenas titular ou administrador pode cancelar' });
    }
    if (prevStatus === 'settled') {
      return json(res, 400, { ok: false, error: 'cannot_cancel_settled' });
    }
    if (prevStatus === 'cancelled') {
      return json(res, 200, { ok: true, transaction: await mapAndEnrichTx(prev, academyId) });
    }
    const doc = await databases.updateDocument(
      DB_ID,
      FINANCIAL_TX_COL,
      txId,
      financeTxDocumentForAppwrite({ status: 'cancelled', settledAt: '' })
    );
    const cascade = await cancelLinkedReversalsForTxIds([txId]);
    if (cascade.errors?.length) {
      console.warn('[finance-tx cancel] reversal cascade:', txId, cascade.errors);
    }
    await recordFinancialAudit({
      action: 'tx_cancel',
      payment_id: txId,
      academy_id: academyId,
      user_id: me.$id,
      amount: prev.gross,
      previous_status: prevStatus,
      new_status: 'cancelled',
    });
    notifyFinanceHubDataChanged(academyId);
    return json(res, 200, { ok: true, transaction: await mapAndEnrichTx(doc, academyId) });
  }

  if (prevStatus === 'settled') {
    const wantsValueEdit =
      (body.gross != null || body.fee != null || body.net != null) &&
      canEditSettledTxValueInPlace(prev);
    if (!wantsValueEdit) {
      return json(res, 400, {
        ok: false,
        error: 'Não é possível alterar valor após liquidação. Cancele e crie um novo lançamento.',
      });
    }
  }

  if (!role.isAdmin && isExpenseType(prev.type)) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const prevMapped = mapFinanceTxDoc(prev);
  const identityError = validateManualFinanceTxIdentity(
    {
      ...prevMapped,
      ...body,
      type: body.type || prev.type,
      direction: body.direction ?? prevMapped?.direction ?? prev.direction,
      planName: body.planName ?? prev.planName,
      note: body.note ?? prev.note,
    },
    { origin_type: prev.origin_type || body.origin_type || 'manual' }
  );
  if (identityError) {
    return json(res, 400, { ok: false, error: identityError });
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
    const metaNorm = financeTxMetadataNormalizationPatch(prev);
    if (metaNorm) Object.assign(forDb, metaNorm);
    let doc;
    try {
      doc = await updateDocumentResilient(databases, DB_ID, FINANCIAL_TX_COL, txId, forDb);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/unknown attribute/i.test(msg)) throw e;
      const lean = stripUnknownFinanceTxAttrs(patch);
      doc = await updateDocumentResilient(databases, DB_ID, FINANCIAL_TX_COL, txId, lean);
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
    notifyFinanceHubDataChanged(academyId);
    return json(res, 200, { ok: true, transaction: await mapAndEnrichTx(doc, academyId) });
  } catch (e) {
    logApiError('finance-tx update', e);
    return json(res, 400, { ok: false, error: 'save_failed' });
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

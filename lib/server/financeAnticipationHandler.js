/**
 * POST /api/finance?route=anticipate
 * Registra taxa de antecipação vinculada a um FINANCIAL_TX de entrada liquidado.
 */
import { Query, ID } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  DB_ID,
  databases,
} from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import {
  computeAnticipationFee,
  isAcquirerFeeEligibleMethod,
} from '../../src/lib/acquirerFees.js';
import { resolveAcquirerFeesForAccount } from '../../src/lib/resolveAcquirerFees.js';
import { canonicalPaymentMethodKey } from '../../src/lib/paymentMethods.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { competenceMonthFromIso } from '../../src/lib/financeCompetence.js';
import {
  buildFinanceTxPayload,
  financeTxDocumentWithOptionals,
  financeBankAccountFromDoc,
  mapFinanceTxDoc,
  stripUnknownFinanceTxAttrs,
  txDirection,
} from './financeTxFields.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import { invalidateFinanceForecastCache } from './financeForecastHandler.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

function json(res, status, body) {
  res.status(status).json(body);
}

async function readJsonBody(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

export function anticipationEligibilityError(doc, { hasChild = false } = {}) {
  const mapped = mapFinanceTxDoc(doc);
  if (!mapped) return 'not_found';
  if (String(mapped.status || '').toLowerCase() !== 'settled') return 'only_settled';
  if (txDirection(mapped) !== 'in') return 'only_inflow';
  const originType = String(mapped.origin_type || '').toLowerCase();
  if (originType === 'anticipation_fee' || originType === 'reversal') return 'invalid_origin';
  const methodKey = canonicalPaymentMethodKey(mapped.method);
  if (!isAcquirerFeeEligibleMethod(methodKey)) return 'method_not_eligible';
  if (hasChild) return 'already_anticipated';
  return '';
}

async function anticipationChildExists(academyId, parentTxId) {
  if (!FINANCIAL_TX_COL || !parentTxId) return false;
  try {
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
      Query.equal('academyId', academyId),
      Query.equal('origin_id', String(parentTxId)),
      Query.limit(5),
    ]);
    return (res.documents || []).some(
      (d) => String(d.origin_type || '').toLowerCase() === 'anticipation_fee'
    );
  } catch {
    return false;
  }
}

async function createAnticipationDocument(input, me) {
  const payload = buildFinanceTxPayload(input, {
    created_by: me.$id,
    updated_by: me.$id,
    origin_type: 'anticipation_fee',
    origin_id: input.origin_id,
  });
  payload.direction = 'out';
  const forDb = financeTxDocumentWithOptionals(payload);
  try {
    return await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), forDb, []);
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/unknown attribute/i.test(msg)) throw e;
    return databases.createDocument(
      DB_ID,
      FINANCIAL_TX_COL,
      ID.unique(),
      stripUnknownFinanceTxAttrs(payload),
      []
    );
  }
}

export default async function financeAnticipationHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const isAdmin = await isAcademyOwnerOrAdminUser(academyDoc, me);
  if (!isAdmin) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { ok: false, error: 'invalid_json' });

  const txId = String(body.tx_id || body.txId || '').trim();
  if (!txId) return json(res, 400, { ok: false, error: 'tx_id_required' });
  if (!FINANCIAL_TX_COL) return json(res, 500, { ok: false, error: 'config_missing' });

  let parentDoc;
  try {
    parentDoc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, txId);
  } catch {
    return json(res, 404, { ok: false, error: 'not_found' });
  }
  if (String(parentDoc.academyId || '') !== String(academyId)) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const hasChild = await anticipationChildExists(academyId, txId);
  const eligibility = anticipationEligibilityError(parentDoc, { hasChild });
  if (eligibility) return json(res, 400, { ok: false, error: eligibility });

  const parent = mapFinanceTxDoc(parentDoc);
  const financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc || {});
  const netBase = Math.abs(Number(parent.net) || Number(parent.gross) || 0);
  const feeRaw = body.fee_amount ?? body.feeAmount;
  const bank = financeBankAccountFromDoc(parentDoc);
  const accountFees = resolveAcquirerFeesForAccount(financeConfig, bank);
  let feeAmount = Number(feeRaw);
  if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
    feeAmount = computeAnticipationFee(netBase, accountFees);
  }
  feeAmount = Math.round(feeAmount * 100) / 100;
  if (feeAmount < 0.01) {
    return json(res, 400, { ok: false, error: 'anticipation_fee_required' });
  }
  if (feeAmount > netBase) {
    return json(res, 400, { ok: false, error: 'fee_exceeds_net' });
  }

  const settledAt = String(body.settled_at || body.settledAt || '').trim() || new Date().toISOString();
  const shortRef = String(parent.id || '').slice(-6);
  const note = String(body.note || '').trim() || `Antecipação · ref …${shortRef}`;

  const childInput = {
    academyId,
    saleId: parent.saleId || '',
    lead_id: parent.lead_id || '',
    method: parent.method || 'pix',
    installments: parent.installments || 1,
    type: FINANCE_CATEGORIES.TAXA_CARTAO.type,
    category: FINANCE_CATEGORIES.TAXA_CARTAO.label,
    competence_month: parent.competence_month || competenceMonthFromIso(settledAt),
    planName: note,
    gross: feeAmount,
    fee: 0,
    status: 'settled',
    settledAt,
    note,
    origin_type: 'anticipation_fee',
    origin_id: parent.id,
    bank_account: bank,
  };

  const childDoc = await createAnticipationDocument(childInput, me);
  const childMapped = mapFinanceTxDoc(childDoc);

  try {
    await applyAccountingSideEffectsAutoServer(childMapped, academyId);
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_anticipation_journal_error',
      academyId,
      txId,
      error: e?.message || String(e),
    }));
  }

  await recordFinancialAudit({
    academy_id: academyId,
    user_id: me.$id,
    action: 'anticipation_fee',
    amount: feeAmount,
    meta: { parent_tx_id: parent.id, anticipation_tx_id: childMapped?.id },
  });

  invalidateFinanceForecastCache(academyId);

  return json(res, 200, {
    ok: true,
    parent_tx_id: parent.id,
    anticipation_tx: childMapped,
  });
}

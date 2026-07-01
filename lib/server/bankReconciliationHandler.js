/**
 * Conciliação bancária — extratos e matching.
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  DB_ID,
  databases,
} from './academyAccess.js';
import {
  mapFinanceTxDoc,
  buildFinanceTxPayload,
  financeTxDocumentForAppwrite,
  financeTxDocumentWithOptionals,
} from './financeTxFields.js';
import { matchBankItemsToTransactions, txEligibleForStatementBank } from './bankReconciliationMatcher.js';
import { buildPagbankChargeIdToTxIdMap } from './bankReconciliationGatewayMatch.js';
import { RECONCILIATION_METHOD_MANUAL } from '../../src/lib/bankGatewayMatch.js';
import {
  buildImportMetricsSnapshot,
  buildMatchConfirmedMetrics,
  buildStatementCompletionMetrics,
  RECON_METRIC_EVENT,
} from '../../src/lib/bankReconciliationMetrics.js';
import {
  listReconciliationMetrics,
  recordReconciliationMetric,
} from './bankReconciliationMetricsStore.js';
import { loadPayerContextByLeadIds } from './studentPayerContext.js';
import { parsePayerAliasesJson, serializePayerAliases } from '../../src/lib/studentPayerAliases.js';
import {
  buildLearnPayerPayload,
  rememberPayerAliasForStudent,
} from './studentPayerAliasServer.js';
import {
  buildDedupIndex,
  classifyImportItem,
  DEDUP_SOURCE_STATUSES,
  statementPeriodsOverlap,
} from './bankStatementDedup.js';
import {
  fetchAndValidateTxForReconciliation,
  reconciliationNoteWithJustification,
} from './bankReconciliationValidation.js';
import { recordAcademyEvent, BANK_RECONCILIATION_EVENT_TYPES } from './academyEvents.js';
import { computeBankBalanceProof } from './bankBalanceProof.js';
import { loadAccounts } from './financeJournalServer.js';
import { resolveFinanceCategory } from '../../src/lib/financeCategories.js';
import { enrichTransactionsWithLeadNames } from './financeTxLeadEnrichment.js';
import { buildPendingPaymentHintsByItemId } from './bankReconPendingPaymentHints.js';
import { enrichUnmatchedTxForReconSearch } from './bankReconTxSearchKeywords.js';
import { registerReconPayment } from './bankReconRegisterPayment.js';
import {
  collectRulesAppliedInStatement,
  isAutoSuggestPayerRuleMatch,
  listReconPayerRules,
} from './bankReconPayerRules.js';
import { buildClosingHintsForStatement } from './bankReconClosingHints.js';
import { updateDocumentResilient } from './appwriteSchemaResilient.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const BANK_STATEMENTS_COL =
  process.env.VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID ||
  process.env.BANK_STATEMENTS_COL ||
  '';
const BANK_STATEMENT_ITEMS_COL =
  process.env.VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID ||
  process.env.BANK_STATEMENT_ITEMS_COL ||
  '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

function json(res, status, body) {
  res.status(status).json(body);
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function defaultPerms() {
  return [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
}

async function requireOwner(req, res, me, academyDoc) {
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;
  const isOwner = await isAcademyOwnerOrAdminUser(academyDoc, me);
  if (!isOwner) {
    json(res, 403, { ok: false, error: 'owner_only' });
    return null;
  }
  return access;
}

async function listTxForMatching(academyId, periodStart, periodEnd) {
  if (!FINANCIAL_TX_COL) return [];
  const padStart = `${periodStart}T00:00:00.000Z`;
  const padEnd = `${periodEnd}T23:59:59.999Z`;
  const docs = [];
  const PAGE = 100;
  let cursor = null;
  for (let i = 0; i < 30; i += 1) {
    const q = [
      Query.equal('academyId', academyId),
      Query.equal('status', ['settled']),
      Query.greaterThanEqual('settledAt', padStart),
      Query.lessThanEqual('settledAt', padEnd),
      Query.limit(PAGE),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    const batch = res.documents || [];
    docs.push(...batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1]?.$id;
  }

  const mapped = docs
    .map((d) => ({
      ...mapFinanceTxDoc(d),
      reconciled: d.reconciled === true,
      reconciled_at: d.reconciled_at || '',
      bank_statement_id: d.bank_statement_id || '',
    }))
    .filter(Boolean);

  return enrichTransactionsWithLeadNames(databases, academyId, mapped);
}

function collectReferencedTxIds(items, knownIds) {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
  const needed = new Set();
  for (const item of items || []) {
    for (const id of [item.suggested_tx_id, item.matched_tx_id]) {
      const tid = String(id || '').trim();
      if (tid && !known.has(tid)) needed.add(tid);
    }
    for (const c of item.suggested_tx_candidates || []) {
      const tid = String(c.tx_id || '').trim();
      if (tid && !known.has(tid)) needed.add(tid);
    }
  }
  return needed;
}

async function appendReferencedTxsForDetail(databases, academyId, naviTx, items) {
  const known = new Set((naviTx || []).map((t) => t.id));
  const needed = collectReferencedTxIds(items, known);
  if (!needed.size || !FINANCIAL_TX_COL) return naviTx;

  const extras = [];
  for (const id of needed) {
    try {
      const doc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, id);
      if (String(doc.academyId || '') !== String(academyId || '')) continue;
      const mapped = mapFinanceTxDoc(doc);
      if (!mapped) continue;
      extras.push({
        ...mapped,
        reconciled: doc.reconciled === true,
        reconciled_at: doc.reconciled_at || '',
        bank_statement_id: doc.bank_statement_id || '',
      });
    } catch {
      void 0;
    }
  }
  if (!extras.length) return naviTx;
  const merged = [...naviTx];
  for (const tx of extras) {
    if (!known.has(tx.id)) merged.push(tx);
  }
  return enrichTransactionsWithLeadNames(databases, academyId, merged);
}

async function payerContextForTransactions(academyId, transactions) {
  const leadIds = (transactions || [])
    .map((t) => String(t.lead_id || '').trim())
    .filter(Boolean);
  return loadPayerContextByLeadIds(databases, academyId, leadIds);
}

function mapStatementItemDoc(d) {
  let suggested_tx_candidates = null;
  const rawCandidates = d.suggested_candidates_json || d.suggestedCandidatesJson;
  if (rawCandidates) {
    try {
      const parsed = typeof rawCandidates === 'string' ? JSON.parse(rawCandidates) : rawCandidates;
      if (Array.isArray(parsed)) suggested_tx_candidates = parsed;
    } catch {
      void 0;
    }
  }
  return {
    id: d.$id,
    date: d.date || '',
    description: d.description || '',
    amount: round2(d.amount),
    direction: d.direction || 'credit',
    matched_tx_id: d.matched_tx_id || null,
    suggested_tx_id: d.suggested_tx_id || null,
    match_score: Number(d.match_score) || 0,
    match_tier: d.match_tier || null,
    reconciliation_method: d.reconciliation_method || d.reconciliationMethod || null,
    gateway_charge_id: d.gateway_charge_id || d.gatewayChargeId || null,
    suggested_tx_candidates,
    status: d.status || 'unmatched',
    duplicate_of: d.duplicate_of || null,
    from_rule: d.from_rule === true,
  };
}

function resolveStatementBankAccount(statement, body = {}) {
  const fromBody = String(body.bank_account || body.bankAccount || '').trim();
  if (fromBody) return fromBody.slice(0, 128);
  return String(statement?.bank_account || statement?.bankAccount || '').trim().slice(0, 128);
}

async function markTxReconciled(txId, { statementId, userId, manual = false, prevDoc = null, justification = '' }) {
  const patch = {
    reconciled: true,
    reconciled_at: new Date().toISOString(),
    reconciled_by: String(userId || 'system').slice(0, 64),
    bank_statement_id: String(statementId || '').slice(0, 64),
    updated_at: new Date().toISOString(),
    updated_by: String(userId || 'system').slice(0, 64),
  };
  if (manual && justification) {
    const baseDoc = prevDoc || (await databases.getDocument(DB_ID, FINANCIAL_TX_COL, txId));
    const mergedNote = reconciliationNoteWithJustification(baseDoc, justification);
    if (mergedNote) {
      patch.note = mergedNote;
    }
  }
  return updateDocumentResilient(databases, DB_ID, FINANCIAL_TX_COL, txId, patch);
}

function matchedBankItemPatch(txId, { reconciliation_method = RECONCILIATION_METHOD_MANUAL } = {}) {
  const patch = {
    status: 'matched',
    matched_tx_id: txId,
    match_score: 100,
    suggested_tx_id: '',
  };
  if (reconciliation_method) {
    patch.reconciliation_method = String(reconciliation_method).slice(0, 32);
  }
  return patch;
}

async function updateBankStatementItem(docId, patch) {
  return updateDocumentResilient(databases, DB_ID, BANK_STATEMENT_ITEMS_COL, docId, patch);
}

function reconciliationThrowableResponse(e) {
  const detail = String(e?.message || e || '').trim();
  if (/invalid document structure/i.test(detail) || /unknown attribute/i.test(detail)) {
    return {
      status: 503,
      error: 'reconciliation_schema_incomplete',
      detail,
    };
  }
  return { status: 500, error: 'reconciliation_failed', detail };
}

function reconciliationErrorStatus(error) {
  if (error === 'forbidden') return 403;
  if (error === 'tx_not_found') return 404;
  return 400;
}

async function listOverlappingStatements(academyId, periodStart, periodEnd, excludeStatementId = '') {
  if (!BANK_STATEMENTS_COL) return [];
  const resList = await databases.listDocuments(DB_ID, BANK_STATEMENTS_COL, [
    Query.equal('academy_id', academyId),
    Query.orderDesc('import_date'),
    Query.limit(50),
  ]);
  return (resList.documents || []).filter((d) => {
    if (excludeStatementId && d.$id === excludeStatementId) return false;
    return statementPeriodsOverlap(periodStart, periodEnd, d.period_start, d.period_end);
  });
}

async function loadItemsForDedup(statementDocs) {
  const eligible = [];
  for (const stmt of statementDocs || []) {
    const itemsRes = await databases.listDocuments(DB_ID, BANK_STATEMENT_ITEMS_COL, [
      Query.equal('statement_id', stmt.$id),
      Query.limit(500),
    ]);
    const statementBank = stmt.bank_account || stmt.bankAccount || '';
    for (const d of itemsRes.documents || []) {
      if (!DEDUP_SOURCE_STATUSES.has(String(d.status || '').toLowerCase())) continue;
      eligible.push({
        id: d.$id,
        statement_id: stmt.$id,
        date: d.date,
        amount: d.amount,
        direction: d.direction,
        status: d.status,
        statement_bank: statementBank,
      });
    }
  }
  return eligible;
}

async function createBankStatementItem(statementId, m) {
  const it = m.item;
  const payload = {
    statement_id: statementId,
    date: it.date,
    description: it.description,
    amount: round2(it.amount),
    direction: it.direction,
    matched_tx_id: m.matched_tx_id || '',
    suggested_tx_id: m.suggested_tx_id || '',
    match_score: m.match_score || 0,
    status: m.status,
  };
  if (m.match_tier) payload.match_tier = String(m.match_tier).slice(0, 32);
  if (m.reconciliation_method) {
    payload.reconciliation_method = String(m.reconciliation_method).slice(0, 32);
  }
  if (m.gateway_charge_id) {
    payload.gateway_charge_id = String(m.gateway_charge_id).slice(0, 64);
  }
  if (m.suggested_tx_candidates?.length) {
    payload.suggested_candidates_json = JSON.stringify(m.suggested_tx_candidates).slice(0, 2048);
  }
  if (m.status === 'duplicate' && m.duplicate_of) {
    payload.duplicate_of = String(m.duplicate_of).slice(0, 64);
  }
  try {
    return await databases.createDocument(
      DB_ID,
      BANK_STATEMENT_ITEMS_COL,
      ID.unique(),
      payload,
      defaultPerms()
    );
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('Unknown attribute')) throw e;
    const lean = { ...payload };
    delete lean.duplicate_of;
    delete lean.match_tier;
    delete lean.reconciliation_method;
    delete lean.gateway_charge_id;
    delete lean.suggested_candidates_json;
    return databases.createDocument(DB_ID, BANK_STATEMENT_ITEMS_COL, ID.unique(), lean, defaultPerms());
  }
}

async function handleList(req, res, academyId) {
  if (!BANK_STATEMENTS_COL) return json(res, 503, { ok: false, error: 'not_configured' });
  const resList = await databases.listDocuments(DB_ID, BANK_STATEMENTS_COL, [
    Query.equal('academy_id', academyId),
    Query.orderDesc('import_date'),
    Query.limit(50),
  ]);
  const statements = (resList.documents || []).map((d) => ({
    id: d.$id,
    filename: d.filename || '',
    import_date: d.import_date || d.$createdAt,
    period_start: d.period_start || '',
    period_end: d.period_end || '',
    total_credit: round2(d.total_credit),
    total_debit: round2(d.total_debit),
    status: d.status || 'pending',
    source_format: d.source_format || '',
    parse_method: d.parse_method || '',
    bank_account: d.bank_account || d.bankAccount || '',
  }));
  return json(res, 200, { ok: true, statements });
}

async function handleDetail(req, res, academyId) {
  const statementId = String(req.query.statement_id || '').trim();
  if (!statementId || !BANK_STATEMENT_ITEMS_COL) {
    return json(res, 400, { ok: false, error: 'statement_id_required' });
  }

  const statement = await databases.getDocument(DB_ID, BANK_STATEMENTS_COL, statementId);
  if (String(statement.academy_id || '') !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const itemsRes = await databases.listDocuments(DB_ID, BANK_STATEMENT_ITEMS_COL, [
    Query.equal('statement_id', statementId),
    Query.limit(500),
  ]);

  const items = (itemsRes.documents || []).map(mapStatementItemDoc);

  let periodStart = statement.period_start || '';
  let periodEnd = statement.period_end || '';
  if (!periodStart || !periodEnd) {
    for (const item of items) {
      if (item.date) {
        if (!periodStart || item.date < periodStart) periodStart = item.date;
        if (!periodEnd || item.date > periodEnd) periodEnd = item.date;
      }
    }
  }

  const pendingHintsByItemId = await buildPendingPaymentHintsByItemId(
    databases,
    academyId,
    items,
    { period_start: periodStart, period_end: periodEnd }
  );
  const itemsWithHints = items.map((item) => {
    const hints = pendingHintsByItemId.get(item.id);
    return hints?.length ? { ...item, pending_payment_hints: hints } : item;
  });

  const naviTxRaw = periodStart && periodEnd ? await listTxForMatching(academyId, periodStart, periodEnd) : [];
  const naviTx = await appendReferencedTxsForDetail(databases, academyId, naviTxRaw, itemsWithHints);

  const matchedAmount = items
    .filter((i) => i.status === 'matched')
    .reduce((s, i) => s + i.amount, 0);
  const pendingItems = items.filter(
    (i) => i.status !== 'matched' && i.status !== 'ignored' && i.status !== 'duplicate'
  );
  const pendingAmount = pendingItems.reduce((s, i) => s + i.amount, 0);

  const naviUnmatchedRaw = naviTx.filter(
    (t) => !t.reconciled && !items.some((i) => i.matched_tx_id === t.id)
  );

  const statementBank = resolveStatementBankAccount(statement);
  const naviUnmatchedFiltered = statementBank
    ? naviUnmatchedRaw.filter((t) => txEligibleForStatementBank(statementBank, t))
    : naviUnmatchedRaw;

  const txById = new Map(naviTx.map((t) => [t.id, t]));
  const contextLeadIds = [
    ...naviUnmatchedFiltered.map((t) => String(t.lead_id || '').trim()),
    ...itemsWithHints.map((item) => {
      const tx = item.suggested_tx_id ? txById.get(item.suggested_tx_id) : null;
      return String(tx?.lead_id || '').trim();
    }),
  ].filter(Boolean);
  const payerContextByLeadId = await loadPayerContextByLeadIds(databases, academyId, contextLeadIds);

  const itemsEnriched = itemsWithHints.map((item) => {
    const tx = item.suggested_tx_id ? txById.get(item.suggested_tx_id) : null;
    const ctx = tx?.lead_id ? payerContextByLeadId.get(String(tx.lead_id)) : null;
    const from_rule = item.from_rule || isAutoSuggestPayerRuleMatch(item.description, ctx);
    return from_rule ? { ...item, from_rule: true } : item;
  });

  const naviUnmatched = enrichUnmatchedTxForReconSearch(naviUnmatchedFiltered, payerContextByLeadId);
  const rules_applied = collectRulesAppliedInStatement(itemsEnriched, payerContextByLeadId);

  const balanceProof = computeBankBalanceProof({
    statement: {
      total_credit: statement.total_credit,
      total_debit: statement.total_debit,
      bank_account: statement.bank_account || statement.bankAccount || '',
    },
    items: itemsEnriched,
    naviUnmatched,
  });

  let closingHints = null;
  if (statement.completed_at) {
    try {
      closingHints = await buildClosingHintsForStatement({
        academyId,
        periodStart: periodStart || statement.period_start || '',
        periodEnd: periodEnd || statement.period_end || '',
      });
    } catch (e) {
      console.error(
        JSON.stringify({
          event: 'bank_recon_closing_hints_error',
          academyId,
          statementId,
          error: e?.message || String(e),
        })
      );
    }
  }

  return json(res, 200, {
    ok: true,
    statement: {
      id: statement.$id,
      filename: statement.filename || '',
      import_date: statement.import_date || statement.$createdAt,
      period_start: statement.period_start || '',
      period_end: statement.period_end || '',
      total_credit: round2(statement.total_credit),
      total_debit: round2(statement.total_debit),
      status: statement.status || 'pending',
      completion_note: statement.completion_note || '',
      completed_at: statement.completed_at || '',
      bank_account: statement.bank_account || statement.bankAccount || '',
      source_format: statement.source_format || '',
      parse_method: statement.parse_method || '',
    },
    closingHints,
    items: itemsEnriched,
    navi_transactions: naviTx,
    navi_unmatched: naviUnmatched,
    rules_applied,
    summary: {
      reconciled_count: items.filter((i) => i.status === 'matched').length,
      reconciled_amount: round2(matchedAmount),
      pending_count: pendingItems.length,
      pending_amount: round2(pendingAmount),
      difference: round2(pendingAmount),
      balance_proof: balanceProof,
      balance_gap: balanceProof.balance_gap,
      navi_orphan_count: naviUnmatched.length,
    },
  });
}

async function handleImport(req, res, academyId, me) {
  if (!BANK_STATEMENTS_COL || !BANK_STATEMENT_ITEMS_COL) {
    return json(res, 503, { ok: false, error: 'not_configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const filename = String(body.filename || 'extrato').slice(0, 256);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return json(res, 400, { ok: false, error: 'items_required' });

  let period_start = body.period_start || items[0]?.date;
  let period_end = body.period_end || items[items.length - 1]?.date;
  for (const it of items) {
    if (it.date && it.date < period_start) period_start = it.date;
    if (it.date && it.date > period_end) period_end = it.date;
  }

  let total_credit = 0;
  let total_debit = 0;
  for (const it of items) {
    const amt = round2(it.amount);
    if (it.direction === 'credit') total_credit += amt;
    else total_debit += amt;
  }

  const bankAccount = String(body.bank_account || body.bankAccount || '').trim().slice(0, 128);
  const sourceFormat = String(body.source_format || '').trim().slice(0, 16);
  const parseMethod = String(body.parse_method || 'deterministic').trim().slice(0, 16);
  const parseWarnings = String(body.parse_warnings || '').trim().slice(0, 2000);
  const itemsWithBank = bankAccount
    ? items.map((it) => ({ ...it, bank_account: bankAccount }))
    : items;

  const now = new Date().toISOString();
  const statementPayload = {
    academy_id: academyId,
    filename,
    import_date: now,
    period_start: String(period_start || '').slice(0, 10),
    period_end: String(period_end || '').slice(0, 10),
    total_credit: round2(total_credit),
    total_debit: round2(total_debit),
    status: 'pending',
  };
  if (bankAccount) statementPayload.bank_account = bankAccount;
  if (sourceFormat) statementPayload.source_format = sourceFormat;
  if (parseMethod) statementPayload.parse_method = parseMethod;
  if (parseWarnings) statementPayload.parse_warnings = parseWarnings;

  let statement;
  try {
    statement = await databases.createDocument(
      DB_ID,
      BANK_STATEMENTS_COL,
      ID.unique(),
      statementPayload,
      defaultPerms()
    );
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('Unknown attribute')) throw e;
    const lean = { ...statementPayload };
    for (const k of ['bank_account', 'source_format', 'parse_method', 'parse_warnings']) {
      if (lean[k] === undefined || lean[k] === '') delete lean[k];
    }
    statement = await databases.createDocument(
      DB_ID,
      BANK_STATEMENTS_COL,
      ID.unique(),
      lean,
      defaultPerms()
    );
  }

  const naviTx = await listTxForMatching(academyId, period_start, period_end);
  const payerContextByLeadId = await payerContextForTransactions(academyId, naviTx);
  const chargeIdToTxId = await buildPagbankChargeIdToTxIdMap(databases, DB_ID, academyId);
  const gatewayLookup = { chargeIdToTxId };

  const overlapping = await listOverlappingStatements(
    academyId,
    period_start,
    period_end,
    statement.$id
  );
  const existingForDedup = await loadItemsForDedup(overlapping);
  const dedupIndex = buildDedupIndex(existingForDedup);

  const matchInput = [];
  const matchIndices = [];
  const finalResults = new Array(itemsWithBank.length);

  for (let i = 0; i < itemsWithBank.length; i += 1) {
    const it = itemsWithBank[i];
    const hit = classifyImportItem(it, dedupIndex, {
      newStatementBank: bankAccount,
      existingItems: existingForDedup,
    });
    if (hit?.status === 'duplicate') {
      finalResults[i] = {
        item: it,
        status: 'duplicate',
        duplicate_of: hit.duplicate_of || null,
        match_score: 0,
        suggested_tx_id: null,
        matched_tx_id: null,
      };
    } else {
      matchInput.push(it);
      matchIndices.push(i);
    }
  }

  const matchResults = matchBankItemsToTransactions(matchInput, naviTx, {
    payerContextByLeadId,
    gatewayLookup,
  });
  for (let j = 0; j < matchResults.length; j += 1) {
    finalResults[matchIndices[j]] = matchResults[j];
  }

  const createdItems = [];
  let gatewayAutoCount = 0;
  let reconciledAmount = 0;
  for (const m of finalResults) {
    if (m.gateway_auto_matched && m.matched_tx_id) {
      await markTxReconciled(m.matched_tx_id, { statementId: statement.$id, userId: me.$id });
      gatewayAutoCount += 1;
      reconciledAmount += round2(m.item?.amount);
    }
    const doc = await createBankStatementItem(statement.$id, m);
    createdItems.push(doc.$id);
  }

  const duplicateCount = finalResults.filter((r) => r.status === 'duplicate').length;
  const suggestedCount = finalResults.filter(
    (r) => r.suggested_tx_id && !r.gateway_auto_matched
  ).length;
  const st = 'pending';
  await databases.updateDocument(DB_ID, BANK_STATEMENTS_COL, statement.$id, { status: st });

  await recordAcademyEvent({
    event_type: BANK_RECONCILIATION_EVENT_TYPES.IMPORTED,
    academy_id: academyId,
    actor_user_id: me.$id,
    actor_name: String(me.name || me.email || 'Usuário'),
    target_id: statement.$id,
    statement_id: statement.$id,
    amount_reconciled: round2(reconciledAmount),
    amount_unmatched: round2(
      itemsWithBank.reduce((s, it) => s + round2(it.amount), 0) - reconciledAmount
    ),
    source_format: sourceFormat || undefined,
    timestamp: now,
  });

  void recordReconciliationMetric(databases, DB_ID, {
    academyId,
    statementId: statement.$id,
    eventType: RECON_METRIC_EVENT.IMPORT_SNAPSHOT,
    metrics: buildImportMetricsSnapshot(finalResults, {
      pool_tx_count: naviTx.length,
      ai_calls: 0,
      ai_estimated_cost_usd: 0,
    }),
    recordedAt: now,
  });

  return json(res, 200, {
    ok: true,
    statement_id: statement.$id,
    items_created: createdItems.length,
    suggested_matches: suggestedCount,
    gateway_auto_matched: gatewayAutoCount,
    duplicate_count: duplicateCount,
    dedup_partial: !bankAccount,
    status: st,
  });
}

async function handleConfirmMatch(req, res, academyId, me) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }
  const itemId = String(body.item_id || '').trim();
  const txId = String(body.transaction_id || body.tx_id || '').trim();
  const rememberPayer = body.remember_payer === true;
  const autoSuggest = body.auto_suggest === true;
  if (!itemId || !txId) return json(res, 400, { ok: false, error: 'item_and_tx_required' });

  const item = await databases.getDocument(DB_ID, BANK_STATEMENT_ITEMS_COL, itemId);
  const statement = await databases.getDocument(DB_ID, BANK_STATEMENTS_COL, item.statement_id);
  if (String(statement.academy_id || '') !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const bankAccount = resolveStatementBankAccount(statement);
  const itemForMatch = {
    amount: item.amount,
    direction: item.direction,
    bank_account: bankAccount,
  };
  const txCheck = await fetchAndValidateTxForReconciliation(
    databases,
    DB_ID,
    FINANCIAL_TX_COL,
    txId,
    { academyId, item: itemForMatch }
  );
  if (!txCheck.ok) {
    return json(res, reconciliationErrorStatus(txCheck.error), {
      ok: false,
      error: txCheck.error,
    });
  }

  const confirmMetrics = buildMatchConfirmedMetrics(
    {
      id: itemId,
      suggested_tx_id: item.suggested_tx_id,
      reconciliation_method: item.reconciliation_method,
      match_score: item.match_score,
      match_tier: item.match_tier,
    },
    txId
  );
  const confirmedAt = new Date().toISOString();

  await markTxReconciled(txId, { statementId: statement.$id, userId: me.$id });
  await updateBankStatementItem(
    itemId,
    matchedBankItemPatch(txId, { reconciliation_method: confirmMetrics.reconciliation_method })
  );

  void recordReconciliationMetric(databases, DB_ID, {
    academyId,
    statementId: statement.$id,
    eventType: RECON_METRIC_EVENT.MATCH_CONFIRMED,
    metrics: confirmMetrics,
    recordedAt: confirmedAt,
  });

  await recordAcademyEvent({
    event_type: BANK_RECONCILIATION_EVENT_TYPES.MATCHED,
    academy_id: academyId,
    actor_user_id: me.$id,
    actor_name: String(me.name || me.email || 'Usuário'),
    statement_id: statement.$id,
    target_id: itemId,
    amount_reconciled: round2(item.amount),
    timestamp: confirmedAt,
  });

  const leadId = String(txCheck.mapped?.lead_id || '').trim();
  const payerContextByLeadId = leadId
    ? await payerContextForTransactions(academyId, [txCheck.mapped])
    : new Map();
  const payerContext = leadId ? payerContextByLeadId.get(leadId) : null;
  const learn_payer = buildLearnPayerPayload(
    { description: item.description, direction: item.direction },
    txCheck.mapped,
    payerContext
  );

  if (rememberPayer && learn_payer && !learn_payer.already_known) {
    await rememberPayerAliasForStudent(
      databases,
      academyId,
      learn_payer.lead_id,
      learn_payer.extracted_display,
      'learned',
      { auto_suggest: autoSuggest }
    );
    learn_payer.already_known = true;
  } else if (autoSuggest && learn_payer?.lead_id) {
    await rememberPayerAliasForStudent(
      databases,
      academyId,
      learn_payer.lead_id,
      learn_payer.extracted_display,
      'learned',
      { auto_suggest: true }
    );
  }

  return json(res, 200, { ok: true, learn_payer: learn_payer || undefined });
}

async function handleRememberPayer(req, res, academyId) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }
  const leadId = String(body.lead_id || '').trim();
  const display = String(body.display || '').trim();
  const autoSuggest = body.auto_suggest === true;
  if (!leadId || !display) {
    return json(res, 400, { ok: false, error: 'lead_and_display_required' });
  }

  const result = await rememberPayerAliasForStudent(
    databases,
    academyId,
    leadId,
    display,
    'learned',
    { auto_suggest: autoSuggest }
  );
  if (!result.ok) {
    return json(res, 400, { ok: false, error: result.error || 'remember_failed' });
  }
  return json(res, 200, { ok: true });
}

async function handleConfirmAll(req, res, academyId, me) {
  const statementId = String(req.body?.statement_id || req.query.statement_id || '').trim();
  if (!statementId) return json(res, 400, { ok: false, error: 'statement_id_required' });

  const statement = await databases.getDocument(DB_ID, BANK_STATEMENTS_COL, statementId);
  if (String(statement.academy_id || '') !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }
  const bankAccount = resolveStatementBankAccount(statement);

  const itemsRes = await databases.listDocuments(DB_ID, BANK_STATEMENT_ITEMS_COL, [
    Query.equal('statement_id', statementId),
    Query.limit(500),
  ]);

  let count = 0;
  const errors = [];
  for (const item of itemsRes.documents || []) {
    if (item.status === 'matched' && item.matched_tx_id) continue;
    const txId = String(item.suggested_tx_id || item.matched_tx_id || '').trim();
    if (!txId || item.status === 'ignored' || item.status === 'duplicate') continue;
    const txCheck = await fetchAndValidateTxForReconciliation(
      databases,
      DB_ID,
      FINANCIAL_TX_COL,
      txId,
      {
        academyId,
        item: { amount: item.amount, direction: item.direction, bank_account: bankAccount },
      }
    );
    if (!txCheck.ok) {
      errors.push({ item_id: item.$id, error: txCheck.error });
      continue;
    }
    await markTxReconciled(txId, { statementId, userId: me.$id });
    await updateBankStatementItem(item.$id, matchedBankItemPatch(txId));
    count += 1;
  }

  return json(res, 200, { ok: true, confirmed: count, skipped: errors });
}

async function handleIgnoreItem(req, res, academyId) {
  const itemId = String(req.body?.item_id || '').trim();
  if (!itemId) return json(res, 400, { ok: false, error: 'item_id_required' });
  const item = await databases.getDocument(DB_ID, BANK_STATEMENT_ITEMS_COL, itemId);
  const statement = await databases.getDocument(DB_ID, BANK_STATEMENTS_COL, item.statement_id);
  if (String(statement.academy_id || '') !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }
  await updateBankStatementItem(itemId, { status: 'ignored' });
  return json(res, 200, { ok: true });
}

async function handleManualReconcile(req, res, academyId, me) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }
  const txId = String(body.transaction_id || body.tx_id || '').trim();
  const justification = String(body.justification || body.note || '').trim();
  const statementId = String(body.statement_id || '').trim();
  if (!txId || !justification) {
    return json(res, 400, { ok: false, error: 'tx_and_justification_required' });
  }

  const txCheck = await fetchAndValidateTxForReconciliation(
    databases,
    DB_ID,
    FINANCIAL_TX_COL,
    txId,
    { academyId, skipAmountCheck: true }
  );
  if (!txCheck.ok) {
    return json(res, reconciliationErrorStatus(txCheck.error), {
      ok: false,
      error: txCheck.error,
    });
  }

  await markTxReconciled(txId, {
    statementId,
    userId: me.$id,
    manual: true,
    prevDoc: txCheck.doc,
    justification,
  });

  await recordAcademyEvent({
    event_type: BANK_RECONCILIATION_EVENT_TYPES.MANUAL,
    academy_id: academyId,
    actor_user_id: me.$id,
    actor_name: String(me.name || me.email || 'Usuário'),
    statement_id: statementId,
    target_id: txId,
    timestamp: new Date().toISOString(),
  });

  return json(res, 200, { ok: true });
}

async function handleCreateTxFromItem(req, res, academyId, me) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }
  const itemId = String(body.item_id || '').trim();
  if (!itemId || !FINANCIAL_TX_COL) return json(res, 400, { ok: false, error: 'invalid' });

  const item = await databases.getDocument(DB_ID, BANK_STATEMENT_ITEMS_COL, itemId);
  const statement = await databases.getDocument(DB_ID, BANK_STATEMENTS_COL, item.statement_id);
  if (String(statement.academy_id || '') !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }
  if (String(item.status || '').toLowerCase() !== 'unmatched') {
    return json(res, 400, { ok: false, error: 'item_not_unmatched' });
  }

  const categoryRaw = String(body.category || '').trim();
  if (!categoryRaw) {
    return json(res, 400, { ok: false, error: 'category_required' });
  }

  const isCredit = String(item.direction || '') === 'credit';
  const direction = isCredit ? 'in' : 'out';
  const accounts = await loadAccounts(academyId);
  const cat = resolveFinanceCategory(categoryRaw, accounts, { direction });
  if (!cat) {
    return json(res, 400, { ok: false, error: 'category_invalid' });
  }
  if (cat.type === 'plan' && !String(body.planName || item.description || '').trim()) {
    return json(res, 400, { ok: false, error: 'plan_name_required' });
  }

  const bankAccount = resolveStatementBankAccount(statement, body);
  const categoryValue = categoryRaw.startsWith('acct:') ? categoryRaw : cat.label;
  const payload = buildFinanceTxPayload(
    {
      academyId,
      type: cat.type,
      category: categoryValue,
      gross: Number(item.amount),
      method: 'transferência',
      planName: String(body.planName || item.description || '').trim(),
      note: item.description,
      status: 'settled',
      settledAt: `${item.date}T12:00:00.000Z`,
      direction,
      bank_account: bankAccount,
    },
    { created_by: me.$id, origin_type: 'bank_statement', origin_id: itemId }
  );

  const tx = await databases.createDocument(
    DB_ID,
    FINANCIAL_TX_COL,
    ID.unique(),
    financeTxDocumentWithOptionals(payload),
    defaultPerms()
  );
  await markTxReconciled(tx.$id, { statementId: statement.$id, userId: me.$id });
  await updateBankStatementItem(itemId, matchedBankItemPatch(tx.$id));

  return json(res, 200, { ok: true, transaction: mapFinanceTxDoc(tx) });
}

async function handleComplete(req, res, academyId, me) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }
  const statementId = String(body.statement_id || '').trim();
  const completionNote = String(body.completion_note || body.note || '').trim();
  if (!statementId) return json(res, 400, { ok: false, error: 'statement_id_required' });

  const statement = await databases.getDocument(DB_ID, BANK_STATEMENTS_COL, statementId);
  if (String(statement.academy_id || '') !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const itemsRes = await databases.listDocuments(DB_ID, BANK_STATEMENT_ITEMS_COL, [
    Query.equal('statement_id', statementId),
    Query.limit(500),
  ]);
  const items = itemsRes.documents || [];
  const unmatched = items.filter((i) => i.status === 'unmatched');
  const reconciledAmt = items
    .filter((i) => i.status === 'matched')
    .reduce((s, i) => s + Number(i.amount || 0), 0);
  const unmatchedAmt = unmatched.reduce((s, i) => s + Number(i.amount || 0), 0);

  const st = unmatched.length === 0 ? 'reconciled' : 'partial';
  const completedAt = new Date().toISOString();
  await databases.updateDocument(DB_ID, BANK_STATEMENTS_COL, statementId, {
    status: st,
    completion_note: completionNote.slice(0, 2000),
    completed_at: completedAt,
    completed_by: me.$id,
  });

  const itemsForMetrics = items.map((d) => mapStatementItemDoc(d));
  void recordReconciliationMetric(databases, DB_ID, {
    academyId,
    statementId,
    eventType: RECON_METRIC_EVENT.STATEMENT_COMPLETED,
    metrics: buildStatementCompletionMetrics(itemsForMetrics, {
      statement_id: statementId,
      import_date: statement.import_date || statement.$createdAt,
      completed_at: completedAt,
    }),
    recordedAt: completedAt,
  });

  await recordAcademyEvent({
    event_type: BANK_RECONCILIATION_EVENT_TYPES.COMPLETED,
    academy_id: academyId,
    actor_user_id: me.$id,
    actor_name: String(me.name || me.email || 'Usuário'),
    statement_id: statementId,
    target_id: statementId,
    amount_reconciled: round2(reconciledAmt),
    amount_unmatched: round2(unmatchedAmt),
    timestamp: new Date().toISOString(),
  });

  let closingHints = null;
  try {
    closingHints = await buildClosingHintsForStatement({
      academyId,
      periodStart: statement.period_start || '',
      periodEnd: statement.period_end || '',
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'bank_recon_closing_hints_error',
        academyId,
        statementId,
        error: e?.message || String(e),
      })
    );
  }

  return json(res, 200, {
    ok: true,
    status: st,
    amount_reconciled: round2(reconciledAmt),
    amount_unmatched: round2(unmatchedAmt),
    closingHints,
  });
}

async function handleReconRegisterPayment(req, res, academyId, me, academyDoc) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const result = await registerReconPayment({
    academyId,
    me,
    academyDoc,
    body,
    markMatched: async (txId, { item, statement }) => {
      await markTxReconciled(txId, { statementId: statement.$id, userId: me.$id });
      await updateBankStatementItem(item.$id, matchedBankItemPatch(txId));
      await recordAcademyEvent({
        event_type: BANK_RECONCILIATION_EVENT_TYPES.MATCHED,
        academy_id: academyId,
        actor_user_id: me.$id,
        actor_name: String(me.name || me.email || 'Usuário'),
        statement_id: statement.$id,
        target_id: item.$id,
        amount_reconciled: round2(item.amount),
        timestamp: new Date().toISOString(),
      });
    },
  });

  if (!result.ok) {
    return json(res, result.status || 400, { ok: false, error: result.error, detail: result.detail });
  }
  return json(res, 200, {
    ok: true,
    payment_id: result.payment_id,
    transaction_id: result.transaction_id,
    item_id: result.item_id,
    learn_payer: result.learn_payer,
    mirror_warning: result.mirror_warning,
  });
}

async function handleReconMetrics(req, res, academyId) {
  const limit = Number(req.query.limit) || 50;
  const eventType = String(req.query.event_type || '').trim();
  const statementId = String(req.query.statement_id || '').trim();
  const since = String(req.query.since || '').trim();

  const result = await listReconciliationMetrics(databases, DB_ID, academyId, {
    limit,
    eventType,
    statementId,
    since,
  });

  if (!result.ok) {
    return json(res, 503, { ok: false, error: result.error, metrics: [] });
  }
  return json(res, 200, { ok: true, metrics: result.metrics, total: result.total });
}

async function handleReconPayerRules(req, res, academyId) {
  const rules = await listReconPayerRules(databases, academyId);
  return json(res, 200, { ok: true, rules });
}

async function handleDisableReconPayerRule(req, res, academyId) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }
  const leadId = String(body.lead_id || '').trim();
  const normalized = String(body.normalized || '').trim();
  if (!leadId || !normalized) {
    return json(res, 400, { ok: false, error: 'lead_and_normalized_required' });
  }

  const doc = await databases.getDocument(DB_ID, STUDENTS_COL, leadId);
  if (String(doc.academyId || doc.academy_id || '') !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }
  const aliases = parsePayerAliasesJson(doc.payer_aliases_json).map((a) =>
    a.normalized === normalized ? { ...a, auto_suggest: false } : a
  );
  await databases.updateDocument(DB_ID, STUDENTS_COL, leadId, {
    payer_aliases_json: serializePayerAliases(aliases),
  });
  return json(res, 200, { ok: true });
}

export default async function bankReconciliationHandler(req, res) {
  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const owner = await requireOwner(req, res, me, access.doc);
  if (!owner) return;
  const { academyId } = owner;
  const academyDoc = access.doc;

  const route = String(req.query.route || req.query.action || 'list').trim();

  try {
    if (req.method === 'GET' && route === 'list') return handleList(req, res, academyId);
    if (req.method === 'GET' && route === 'detail') return handleDetail(req, res, academyId);
    if (req.method === 'GET' && route === 'recon-metrics') {
      return handleReconMetrics(req, res, academyId);
    }
    if (req.method === 'GET' && route === 'recon-payer-rules') {
      return handleReconPayerRules(req, res, academyId);
    }
    if (req.method === 'POST' && route === 'import') return handleImport(req, res, academyId, me);
    if (req.method === 'POST' && route === 'confirm-match') {
      return handleConfirmMatch(req, res, academyId, me);
    }
    if (req.method === 'POST' && route === 'remember-payer') {
      return handleRememberPayer(req, res, academyId);
    }
    if (req.method === 'POST' && route === 'recon-register-payment') {
      return handleReconRegisterPayment(req, res, academyId, me, academyDoc);
    }
    if (req.method === 'POST' && route === 'recon-disable-payer-rule') {
      return handleDisableReconPayerRule(req, res, academyId);
    }
    if (req.method === 'POST' && route === 'confirm-all') {
      return handleConfirmAll(req, res, academyId, me);
    }
    if (req.method === 'POST' && route === 'ignore-item') {
      return handleIgnoreItem(req, res, academyId);
    }
    if (req.method === 'POST' && route === 'manual-reconcile') {
      return handleManualReconcile(req, res, academyId, me);
    }
    if (req.method === 'POST' && route === 'create-tx') {
      return handleCreateTxFromItem(req, res, academyId, me);
    }
    if (req.method === 'POST' && route === 'complete') {
      return handleComplete(req, res, academyId, me);
    }
    return json(res, 404, { ok: false, error: 'route_not_found' });
  } catch (e) {
    console.error('[bankReconciliation]', e);
    const mapped = reconciliationThrowableResponse(e);
    return json(res, mapped.status, { ok: false, error: mapped.error, detail: mapped.detail });
  }
}

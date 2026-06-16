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

  return docs
    .map((d) => ({
      ...mapFinanceTxDoc(d),
      reconciled: d.reconciled === true,
      reconciled_at: d.reconciled_at || '',
      bank_statement_id: d.bank_statement_id || '',
    }))
    .filter(Boolean);
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
  try {
    return await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, patch);
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('Unknown attribute')) throw e;
    const lean = { ...patch };
    for (const k of ['reconciled', 'reconciled_at', 'reconciled_by', 'bank_statement_id']) {
      delete lean[k];
    }
    return databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, lean);
  }
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
    matched_tx_id: m.matched_tx_id || null,
    suggested_tx_id: m.suggested_tx_id || null,
    match_score: m.match_score || 0,
    status: m.status,
  };
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
    if (!msg.includes('Unknown attribute') || !payload.duplicate_of) throw e;
    const lean = { ...payload };
    delete lean.duplicate_of;
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

  const items = (itemsRes.documents || []).map((d) => ({
    id: d.$id,
    date: d.date || '',
    description: d.description || '',
    amount: round2(d.amount),
    direction: d.direction || 'credit',
    matched_tx_id: d.matched_tx_id || null,
    suggested_tx_id: d.suggested_tx_id || null,
    match_score: Number(d.match_score) || 0,
    status: d.status || 'unmatched',
    duplicate_of: d.duplicate_of || null,
  }));

  const periodStart = statement.period_start || items[0]?.date;
  const periodEnd = statement.period_end || items[items.length - 1]?.date;
  const naviTx = periodStart && periodEnd ? await listTxForMatching(academyId, periodStart, periodEnd) : [];

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
  const naviUnmatched = statementBank
    ? naviUnmatchedRaw.filter((t) => txEligibleForStatementBank(statementBank, t))
    : naviUnmatchedRaw;

  const balanceProof = computeBankBalanceProof({
    statement: {
      total_credit: statement.total_credit,
      total_debit: statement.total_debit,
      bank_account: statement.bank_account || statement.bankAccount || '',
    },
    items,
    naviUnmatched,
  });

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
      bank_account: statement.bank_account || statement.bankAccount || '',
      source_format: statement.source_format || '',
      parse_method: statement.parse_method || '',
    },
    items,
    navi_transactions: naviTx,
    navi_unmatched: naviUnmatched,
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

  const matchResults = matchBankItemsToTransactions(matchInput, naviTx);
  for (let j = 0; j < matchResults.length; j += 1) {
    finalResults[matchIndices[j]] = matchResults[j];
  }

  const createdItems = [];
  for (const m of finalResults) {
    const doc = await createBankStatementItem(statement.$id, m);
    createdItems.push(doc.$id);
  }

  const duplicateCount = finalResults.filter((r) => r.status === 'duplicate').length;
  const suggestedCount = finalResults.filter((r) => r.suggested_tx_id).length;
  const st = 'pending';
  await databases.updateDocument(DB_ID, BANK_STATEMENTS_COL, statement.$id, { status: st });

  await recordAcademyEvent({
    event_type: BANK_RECONCILIATION_EVENT_TYPES.IMPORTED,
    academy_id: academyId,
    actor_user_id: me.$id,
    actor_name: String(me.name || me.email || 'Usuário'),
    target_id: statement.$id,
    statement_id: statement.$id,
    amount_reconciled: 0,
    amount_unmatched: round2(itemsWithBank.reduce((s, it) => s + round2(it.amount), 0)),
    source_format: sourceFormat || undefined,
    timestamp: now,
  });

  return json(res, 200, {
    ok: true,
    statement_id: statement.$id,
    items_created: createdItems.length,
    suggested_matches: suggestedCount,
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

  await markTxReconciled(txId, { statementId: statement.$id, userId: me.$id });
  await databases.updateDocument(DB_ID, BANK_STATEMENT_ITEMS_COL, itemId, {
    status: 'matched',
    matched_tx_id: txId,
    match_score: 100,
    suggested_tx_id: null,
  });

  await recordAcademyEvent({
    event_type: BANK_RECONCILIATION_EVENT_TYPES.MATCHED,
    academy_id: academyId,
    actor_user_id: me.$id,
    actor_name: String(me.name || me.email || 'Usuário'),
    statement_id: statement.$id,
    target_id: itemId,
    amount_reconciled: round2(item.amount),
    timestamp: new Date().toISOString(),
  });

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
    await databases.updateDocument(DB_ID, BANK_STATEMENT_ITEMS_COL, item.$id, {
      status: 'matched',
      matched_tx_id: txId,
      match_score: 100,
      suggested_tx_id: null,
    });
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
  await databases.updateDocument(DB_ID, BANK_STATEMENT_ITEMS_COL, itemId, { status: 'ignored' });
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
  await databases.updateDocument(DB_ID, BANK_STATEMENT_ITEMS_COL, itemId, {
    status: 'matched',
    matched_tx_id: tx.$id,
    match_score: 100,
  });

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
  await databases.updateDocument(DB_ID, BANK_STATEMENTS_COL, statementId, {
    status: st,
    completion_note: completionNote.slice(0, 2000),
    completed_at: new Date().toISOString(),
    completed_by: me.$id,
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

  return json(res, 200, {
    ok: true,
    status: st,
    amount_reconciled: round2(reconciledAmt),
    amount_unmatched: round2(unmatchedAmt),
  });
}

export default async function bankReconciliationHandler(req, res) {
  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const owner = await requireOwner(req, res, me, access.doc);
  if (!owner) return;
  const { academyId } = owner;

  const route = String(req.query.route || req.query.action || 'list').trim();

  try {
    if (req.method === 'GET' && route === 'list') return handleList(req, res, academyId);
    if (req.method === 'GET' && route === 'detail') return handleDetail(req, res, academyId);
    if (req.method === 'POST' && route === 'import') return handleImport(req, res, academyId, me);
    if (req.method === 'POST' && route === 'confirm-match') {
      return handleConfirmMatch(req, res, academyId, me);
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
    return json(res, 500, { ok: false, error: 'reconciliation_failed', detail: String(e?.message || e) });
  }
}

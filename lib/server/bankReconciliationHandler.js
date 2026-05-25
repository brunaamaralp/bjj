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
  txDirection,
} from './financeTxFields.js';
import { matchBankItemsToTransactions } from './bankReconciliationMatcher.js';
import { recordAcademyEvent, BANK_RECONCILIATION_EVENT_TYPES } from './academyEvents.js';

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

async function markTxReconciled(txId, { statementId, userId, manual = false, note = '' }) {
  const patch = {
    reconciled: true,
    reconciled_at: new Date().toISOString(),
    reconciled_by: String(userId || 'system').slice(0, 64),
    bank_statement_id: String(statementId || '').slice(0, 64),
    updated_at: new Date().toISOString(),
    updated_by: String(userId || 'system').slice(0, 64),
  };
  if (manual && note) {
    patch.note = String(note).slice(0, 2000);
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
  }));

  const periodStart = statement.period_start || items[0]?.date;
  const periodEnd = statement.period_end || items[items.length - 1]?.date;
  const naviTx = periodStart && periodEnd ? await listTxForMatching(academyId, periodStart, periodEnd) : [];

  const matchedAmount = items
    .filter((i) => i.status === 'matched')
    .reduce((s, i) => s + i.amount, 0);
  const pendingItems = items.filter((i) => i.status !== 'matched' && i.status !== 'ignored');
  const pendingAmount = pendingItems.reduce((s, i) => s + i.amount, 0);

  const naviUnmatched = naviTx.filter(
    (t) => !t.reconciled && !items.some((i) => i.matched_tx_id === t.id)
  );

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

  const now = new Date().toISOString();
  const statement = await databases.createDocument(
    DB_ID,
    BANK_STATEMENTS_COL,
    ID.unique(),
    {
      academy_id: academyId,
      filename,
      import_date: now,
      period_start: String(period_start || '').slice(0, 10),
      period_end: String(period_end || '').slice(0, 10),
      total_credit: round2(total_credit),
      total_debit: round2(total_debit),
      status: 'pending',
    },
    defaultPerms()
  );

  const naviTx = await listTxForMatching(academyId, period_start, period_end);
  const matchResults = matchBankItemsToTransactions(items, naviTx);

  const createdItems = [];
  for (const m of matchResults) {
    const it = m.item;
    const doc = await databases.createDocument(
      DB_ID,
      BANK_STATEMENT_ITEMS_COL,
      ID.unique(),
      {
        statement_id: statement.$id,
        date: it.date,
        description: it.description,
        amount: round2(it.amount),
        direction: it.direction,
        matched_tx_id: m.matched_tx_id || null,
        suggested_tx_id: m.suggested_tx_id || null,
        match_score: m.match_score || 0,
        status: m.status,
      },
      defaultPerms()
    );
    createdItems.push(doc.$id);

    if (m.status === 'matched' && m.matched_tx_id) {
      await markTxReconciled(m.matched_tx_id, {
        statementId: statement.$id,
        userId: me.$id,
      });
    }
  }

  const autoMatched = matchResults.filter((r) => r.status === 'matched').length;
  const st = autoMatched === items.length ? 'reconciled' : autoMatched > 0 ? 'partial' : 'pending';
  await databases.updateDocument(DB_ID, BANK_STATEMENTS_COL, statement.$id, { status: st });

  await recordAcademyEvent({
    event_type: BANK_RECONCILIATION_EVENT_TYPES.IMPORTED,
    academy_id: academyId,
    actor_user_id: me.$id,
    actor_name: String(me.name || me.email || 'Usuário'),
    target_id: statement.$id,
    statement_id: statement.$id,
    amount_reconciled: round2(
      matchResults.filter((r) => r.status === 'matched').reduce((s, r) => s + r.item.amount, 0)
    ),
    amount_unmatched: round2(
      matchResults.filter((r) => r.status !== 'matched').reduce((s, r) => s + r.item.amount, 0)
    ),
    timestamp: now,
  });

  return json(res, 200, {
    ok: true,
    statement_id: statement.$id,
    items_created: createdItems.length,
    auto_matched: autoMatched,
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

  const itemsRes = await databases.listDocuments(DB_ID, BANK_STATEMENT_ITEMS_COL, [
    Query.equal('statement_id', statementId),
    Query.equal('status', ['matched']),
    Query.limit(500),
  ]);

  let count = 0;
  for (const item of itemsRes.documents || []) {
    if (!item.matched_tx_id) continue;
    await markTxReconciled(item.matched_tx_id, { statementId, userId: me.$id });
    count += 1;
  }

  return json(res, 200, { ok: true, confirmed: count });
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

  await markTxReconciled(txId, {
    statementId,
    userId: me.$id,
    manual: true,
    note: justification,
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

  const isCredit = String(item.direction || '') === 'credit';
  const payload = buildFinanceTxPayload(
    {
      academyId,
      type: isCredit ? 'other' : 'expense_operational',
      category: body.category,
      gross: Number(item.amount),
      method: 'transferência',
      planName: item.description,
      note: item.description,
      status: 'settled',
      settledAt: `${item.date}T12:00:00.000Z`,
      direction: isCredit ? 'in' : 'out',
    },
    { created_by: me.$id, origin_type: 'bank_statement', origin_id: itemId }
  );

  const tx = await databases.createDocument(
    DB_ID,
    FINANCIAL_TX_COL,
    ID.unique(),
    financeTxDocumentForAppwrite(payload),
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

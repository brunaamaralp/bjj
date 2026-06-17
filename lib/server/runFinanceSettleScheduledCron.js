/**
 * Cron: liquida lançamentos pendentes no Caixa quando expected_settlement_at vence.
 */
import { Query } from 'node-appwrite';
import { Client, Databases } from 'node-appwrite';
import { financeTxOptionalPatchForAppwrite } from './financeTxFields.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import { financeCategoryLabelFromDoc } from './financeTxFields.js';
import { invalidateFinanceForecastCache } from './financeForecastHandler.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

const MAX_PER_RUN = 200;

async function listDuePendingSettlement(databases, nowIso) {
  if (!FINANCIAL_TX_COL) return [];
  const queries = [
    Query.equal('status', 'pending'),
    Query.lessThanEqual('expected_settlement_at', nowIso),
    Query.limit(100),
  ];
  let all = [];
  let cursor = null;
  for (let page = 0; page < 5 && all.length < MAX_PER_RUN; page += 1) {
    const q = [...queries];
    if (cursor) q.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    } catch (e) {
      const msg = String(e?.message || '');
      if (/unknown attribute/i.test(msg)) return [];
      throw e;
    }
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1]?.$id;
  }
  return all.slice(0, MAX_PER_RUN);
}

async function settleDocument(databases, doc, nowIso) {
  const patch = financeTxOptionalPatchForAppwrite({
    status: 'settled',
    settledAt: nowIso,
    updated_at: nowIso,
  });
  let updated;
  try {
    updated = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, doc.$id, patch);
  } catch (e) {
    const msg = String(e?.message || '');
    if (/unknown attribute/i.test(msg)) {
      updated = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, doc.$id, {
        status: 'settled',
        settledAt: nowIso,
      });
    } else {
      throw e;
    }
  }

  void applyAccountingSideEffectsAutoServer(
    {
      id: updated.$id,
      type: updated.type,
      category: financeCategoryLabelFromDoc(updated),
      gross: updated.gross,
      fee: updated.fee,
      net: updated.net,
      status: updated.status,
      settledAt: updated.settledAt,
      competence_month: updated.competence_month,
      planName: updated.planName,
      note: updated.note,
    },
    String(updated.academyId || doc.academyId || '')
  );

  return updated.$id;
}

export async function runFinanceSettleScheduledCron() {
  if (!FINANCIAL_TX_COL || !DB_ID || !API_KEY || !PROJECT_ID) {
    return { ok: false, error: 'not_configured', settled: 0, skipped: 0 };
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  const nowIso = new Date().toISOString();

  const due = await listDuePendingSettlement(databases, nowIso);
  let settled = 0;
  let failed = 0;
  const academyIds = new Set();

  for (const doc of due) {
    const st = String(doc.status || '').toLowerCase();
    if (st !== 'pending') continue;
    const expected = String(doc.expected_settlement_at || '').trim();
    if (!expected || expected > nowIso) continue;
    try {
      await settleDocument(databases, doc, nowIso);
      settled += 1;
      const aid = String(doc.academyId || '').trim();
      if (aid) academyIds.add(aid);
    } catch (e) {
      failed += 1;
      console.error('[finance-settle-scheduled]', doc.$id, e?.message || e);
    }
  }

  for (const academyId of academyIds) {
    try {
      invalidateFinanceForecastCache(academyId);
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    settled,
    failed,
    candidates: due.length,
    academies: academyIds.size,
  };
}

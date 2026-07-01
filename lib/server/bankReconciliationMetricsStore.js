/**
 * Persistência passiva de métricas de conciliação (Appwrite + log estruturado).
 */
import { ID, Permission, Role, Query } from 'node-appwrite';
import {
  RECON_METRIC_EVENT,
  buildStaleOrphanScanMetrics,
} from '../../src/lib/bankReconciliationMetrics.js';

const METRICS_COL =
  process.env.APPWRITE_RECONCILIATION_METRICS_COLLECTION_ID ||
  process.env.RECONCILIATION_METRICS_COL ||
  'reconciliation_metrics';

function defaultPerms() {
  return [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
}

function serializeMetrics(metrics) {
  return JSON.stringify(metrics || {}).slice(0, 10000);
}

/**
 * Grava métrica sem falhar o fluxo principal.
 * @returns {Promise<{ ok: boolean, id?: string, logged_only?: boolean }>}
 */
export async function recordReconciliationMetric(databases, dbId, {
  academyId,
  statementId = '',
  eventType,
  metrics,
  recordedAt = new Date().toISOString(),
}) {
  const payload = {
    event: 'reconciliation_metric',
    academy_id: String(academyId || '').slice(0, 64),
    statement_id: String(statementId || '').slice(0, 64),
    event_type: String(eventType || '').slice(0, 32),
    recorded_at: recordedAt,
    metrics,
  };

  console.info(JSON.stringify(payload));

  if (!databases || !dbId || !METRICS_COL || !academyId || !eventType) {
    return { ok: true, logged_only: true };
  }

  try {
    const doc = await databases.createDocument(
      dbId,
      METRICS_COL,
      ID.unique(),
      {
        academy_id: payload.academy_id,
        statement_id: payload.statement_id,
        event_type: payload.event_type,
        recorded_at: payload.recorded_at,
        metrics_json: serializeMetrics(metrics),
      },
      defaultPerms()
    );
    return { ok: true, id: doc.$id };
  } catch (e) {
    const msg = String(e?.message || e);
    if (!msg.includes('Unknown attribute') && !msg.includes('Collection with the requested ID')) {
      console.warn(
        JSON.stringify({
          event: 'reconciliation_metric_persist_failed',
          academy_id: payload.academy_id,
          event_type: payload.event_type,
          error: msg,
        })
      );
    }
    return { ok: true, logged_only: true };
  }
}

export async function listReconciliationMetrics(databases, dbId, academyId, {
  limit = 50,
  eventType = '',
  statementId = '',
  since = '',
} = {}) {
  if (!databases || !dbId || !METRICS_COL) {
    return { ok: false, error: 'not_configured', metrics: [] };
  }

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const q = [
    Query.equal('academy_id', String(academyId || '').trim()),
    Query.orderDesc('recorded_at'),
    Query.limit(lim),
  ];
  if (eventType) q.push(Query.equal('event_type', String(eventType).trim()));
  if (statementId) q.push(Query.equal('statement_id', String(statementId).trim()));
  if (since) q.push(Query.greaterThanEqual('recorded_at', String(since).trim()));

  const res = await databases.listDocuments(dbId, METRICS_COL, q);
  const metrics = (res.documents || []).map((d) => {
    let parsed = {};
    try {
      parsed = JSON.parse(d.metrics_json || '{}');
    } catch {
      void 0;
    }
    return {
      id: d.$id,
      academy_id: d.academy_id,
      statement_id: d.statement_id || '',
      event_type: d.event_type,
      recorded_at: d.recorded_at || d.$createdAt,
      metrics: parsed,
    };
  });

  return { ok: true, metrics, total: res.total ?? metrics.length };
}

export const STALE_ORPHAN_DEFAULT_DAYS = 7;

/**
 * Extratos pendentes com linhas unmatched há mais de N dias desde import_date.
 */
export async function scanStaleReconciliationOrphans(
  databases,
  dbId,
  {
    bankStatementsCol,
    bankItemsCol,
    staleDays = STALE_ORPHAN_DEFAULT_DAYS,
    academyId = '',
  } = {}
) {
  if (!databases || !dbId || !bankStatementsCol || !bankItemsCol) {
    return { rows: [], staleDays };
  }

  const cutoff = new Date(Date.now() - staleDays * 86400000).toISOString();
  const stmtQ = [
    Query.lessThanEqual('import_date', cutoff),
    Query.equal('status', ['pending', 'partial']),
    Query.limit(100),
  ];
  if (academyId) stmtQ.push(Query.equal('academy_id', academyId));

  const stmtRes = await databases.listDocuments(dbId, bankStatementsCol, stmtQ);
  const rows = [];

  for (const stmt of stmtRes.documents || []) {
    const itemsRes = await databases.listDocuments(dbId, bankItemsCol, [
      Query.equal('statement_id', stmt.$id),
      Query.equal('status', 'unmatched'),
      Query.limit(500),
    ]);
    const count = (itemsRes.documents || []).length;
    if (!count) continue;
    rows.push({
      statement_id: stmt.$id,
      academy_id: stmt.academy_id,
      import_date: stmt.import_date || stmt.$createdAt,
      filename: stmt.filename || '',
      stale_unmatched_count: count,
      stale_days: staleDays,
    });
  }

  return { rows, staleDays };
}

export async function runStaleOrphanMetricsCron(databases, dbId, options = {}) {
  const bankStatementsCol =
    options.bankStatementsCol ||
    process.env.VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID ||
    process.env.BANK_STATEMENTS_COL ||
    '';
  const bankItemsCol =
    options.bankItemsCol ||
    process.env.VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID ||
    process.env.BANK_STATEMENT_ITEMS_COL ||
    '';

  const { rows, staleDays } = await scanStaleReconciliationOrphans(databases, dbId, {
    bankStatementsCol,
    bankItemsCol,
    staleDays: options.staleDays ?? STALE_ORPHAN_DEFAULT_DAYS,
  });

  const byAcademy = new Map();
  for (const row of rows) {
    const aid = String(row.academy_id || '').trim();
    if (!aid) continue;
    if (!byAcademy.has(aid)) byAcademy.set(aid, []);
    byAcademy.get(aid).push(row);
  }

  let recorded = 0;
  for (const [academyId, academyRows] of byAcademy) {
    const metrics = buildStaleOrphanScanMetrics(academyRows, { staleDays });
    await recordReconciliationMetric(databases, dbId, {
      academyId,
      statementId: '',
      eventType: RECON_METRIC_EVENT.STALE_ORPHAN_SCAN,
      metrics,
    });
    recorded += 1;
  }

  return {
    ok: true,
    academies: recorded,
    stale_statements: rows.length,
    stale_items: rows.reduce((s, r) => s + r.stale_unmatched_count, 0),
  };
}

export { RECON_METRIC_EVENT };

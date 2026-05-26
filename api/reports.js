import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import { aggregateLeadsReport } from '../lib/server/reportsAggregate.js';
import { loadReportSnapshot, saveReportSnapshot } from '../lib/server/reportSnapshots.js';
import reportsLightHandler from '../lib/server/reportsLightHandler.js';
import reportsByOperatorHandler from '../lib/server/reportsByOperatorHandler.js';
import reportsByStudentHandler from '../lib/server/reportsByStudentHandler.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

const REPORT_TIMEOUT_MS = Number(process.env.REPORTS_HANDLER_TIMEOUT_MS || 28000);

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

function logReport(entry) {
  console.log(JSON.stringify({ scope: 'api/reports', ...entry, ts: new Date().toISOString() }));
}

async function fetchAllLeads(queries, signal) {
  let all = [];
  let cursor = null;
  do {
    if (signal?.aborted) throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' });
    const q = cursor ? [...queries, Query.cursorAfter(cursor)] : queries;
    const res = await databases.listDocuments(DB_ID, LEADS_COL, [...q, Query.limit(100)]);
    all = [...all, ...res.documents];
    cursor = res.documents.length === 100 ? res.documents[res.documents.length - 1].$id : null;
  } while (cursor);
  return all;
}

export default async function handler(req, res) {
  const route = String(req.query.route || '').trim();
  if (route === 'light') {
    return reportsLightHandler(req, res);
  }
  if (route === 'by-operator') {
    return reportsByOperatorHandler(req, res);
  }
  if (route === 'by-student') {
    return reportsByStudentHandler(req, res);
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const started = Date.now();
  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const authorizedAcademyId = access.academyId;
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { error: 'invalid_json' });
    }
  }

  const {
    academyId: bodyAcademyId,
    from,
    to,
    prevFrom,
    prevTo,
    filters,
    chartMode = 'weekly',
    refresh = false,
  } = body || {};

  if (!from || !to) return json(res, 400, { error: 'Parâmetros obrigatórios faltando' });

  const bodyAid = String(bodyAcademyId || '').trim();
  if (bodyAid && bodyAid !== authorizedAcademyId) {
    return json(res, 403, { error: 'Acesso negado à academia' });
  }

  const academyId = authorizedAcademyId;
  const reportMeta = { report: 'funnel', academyId, from, to };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);

  try {
    if (!refresh) {
      const snap = await loadReportSnapshot(academyId, from, to, filters, chartMode);
      if (snap?.payload) {
        logReport({
          ...reportMeta,
          leadCount: snap.payload.leadCount,
          durationMs: Date.now() - started,
          cached: true,
        });
        return json(res, 200, {
          ...snap.payload,
          snapshotUpdatedAt: snap.updatedAt,
          fromSnapshot: true,
        });
      }
    }

    const baseQueries = [Query.equal('academyId', academyId)];
    if (filters?.origin && filters.origin !== 'all') {
      baseQueries.push(Query.equal('origin', filters.origin));
    }
    if (filters?.type && filters.type !== 'all') {
      if (filters.type === 'Criança') {
        baseQueries.push(Query.or([Query.equal('type', 'Criança'), Query.equal('type', 'Kids')]));
      } else {
        baseQueries.push(Query.equal('type', filters.type));
      }
    }

    const allLeads = await fetchAllLeads(baseQueries, controller.signal);
    const aggregated = aggregateLeadsReport(allLeads, { from, to, prevFrom, prevTo, chartMode });

    const payload = {
      period: { from, to },
      ...aggregated,
      snapshotUpdatedAt: new Date().toISOString(),
      fromSnapshot: false,
    };

    await saveReportSnapshot(academyId, from, to, filters, chartMode, payload);

    logReport({
      ...reportMeta,
      leadCount: aggregated.leadCount,
      durationMs: Date.now() - started,
      error: null,
    });

    return json(res, 200, payload);
  } catch (e) {
    const isTimeout = e?.code === 'TIMEOUT' || e?.name === 'AbortError';
    logReport({
      ...reportMeta,
      leadCount: 0,
      durationMs: Date.now() - started,
      error: isTimeout ? 'timeout' : String(e?.message || e),
    });
    if (isTimeout) {
      return json(res, 504, {
        error: 'timeout',
        message: 'Muitos dados — tente um período menor',
      });
    }
    console.error(e);
    return json(res, 500, { error: 'Falha ao gerar relatório' });
  } finally {
    clearTimeout(timer);
  }
}

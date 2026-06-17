import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import { aggregateLeadsReport, aggregateStudentMetricsOnly } from '../lib/server/reportsAggregate.js';
import { fetchAllReportPeople, LEADS_COL } from '../lib/server/reportsPeople.js';
import { loadReportSnapshot, saveReportSnapshot } from '../lib/server/reportSnapshots.js';
import reportsLightHandler from '../lib/server/reportsLightHandler.js';
import reportsByOperatorHandler from '../lib/server/reportsByOperatorHandler.js';
import reportsByStudentHandler from '../lib/server/reportsByStudentHandler.js';
import auditFeedHandler from '../lib/server/auditFeedHandler.js';
import attendanceRetentionHandler from '../lib/server/attendanceRetentionHandler.js';
import attendanceFrequencyHandler from '../lib/server/attendanceFrequencyHandler.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';

const REPORT_TIMEOUT_MS = Number(process.env.REPORTS_HANDLER_TIMEOUT_MS || 28000);

function getReportsDatabases() {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL) {
    const error = new Error('reports_env_missing');
    error.code = 'CONFIG_MISSING';
    throw error;
  }
  const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  return new Databases(adminClient);
}

function json(res, status, obj) {
  res.status(status).json(obj);
}

function logReport(entry) {
  console.log(JSON.stringify({ scope: 'api/reports', ...entry, ts: new Date().toISOString() }));
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
  if (route === 'audit-feed') {
    return auditFeedHandler(req, res);
  }
  if (route === 'attendance-retention') {
    return attendanceRetentionHandler(req, res);
  }
  if (route === 'attendance-frequency') {
    return attendanceFrequencyHandler(req, res);
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
    slice,
  } = body || {};

  if (!from || !to) return json(res, 400, { error: 'Parâmetros obrigatórios faltando' });

  const reportSlice = String(slice || '').trim() === 'students' ? 'students' : 'funnel';

  const bodyAid = String(bodyAcademyId || '').trim();
  if (bodyAid && bodyAid !== authorizedAcademyId) {
    return json(res, 403, { error: 'Acesso negado à academia' });
  }

  const academyId = authorizedAcademyId;
  const reportMeta = { report: reportSlice === 'students' ? 'students' : 'funnel', academyId, from, to };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);

  try {
    const reportsDb = getReportsDatabases();

    if (!refresh) {
      const snap = await loadReportSnapshot(academyId, from, to, filters, chartMode, reportSlice);
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

    const allPeople = await fetchAllReportPeople(
      reportsDb,
      DB_ID,
      academyId,
      filters,
      controller.signal
    );

    if (reportSlice === 'students') {
      const aggregated = aggregateStudentMetricsOnly(allPeople, { from, to, prevFrom, prevTo });
      const payload = {
        slice: 'students',
        period: { from, to },
        ...aggregated,
        snapshotUpdatedAt: new Date().toISOString(),
        fromSnapshot: false,
      };
      await saveReportSnapshot(academyId, from, to, filters, chartMode, payload, reportSlice);
      logReport({
        ...reportMeta,
        leadCount: aggregated.leadCount,
        durationMs: Date.now() - started,
        error: null,
      });
      return json(res, 200, payload);
    }

    const aggregated = aggregateLeadsReport(allPeople, { from, to, prevFrom, prevTo, chartMode });

    const payload = {
      period: { from, to },
      ...aggregated,
      snapshotUpdatedAt: new Date().toISOString(),
      fromSnapshot: false,
    };

    await saveReportSnapshot(academyId, from, to, filters, chartMode, payload, reportSlice);

    logReport({
      ...reportMeta,
      leadCount: aggregated.leadCount,
      durationMs: Date.now() - started,
      error: null,
    });

    return json(res, 200, payload);
  } catch (e) {
    const isTimeout = e?.code === 'TIMEOUT' || e?.name === 'AbortError';
    const isConfigMissing = e?.code === 'CONFIG_MISSING';
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
    if (isConfigMissing) {
      return json(res, 500, {
        error: 'config_missing',
        message: 'Configuração de relatórios incompleta no servidor',
      });
    }
    console.error(e);
    return json(res, 500, { error: 'Falha ao gerar relatório' });
  } finally {
    clearTimeout(timer);
  }
}

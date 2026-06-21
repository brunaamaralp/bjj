import { Client, Databases, ID } from 'node-appwrite';

const buckets = new Map();

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const AI_USAGE_LOGS_COL =
  process.env.APPWRITE_AI_USAGE_LOGS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_AI_USAGE_LOGS_COLLECTION_ID ||
  'ai_usage_logs';

const appwriteClient =
  ENDPOINT && PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const usageDatabases = appwriteClient ? new Databases(appwriteClient) : null;

function toInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.trunc(num));
}

function bucketKey(academyId) {
  return String(academyId || '_global').trim() || '_global';
}

export function recordAgentRespondLatency(academyId, ms, { timedOut = false } = {}) {
  const key = bucketKey(academyId);
  const b = buckets.get(key) || { samples: [], timeouts: 0 };
  if (timedOut) b.timeouts += 1;
  else {
    b.samples.push(ms);
    if (b.samples.length > 200) b.samples.shift();
  }
  buckets.set(key, b);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

export function getAgentRespondMetrics(academyId) {
  const b = buckets.get(bucketKey(academyId)) || { samples: [], timeouts: 0 };
  const sorted = [...b.samples].sort((a, c) => a - c);
  return {
    count: sorted.length,
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    timeouts: b.timeouts,
  };
}

export function logTokenUsage({ route, model, input_tokens, output_tokens, academy_id }) {
  if (!usageDatabases || !DB_ID || !AI_USAGE_LOGS_COL) return;
  usageDatabases
    .createDocument(DB_ID, AI_USAGE_LOGS_COL, ID.unique(), {
      route: String(route || 'other').trim() || 'other',
      model: String(model || '').trim(),
      input_tokens: toInt(input_tokens),
      output_tokens: toInt(output_tokens),
      academy_id: String(academy_id || '').trim(),
      created_at: new Date().toISOString(),
    })
    .catch(() => {});
}

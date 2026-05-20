/**
 * Fila simples com retry e dead-letter para webhooks Asaas (assinatura Nave).
 * Persiste em APPWRITE_WEBHOOK_JOBS_COLLECTION_ID quando configurado; senão retry em memória.
 */
import { Client, Databases, ID, Permission, Role, Query } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const JOBS_COL = () =>
  String(
    process.env.APPWRITE_WEBHOOK_JOBS_COLLECTION_ID ||
      process.env.VITE_APPWRITE_WEBHOOK_JOBS_COLLECTION_ID ||
      ''
  ).trim();

const MAX_ATTEMPTS = Math.min(10, Math.max(1, Number(process.env.WEBHOOK_JOB_MAX_ATTEMPTS) || 3));
const BACKOFF_MS = [0, 400, 1200, 3000];

let cachedDb = null;
let consecutiveFailures = 0;

function getDb() {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !JOBS_COL()) return null;
  if (!cachedDb) {
    cachedDb = new Databases(
      new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
    );
  }
  return cachedDb;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function getWebhookConsecutiveFailures() {
  return consecutiveFailures;
}

export function resetWebhookConsecutiveFailures() {
  consecutiveFailures = 0;
}

async function persistDeadLetter({ provider, payload, error, attempts }) {
  const db = getDb();
  if (!db) {
    console.error(
      JSON.stringify({
        event: 'webhook_dead_letter',
        provider,
        attempts,
        error: String(error),
        payload_preview: JSON.stringify(payload).slice(0, 500),
      })
    );
    return;
  }
  try {
    await db.createDocument(
      DB_ID,
      JOBS_COL(),
      ID.unique(),
      {
        provider: String(provider),
        status: 'dead_letter',
        attempts: Number(attempts) || 0,
        payload_json: JSON.stringify(payload).slice(0, 12000),
        error: String(error).slice(0, 2000),
        created_at: new Date().toISOString(),
      },
      [Permission.read(Role.users())]
    );
  } catch (e) {
    console.error('[webhookQueue] dead_letter persist failed', e?.message || e);
  }
}

/**
 * Executa handler com retry exponencial; em falha final grava dead-letter.
 */
export async function runWebhookJobWithRetry(provider, payload, handler) {
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt] || 3000);
    try {
      const result = await handler(payload);
      consecutiveFailures = 0;
      return result;
    } catch (e) {
      lastErr = e;
      console.warn(
        JSON.stringify({
          event: 'webhook_retry',
          provider,
          attempt: attempt + 1,
          max: MAX_ATTEMPTS,
          error: e?.message || String(e),
        })
      );
    }
  }
  consecutiveFailures += 1;
  await persistDeadLetter({
    provider,
    payload,
    error: lastErr?.message || lastErr,
    attempts: MAX_ATTEMPTS,
  });
  if (consecutiveFailures >= Number(process.env.WEBHOOK_ALERT_AFTER_FAILURES || 5)) {
    console.error(
      JSON.stringify({
        event: 'webhook_operational_alert',
        provider,
        consecutiveFailures,
        message: 'Webhook Nave falhou repetidamente — verifique dead-letter e Asaas',
      })
    );
  }
  throw lastErr;
}

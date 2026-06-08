import { Client, Databases } from 'node-appwrite';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  '';

const adminClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = adminClient ? new Databases(adminClient) : null;

const DEFAULT_TTL_MS = 120_000;
const MAX_ATTEMPTS = 4;

function isLockActive(untilIso) {
  const until = String(untilIso || '').trim();
  if (!until) return false;
  const ms = new Date(until).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

/**
 * Tenta adquirir lock distribuído no documento da conversa.
 * @param {string} convId
 * @param {{ ttlMs?: number }} [opts]
 * @returns {Promise<{ acquired: boolean; reason?: string }>}
 */
export async function tryAcquireAgentLock(convId, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const id = String(convId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !id) {
    return { acquired: false, reason: 'not_configured' };
  }

  const untilIso = new Date(Date.now() + (Number(ttlMs) || DEFAULT_TTL_MS)).toISOString();
  let lastErr = '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const current = await databases.getDocument(DB_ID, CONVERSATIONS_COL, id);
      if (isLockActive(current?.agent_processing_until)) {
        return { acquired: false, reason: 'lock_active' };
      }
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, id, {
        agent_processing_until: untilIso,
      });
      return { acquired: true };
    } catch (e) {
      lastErr = e?.message || 'lock_acquire_failed';
      if (String(lastErr).toLowerCase().includes('unknown attribute')) {
        console.warn('[agentProcessingLock] agent_processing_until ausente no schema — lock desabilitado');
        return { acquired: true, degraded: true };
      }
    }
  }

  return { acquired: false, reason: lastErr || 'lock_acquire_failed' };
}

/**
 * Libera lock do agente na conversa.
 * @param {string} convId
 */
export async function releaseAgentLock(convId) {
  const id = String(convId || '').trim();
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !id) return;
  try {
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, id, {
      agent_processing_until: '',
    });
  } catch (e) {
    console.warn('[agentProcessingLock] release failed', { convId: id, erro: e?.message || e });
  }
}

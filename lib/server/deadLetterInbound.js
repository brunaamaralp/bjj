import { Client, Databases, ID } from 'node-appwrite';
import { logStructured } from './structuredLog.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const DEAD_LETTER_COL =
  process.env.VITE_APPWRITE_INBOUND_DEAD_LETTER_COL_ID || process.env.INBOUND_DEAD_LETTER_COL_ID || '';

const client =
  PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = client ? new Databases(client) : null;

/**
 * Grava payload inbound não persistido para reconciliação manual (idempotente por message_id).
 */
export async function recordDeadLetterInbound({
  academyId,
  phone,
  messageId,
  payload,
  error,
}) {
  const mid = String(messageId || '').trim();
  if (!mid) return null;
  if (!databases || !DB_ID || !DEAD_LETTER_COL) {
    logStructured('dead_letter_skipped', {
      academy_id: academyId,
      phone,
      message_id: mid,
      error: 'collection_not_configured',
    });
    return null;
  }
  try {
    return await databases.createDocument(DB_ID, DEAD_LETTER_COL, ID.unique(), {
      academy_id: String(academyId || '').trim(),
      phone_number: String(phone || '').trim(),
      message_id: mid,
      payload_json: JSON.stringify(payload || {}).slice(0, 65535),
      error: String(error || '').slice(0, 512),
      created_at: new Date().toISOString(),
      status: 'pending',
    });
  } catch (e) {
    logStructured('dead_letter_write_failed', {
      academy_id: academyId,
      phone,
      message_id: mid,
      error: e?.message || String(e),
    });
    return null;
  }
}

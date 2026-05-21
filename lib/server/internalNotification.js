import { Client, Databases, ID, Permission, Role } from 'node-appwrite';
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
const NOTE_NOTIFICATIONS_COL =
  process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
  '';

const client =
  PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = client ? new Databases(client) : null;

/**
 * Cria notificação interna na coleção note_notifications (servidor).
 * @param {{
 *   academy_id: string,
 *   type: string,
 *   title: string,
 *   body: string,
 *   action_url?: string,
 *   severity?: string,
 *   phone?: string,
 *   conversation_id?: string,
 * }} payload
 */
export async function createInternalNotification(payload) {
  const academyId = String(payload?.academy_id || '').trim();
  const type = String(payload?.type || 'system').trim();
  const title = String(payload?.title || '').trim().slice(0, 256);
  const body = String(payload?.body || '').trim().slice(0, 512);
  if (!academyId || !title) {
    return { ok: false, erro: 'academy_id ou title ausente' };
  }
  if (!databases || !DB_ID || !NOTE_NOTIFICATIONS_COL) {
    logStructured('internal_notification_skipped', {
      academy_id: academyId,
      type,
      error: 'collection_not_configured',
    });
    return { ok: false, erro: 'collection_not_configured' };
  }

  const nowIso = new Date().toISOString();
  const phone = String(payload?.phone || '').trim();
  const conversationId = String(payload?.conversation_id || '').trim() || 'system';
  const actionUrl = String(payload?.action_url || '').trim();
  const severity = String(payload?.severity || 'info').trim();

  const base = {
    note_id: `sys-${type}-${Date.now()}`,
    conversation_id: conversationId,
    phone_number: phone || null,
    lead_id: null,
    lead_name: title,
    academy_id: academyId,
    created_by_user_id: 'system',
    created_by_name: body,
    created_at: nowIso,
    read_by: [],
  };

  const extended = {
    ...base,
    type,
    ...(actionUrl ? { action_url: actionUrl.slice(0, 512) } : {}),
    ...(severity ? { severity } : {}),
  };

  try {
    const doc = await databases.createDocument(DB_ID, NOTE_NOTIFICATIONS_COL, ID.unique(), extended, [
      Permission.read(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ]);
    logStructured('internal_notification_created', {
      academy_id: academyId,
      type,
      notification_id: doc.$id,
      severity,
    });
    return { ok: true, id: doc.$id };
  } catch (e) {
    try {
      const doc = await databases.createDocument(DB_ID, NOTE_NOTIFICATIONS_COL, ID.unique(), base, [
        Permission.read(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]);
      logStructured('internal_notification_created', {
        academy_id: academyId,
        type,
        notification_id: doc.$id,
        severity,
        fallback: 'minimal_fields',
      });
      return { ok: true, id: doc.$id };
    } catch (e2) {
      logStructured('internal_notification_failed', {
        academy_id: academyId,
        type,
        error: e2?.message || String(e2),
      });
      return { ok: false, erro: e2?.message || String(e2) };
    }
  }
}

/**
 * Notificações de nota de perfil (aluno/lead) — broadcast por academy_id.
 * `body` é snapshot só para preview no sino; lead_events é a fonte da verdade.
 *
 * Futuro (não implementar agora): recipient_user_ids / papéis — este helper
 * aceita campos extras no payload sem acoplar a UI a fan-out.
 */
import { ID, Permission, Role } from 'node-appwrite';
import { logStructured } from './structuredLog.js';

export const PROFILE_NOTE_NOTIFICATION_TYPE = 'profile_note';
export const PROFILE_NOTE_BODY_MAX = 512;
export const PROFILE_NOTE_TEXT_MAX = 1000;

const NOTE_NOTIFICATIONS_COL =
  process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
  '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';

function defaultPerms() {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users()),
  ];
}

/** Truncamento byte-safe para atributo string Appwrite (UTF-8). */
export function truncateNotificationBody(text, max = PROFILE_NOTE_BODY_MAX) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (raw.length <= max) return raw;
  if (max <= 1) return raw.slice(0, max);
  return `${raw.slice(0, max - 1)}…`;
}

export function buildProfileNoteActionUrl({ personKind, personId }) {
  const id = encodeURIComponent(String(personId || '').trim());
  if (!id) return '';
  if (personKind === 'student') return `/student/${id}?tab=timeline`;
  return `/lead/${id}?tab=timeline`;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {object} opts
 */
export async function createProfileNoteNotification(
  databases,
  {
    academyId,
    noteId,
    leadId,
    leadName,
    body,
    createdByUserId,
    createdByName,
    actionUrl,
    phoneNumber = '',
  }
) {
  const aid = String(academyId || '').trim();
  const nid = String(noteId || '').trim();
  const lid = String(leadId || '').trim();
  const authorId = String(createdByUserId || '').trim();
  if (!databases || !DB_ID || !NOTE_NOTIFICATIONS_COL) {
    return { ok: false, erro: 'collection_not_configured' };
  }
  if (!aid || !nid || !lid || !authorId) {
    return { ok: false, erro: 'missing_fields' };
  }

  const nowIso = new Date().toISOString();
  const payload = {
    note_id: nid.slice(0, 128),
    conversation_id: 'profile',
    lead_id: lid.slice(0, 64),
    lead_name: String(leadName || '').trim().slice(0, 256) || 'Contato',
    phone_number: String(phoneNumber || '').trim().slice(0, 32) || null,
    academy_id: aid,
    created_by_user_id: authorId.slice(0, 64),
    created_by_name: String(createdByName || 'Equipe').trim().slice(0, 512) || 'Equipe',
    created_at: nowIso,
    type: PROFILE_NOTE_NOTIFICATION_TYPE,
    severity: 'info',
    action_url: String(actionUrl || '').trim().slice(0, 512),
    body: truncateNotificationBody(body, PROFILE_NOTE_BODY_MAX),
    read_by: [authorId],
  };

  try {
    const doc = await databases.createDocument(
      DB_ID,
      NOTE_NOTIFICATIONS_COL,
      ID.unique(),
      payload,
      defaultPerms()
    );
    logStructured('profile_note_notification_created', {
      academy_id: aid,
      notification_id: doc.$id,
      note_id: nid,
      lead_id: lid,
    });
    return { ok: true, id: doc.$id };
  } catch (e) {
    // Fallback se `body` ainda não existir no schema
    try {
      const { body: _omit, ...withoutBody } = payload;
      const doc = await databases.createDocument(
        DB_ID,
        NOTE_NOTIFICATIONS_COL,
        ID.unique(),
        withoutBody,
        defaultPerms()
      );
      logStructured('profile_note_notification_created', {
        academy_id: aid,
        notification_id: doc.$id,
        note_id: nid,
        lead_id: lid,
        fallback: 'without_body',
      });
      return { ok: true, id: doc.$id, fallback: 'without_body' };
    } catch (e2) {
      logStructured('profile_note_notification_failed', {
        academy_id: aid,
        note_id: nid,
        error: e2?.message || String(e2),
      });
      return { ok: false, erro: e2?.message || String(e2) };
    }
  }
}

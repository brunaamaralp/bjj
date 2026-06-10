import { ID, Permission, Role } from 'node-appwrite';
import { ensureConversationBelongsToAcademy } from './ensureConversationInAcademy.js';
import { addLeadEventServer } from './leadEvents.js';

const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  '';
const CONVERSATION_NOTES_COL =
  process.env.APPWRITE_CONVERSATION_NOTES_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATION_NOTES_COLLECTION_ID ||
  '';
const NOTE_NOTIFICATIONS_COL =
  process.env.APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_NOTE_NOTIFICATIONS_COLLECTION_ID ||
  '';

const MAX_BODY = 4000;

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {object} params
 */
export async function createConversationNoteServer(databases, { academyId, conversationId, body, authorId = 'ai-agent' }) {
  const aid = String(academyId || '').trim();
  const cid = String(conversationId || '').trim();
  const text = String(body || '').trim();
  if (!aid || !cid || !text) return { ok: false, error: 'invalid_params' };
  if (text.length > MAX_BODY) return { ok: false, error: 'note_too_long' };
  if (!CONVERSATION_NOTES_COL || !DB_ID || !CONVERSATIONS_COL) {
    return { ok: false, error: 'notes_not_configured' };
  }

  const convOk = await ensureConversationBelongsToAcademy(databases, DB_ID, CONVERSATIONS_COL, cid, aid);
  if (!convOk.ok) return { ok: false, error: 'conversation_not_found' };

  const nowIso = new Date().toISOString();
  try {
    const created = await databases.createDocument(
      DB_ID,
      CONVERSATION_NOTES_COL,
      ID.unique(),
      {
        academy_id: aid,
        conversation_id: cid,
        body: text,
        author_id: String(authorId || 'ai-agent').slice(0, 64),
        created_at: nowIso,
      },
      [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
    );

    const convDoc = convOk.conv || {};
    const leadId = String(convDoc.lead_id || '').trim();

    if (NOTE_NOTIFICATIONS_COL) {
      void databases
        .createDocument(
          DB_ID,
          NOTE_NOTIFICATIONS_COL,
          ID.unique(),
          {
            note_id: created.$id,
            conversation_id: cid,
            lead_id: leadId || null,
            lead_name: String(convDoc.lead_name || '').trim() || null,
            phone_number: String(convDoc.phone_number || convDoc.phone || '').trim() || null,
            academy_id: aid,
            created_by_user_id: 'ai-agent',
            created_by_name: 'Assistente IA',
            created_at: nowIso,
            read_by: [],
          },
          [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
        )
        .catch(() => {});
    }

    if (leadId) {
      void addLeadEventServer({
        academyId: aid,
        leadId,
        type: 'inbox_note',
        text,
        at: nowIso,
        createdBy: 'ai-agent',
        payloadJson: { source: 'ai_agent', note_id: created.$id, conversation_id: cid },
      }).catch(() => {});
    }

    return { ok: true, summary: 'Nota registrada na conversa', entityIds: { note_id: created.$id } };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {object} params
 */
export async function addLeadNoteServer(databases, { academyId, leadId, noteText }) {
  const aid = String(academyId || '').trim();
  const lid = String(leadId || '').trim();
  const text = String(noteText || '').trim();
  if (!aid || !lid || !text) return { ok: false, error: 'invalid_params' };

  const doc = await addLeadEventServer({
    academyId: aid,
    leadId: lid,
    type: 'note',
    text,
    createdBy: 'ai-agent',
  });
  if (!doc) return { ok: false, error: 'note_failed' };
  return { ok: true, summary: 'Nota registrada no histórico', entityIds: { lead_id: lid } };
}

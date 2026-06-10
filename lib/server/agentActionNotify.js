import { ID, Permission, Query, Role } from 'node-appwrite';
import { createInternalNotification } from './internalNotification.js';
import { toYmd } from '../planFreezeCore.js';

const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const TASKS_COL =
  process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';

const AI_ACTION_MARKER = '[AI_ACTION]';

function buildActionDescription({ action, messageId, conversationId, payload, failed }) {
  const lines = [
    AI_ACTION_MARKER,
    `action: ${action}`,
    `message_id: ${messageId || 'n/a'}`,
    `conversation_id: ${conversationId || 'n/a'}`,
    `executed_at: ${new Date().toISOString()}`,
    failed ? 'status: failure' : 'status: success',
    payload ? `payload: ${JSON.stringify(payload).slice(0, 1500)}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} messageId
 * @param {string} action
 */
async function hasExistingReviewTask(databases, academyId, messageId, action) {
  if (!TASKS_COL || !DB_ID || !messageId) return false;
  const marker = `message_id: ${messageId}`;
  try {
    const res = await databases.listDocuments(DB_ID, TASKS_COL, [
      Query.equal('academy_id', [String(academyId || '').trim()]),
      Query.equal('created_by', ['ai-agent']),
      Query.limit(50),
    ]);
    for (const doc of res.documents || []) {
      const desc = String(doc.description || '');
      if (desc.includes(AI_ACTION_MARKER) && desc.includes(marker) && desc.includes(`action: ${action}`)) {
        return true;
      }
    }
  } catch {
    void 0;
  }
  return false;
}

function actionTitle(action, leadName, failed) {
  const name = String(leadName || 'contato').trim() || 'contato';
  const labels = {
    add_conversation_note: 'nota na conversa',
    add_lead_note: 'nota no histórico',
    update_student: 'cadastro atualizado',
    create_lead: 'lead cadastrado',
    freeze_plan: 'trancamento de plano',
  };
  const label = labels[action] || action;
  if (failed) return `IA falhou: ${label} — ${name}`;
  return `Conferir: IA registrou ${label} — ${name}`;
}

function severityFor(action, failed) {
  if (failed) return 'high';
  if (action === 'freeze_plan' || action === 'update_student' || action === 'create_lead') return 'warning';
  return 'info';
}

/**
 * @param {import('node-appwrite').Databases} [databases]
 * @param {object} params
 */
export async function notifyTeamOfAiAction(databases, {
  academyId,
  action,
  summary,
  phone,
  conversationId,
  leadId,
  leadName,
  messageId,
  payload,
  failed = false,
}) {
  const act = String(action || '').trim();
  const aid = String(academyId || '').trim();
  const title = actionTitle(act, leadName, failed);
  const body = String(summary || title).slice(0, 512);
  const sev = severityFor(act, failed);
  const phoneEnc = phone ? encodeURIComponent(String(phone)) : '';
  const actionUrl = conversationId
    ? `/inbox?phone=${phoneEnc}`
    : leadId
      ? `/student/${encodeURIComponent(leadId)}`
      : '';

  void createInternalNotification({
    academy_id: aid,
    type: failed ? 'ai_action_failed' : 'ai_action_executed',
    title,
    body,
    action_url: actionUrl,
    severity: sev,
    phone: String(phone || ''),
    conversation_id: conversationId || 'system',
  });

  if (!databases || !TASKS_COL || !DB_ID) return { taskCreated: false };

  const dup = await hasExistingReviewTask(databases, aid, messageId, act);
  if (dup) return { taskCreated: false, skipped: 'duplicate' };

  const todayYmd = toYmd(new Date());
  const nowIso = new Date().toISOString();
  const description = buildActionDescription({
    action: act,
    messageId,
    conversationId,
    payload,
    failed,
  });

  try {
    await databases.createDocument(
      DB_ID,
      TASKS_COL,
      ID.unique(),
      {
        academy_id: aid,
        title,
        description: `${description}\n---\n${body}`,
        status: 'pending',
        due_date: todayYmd,
        assigned_to: '',
        lead_id: String(leadId || '').trim(),
        lead_name: String(leadName || '').trim().slice(0, 128),
        created_by: 'ai-agent',
        created_at: nowIso,
        updated_at: nowIso,
      },
      [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
    );
    return { taskCreated: true };
  } catch (e) {
    const msg = String(e?.message || '');
    if (/unknown attribute/i.test(msg)) {
      try {
        await databases.createDocument(
          DB_ID,
          TASKS_COL,
          ID.unique(),
          {
            academy_id: aid,
            title,
            description: `${description}\n---\n${body}`,
            status: 'pending',
            due_date: todayYmd,
            assigned_to: '',
            lead_id: String(leadId || '').trim(),
            lead_name: String(leadName || '').trim().slice(0, 128),
            created_by: 'ai-agent',
          },
          [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
        );
        return { taskCreated: true };
      } catch {
        return { taskCreated: false, error: msg };
      }
    }
    return { taskCreated: false, error: msg };
  }
}

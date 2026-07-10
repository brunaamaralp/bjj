/**
 * Cron: preenche `messages_recent` a partir de `messages` em conversas legadas.
 * GET /api/cron/reset-usage?action=messages-recent-backfill
 * Requer CRON_SECRET.
 */
import { Query } from 'node-appwrite';
import { backfillMessagesRecentFromFull } from './conversationsStore.js';
import { hasUsableMessagesRecent } from './conversationMessages.js';

const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  '';

const LIST_SELECT = ['$id', 'academy_id', 'messages_recent', 'updated_at'];
const MESSAGES_SELECT = ['$id', 'messages'];

const DEFAULT_MAX_MS = 8500;
const DEFAULT_PAGE_SIZE = 40;
const DEFAULT_MAX_BACKFILL = Math.max(
  1,
  Number(process.env.MESSAGES_RECENT_BACKFILL_MAX || 30) || 30
);

/** Queries Appwrite para conversas sem cache recente utilizável. */
export function buildMessagesRecentBackfillQueries(academyId, cursor = '') {
  const queries = [
    Query.orderDesc('updated_at'),
    Query.limit(DEFAULT_PAGE_SIZE),
    Query.select(LIST_SELECT),
    Query.or([
      Query.isNull('messages_recent'),
      Query.equal('messages_recent', ['']),
      Query.equal('messages_recent', ['[]']),
    ]),
  ];
  const aid = String(academyId || '').trim();
  if (aid) queries.unshift(Query.equal('academy_id', [aid]));
  const after = String(cursor || '').trim();
  if (after) queries.push(Query.cursorAfter(after));
  return queries;
}

export function conversationNeedsMessagesRecentBackfill(doc) {
  return !hasUsableMessagesRecent(doc);
}

async function fetchConversationMessages(databases, dbId, docId) {
  const id = String(docId || '').trim();
  if (!id) return null;
  const list = await databases.listDocuments(dbId, CONVERSATIONS_COL, [
    Query.equal('$id', [id]),
    Query.limit(1),
    Query.select(MESSAGES_SELECT),
  ]);
  return list.documents?.[0]?.messages ?? null;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {{ academyId?: string, cursor?: string, maxBackfill?: number, maxMs?: number, dryRun?: boolean }} [opts]
 */
export async function runMessagesRecentBackfillCron(databases, dbId, opts = {}) {
  if (!databases || !dbId || !CONVERSATIONS_COL) {
    return { ok: false, skipped: 'not_configured' };
  }

  const academyId = String(opts.academyId || '').trim();
  const dryRun = opts.dryRun === true;
  const maxBackfill = Math.max(1, Number(opts.maxBackfill) || DEFAULT_MAX_BACKFILL);
  const maxMs = Math.max(1000, Number(opts.maxMs) || DEFAULT_MAX_MS);
  const t0 = Date.now();

  const stats = {
    ok: true,
    dryRun,
    scanned: 0,
    candidates: 0,
    backfilled: 0,
    skippedEmpty: 0,
    skippedAlreadyOk: 0,
    errors: 0,
    next_cursor: '',
    done: false,
  };

  let cursor = String(opts.cursor || '').trim();

  while (Date.now() - t0 < maxMs && stats.backfilled < maxBackfill) {
    let page;
    try {
      page = await databases.listDocuments(
        dbId,
        CONVERSATIONS_COL,
        buildMessagesRecentBackfillQueries(academyId, cursor)
      );
    } catch (e) {
      const msg = String(e?.message || e);
      if (stats.scanned === 0 && /unknown attribute|messages_recent|invalid query/i.test(msg)) {
        return { ...stats, ok: false, skipped: 'query_unsupported', error: msg };
      }
      stats.errors += 1;
      console.warn(
        JSON.stringify({
          event: 'messages_recent_backfill_list_failed',
          academy_id: academyId || null,
          cursor: cursor || null,
          error: msg,
        })
      );
      break;
    }

    const docs = page.documents || [];
    if (!docs.length) {
      stats.done = true;
      break;
    }

    for (const doc of docs) {
      if (Date.now() - t0 >= maxMs || stats.backfilled >= maxBackfill) break;

      stats.scanned += 1;
      cursor = String(doc.$id || '').trim();
      stats.next_cursor = cursor;

      if (!conversationNeedsMessagesRecentBackfill(doc)) {
        stats.skippedAlreadyOk += 1;
        continue;
      }

      stats.candidates += 1;

      try {
        const messagesRaw = await fetchConversationMessages(databases, dbId, doc.$id);
        const hasMessages =
          typeof messagesRaw === 'string'
            ? messagesRaw.trim() && messagesRaw.trim() !== '[]'
            : Array.isArray(messagesRaw) && messagesRaw.length > 0;

        if (!hasMessages) {
          stats.skippedEmpty += 1;
          continue;
        }

        if (dryRun) {
          stats.backfilled += 1;
          continue;
        }

        const result = await backfillMessagesRecentFromFull(doc.$id, messagesRaw);
        if (result.ok) {
          stats.backfilled += 1;
        } else if (result.skipped) {
          stats.skippedEmpty += 1;
        } else {
          stats.errors += 1;
          console.warn(
            JSON.stringify({
              event: 'messages_recent_backfill_doc_failed',
              conversationId: doc.$id,
              academy_id: String(doc.academy_id || '').trim() || null,
              error: result.erro || 'unknown',
            })
          );
        }
      } catch (e) {
        stats.errors += 1;
        console.warn(
          JSON.stringify({
            event: 'messages_recent_backfill_doc_failed',
            conversationId: doc.$id,
            academy_id: String(doc.academy_id || '').trim() || null,
            error: e?.message || String(e),
          })
        );
      }
    }

    if (docs.length < DEFAULT_PAGE_SIZE) {
      stats.done = true;
      break;
    }
  }

  if (!stats.done && stats.backfilled >= maxBackfill) {
    stats.next_cursor = cursor;
  }

  return stats;
}

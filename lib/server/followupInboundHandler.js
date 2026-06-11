import { Query } from 'node-appwrite';
import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { DB_ID } from './appwriteCollections.js';
import { FOLLOWUP_AGENDA_MAX_DAYS } from '../../src/lib/followupState.js';
import {
  buildInboundMapsFromConversations,
  extractLastUserMessageAt,
} from '../../src/lib/followupInbound.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';

const adminClient =
  PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = adminClient ? new Databases(adminClient) : null;

const INBOUND_SELECT = [
  'lead_id',
  'phone_number',
  'last_user_msg_at',
  'last_message_role',
  'last_message_timestamp',
  'messages_recent',
  'messages',
];

export default async function followupInboundHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!databases || !CONVERSATIONS_COL) {
    return res.status(503).json({ error: 'appwrite_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FOLLOWUP_AGENDA_MAX_DAYS);
  const cutoffIso = cutoff.toISOString();
  const cutoffMs = cutoff.getTime();
  const matched = [];
  let cursor = null;
  let pageCount = 0;

  try {
    do {
      const queries = [
        Query.equal('academy_id', [academyId]),
        Query.orderDesc('updated_at'),
        Query.limit(100),
      ];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      let list;
      try {
        list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
          ...queries,
          Query.select(INBOUND_SELECT),
        ]);
      } catch {
        list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, queries);
      }

      const page = list.documents || [];
      for (const doc of page) {
        const at = extractLastUserMessageAt(doc);
        if (!at) continue;
        const atMs = new Date(at).getTime();
        if (!Number.isFinite(atMs) || atMs < cutoffMs) continue;
        matched.push(doc);
      }

      cursor = page.length === 100 ? page[page.length - 1]?.$id : null;
      pageCount += 1;
    } while (cursor && pageCount < 10);

    const maps = buildInboundMapsFromConversations(matched);
    return res.status(200).json({
      ok: true,
      cutoffIso,
      ...maps,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'followup_inbound_failed' });
  }
}

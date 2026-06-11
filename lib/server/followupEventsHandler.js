import { Query } from 'node-appwrite';
import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { DB_ID, LEAD_EVENTS_COL } from './appwriteCollections.js';
import { FOLLOWUP_AGENDA_MAX_DAYS } from '../../src/lib/followupState.js';
import { buildFollowupEventMapsFromDocs } from '../../src/lib/followupEventsMaps.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

const adminClient =
  PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = adminClient ? new Databases(adminClient) : null;

const FOLLOWUP_EVENT_TYPES = [
  'followup_done',
  'followup_contact',
  'followup_snooze',
  'whatsapp_template_sent',
];

export default async function followupEventsHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!databases || !LEAD_EVENTS_COL) {
    return res.status(500).json({ error: 'appwrite_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FOLLOWUP_AGENDA_MAX_DAYS);
  const cutoffIso = cutoff.toISOString();

  const docs = [];
  let cursor = null;
  let pageCount = 0;

  try {
    do {
      const queries = [
        Query.equal('academy_id', [academyId]),
        Query.equal('type', FOLLOWUP_EVENT_TYPES),
        Query.greaterThan('at', cutoffIso),
        Query.orderDesc('at'),
        Query.limit(100),
      ];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const list = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, queries);
      const page = list.documents || [];
      docs.push(...page);
      cursor = page.length === 100 ? page[page.length - 1]?.$id : null;
      pageCount += 1;
    } while (cursor && pageCount < 10);

    const maps = buildFollowupEventMapsFromDocs(docs);
    return res.status(200).json({
      ok: true,
      cutoffIso,
      ...maps,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'followup_events_failed' });
  }
}

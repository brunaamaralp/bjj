/**
 * lead_events — servidor (node-appwrite).
 * Env: APPWRITE_LEAD_EVENTS_COLLECTION_ID ou VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID
 */
import { Client, Databases, Permission, Role, ID, Query } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEAD_EVENTS_COL =
  String(process.env.APPWRITE_LEAD_EVENTS_COLLECTION_ID || process.env.VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID || '').trim();

const adminClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = adminClient ? new Databases(adminClient) : null;

function defaultPerms() {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users())
  ];
}

export async function addLeadEventServer({
  academyId,
  leadId,
  type,
  from = '',
  to = '',
  text = '',
  at = new Date().toISOString(),
  createdBy = 'system',
  payloadJson = null
}) {
  if (!databases || !DB_ID || !LEAD_EVENTS_COL) {
    console.warn('[leadEvents/server] collection ou config ausente');
    return null;
  }
  const aid = String(academyId || '').trim();
  const lid = String(leadId || '').trim();
  if (!aid || !lid || !type) return null;

  const doc = {
    academy_id: aid,
    lead_id: lid,
    type: String(type).slice(0, 64),
    from: from != null ? String(from).slice(0, 128) : '',
    to: to != null ? String(to).slice(0, 128) : '',
    text: text != null ? String(text).slice(0, 1000) : '',
    at,
    created_by: String(createdBy || 'system').slice(0, 50),
    payload_json: payloadJson != null ? JSON.stringify(payloadJson).slice(0, 65535) : ''
  };

  return databases.createDocument(DB_ID, LEAD_EVENTS_COL, ID.unique(), doc, defaultPerms());
}

export async function listLeadEventsServer(leadId, academyId, limit = 100) {
  if (!databases || !DB_ID || !LEAD_EVENTS_COL) return [];
  const res = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, [
    Query.equal('lead_id', String(leadId || '').trim()),
    Query.equal('academy_id', String(academyId || '').trim()),
    Query.orderDesc('at'),
    Query.limit(Math.min(limit, 500))
  ]);
  return res.documents || [];
}

/**
 * Snapshots diários do funil (report_snapshots).
 * Env: APPWRITE_REPORT_SNAPSHOTS_COLLECTION_ID
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';

const SNAPSHOT_COL = () =>
  String(
    process.env.APPWRITE_REPORT_SNAPSHOTS_COLLECTION_ID ||
      process.env.VITE_APPWRITE_REPORT_SNAPSHOTS_COLLECTION_ID ||
      ''
  ).trim();

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function snapshotKey(academyId, from, to, filters, chartMode, slice = 'funnel') {
  return JSON.stringify({
    academyId,
    from: String(from || '').slice(0, 10),
    to: String(to || '').slice(0, 10),
    origin: filters?.origin || 'all',
    type: filters?.type || 'all',
    chartMode: chartMode || 'weekly',
    slice: slice || 'funnel',
  });
}

export async function loadReportSnapshot(academyId, from, to, filters, chartMode, slice = 'funnel') {
  const col = SNAPSHOT_COL();
  if (!col || !DB_ID) return null;
  const key = snapshotKey(academyId, from, to, filters, chartMode, slice);
  try {
    const list = await databases.listDocuments(DB_ID, col, [
      Query.equal('academy_id', academyId),
      Query.equal('snapshot_key', key),
      Query.orderDesc('updated_at'),
      Query.limit(1),
    ]);
    const doc = list.documents?.[0];
    if (!doc?.payload_json) return null;
    const payload = typeof doc.payload_json === 'string' ? JSON.parse(doc.payload_json) : doc.payload_json;
    return {
      payload,
      updatedAt: doc.updated_at || doc.$updatedAt,
      id: doc.$id,
    };
  } catch (e) {
    console.warn('[reportSnapshots] load', e?.message);
    return null;
  }
}

export async function saveReportSnapshot(academyId, from, to, filters, chartMode, payload, slice = 'funnel') {
  const col = SNAPSHOT_COL();
  if (!col || !DB_ID) return null;
  const key = snapshotKey(academyId, from, to, filters, chartMode, slice);
  const now = new Date().toISOString();
  const data = {
    academy_id: academyId,
    snapshot_date: todayYmd(),
    snapshot_key: key,
    payload_json: JSON.stringify(payload),
    updated_at: now,
    lead_count: Number(payload.leadCount || 0),
  };
  try {
    const existing = await databases.listDocuments(DB_ID, col, [
      Query.equal('academy_id', academyId),
      Query.equal('snapshot_key', key),
      Query.limit(1),
    ]);
    if (existing.documents?.[0]) {
      const doc = await databases.updateDocument(DB_ID, col, existing.documents[0].$id, data);
      return doc.$id;
    }
    const doc = await databases.createDocument(DB_ID, col, ID.unique(), data, [
      Permission.read(Role.users()),
    ]);
    return doc.$id;
  } catch (e) {
    console.warn('[reportSnapshots] save', e?.message);
    return null;
  }
}

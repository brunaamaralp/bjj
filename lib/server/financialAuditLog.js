/**
 * financial_audit_log — trilha de operações em mensalidades (student_payments).
 * Env: APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID
 */
import { Client, Databases, ID, Permission, Role } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const AUDIT_COL = () =>
  String(
    process.env.APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID ||
      process.env.VITE_APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID ||
      ''
  ).trim();

let cachedDb = null;

function getDb() {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !AUDIT_COL()) return null;
  if (!cachedDb) {
    cachedDb = new Databases(
      new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
    );
  }
  return cachedDb;
}

export async function recordFinancialAudit(entry) {
  const db = getDb();
  if (!db) {
    console.warn('[financial_audit] collection not configured');
    return null;
  }

  const payload = {
    action: String(entry.action || '').slice(0, 64),
    payment_id: entry.payment_id ? String(entry.payment_id) : '',
    student_id: entry.student_id ? String(entry.student_id) : '',
    academy_id: String(entry.academy_id || ''),
    user_id: String(entry.user_id || 'system').slice(0, 64),
    amount: entry.amount != null ? Number(entry.amount) : null,
    previous_status: entry.previous_status ? String(entry.previous_status) : '',
    new_status: entry.new_status ? String(entry.new_status) : '',
    timestamp: entry.timestamp || new Date().toISOString(),
    meta_json:
      entry.meta != null
        ? typeof entry.meta === 'string'
          ? entry.meta
          : JSON.stringify(entry.meta).slice(0, 4000)
        : '',
  };

  try {
    const doc = await db.createDocument(DB_ID, AUDIT_COL(), ID.unique(), payload, [
      Permission.read(Role.users()),
    ]);
    return doc.$id;
  } catch (e) {
    console.error('[financial_audit]', e?.message || e);
    return null;
  }
}

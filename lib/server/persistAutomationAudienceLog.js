/**
 * Grava entrada em automation_logs (servidor / cron).
 */
import { Client, Databases, ID } from 'node-appwrite';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const COL =
  process.env.VITE_APPWRITE_AUTOMATION_LOGS_COLLECTION_ID ||
  process.env.APPWRITE_AUTOMATION_LOGS_COLLECTION_ID ||
  '';

let databases = null;

function getDb() {
  if (!COL || !DB_ID || !API_KEY || !PROJECT_ID) return null;
  if (!databases) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    databases = new Databases(client);
  }
  return databases;
}

/**
 * @param {Record<string, unknown>} entry
 */
export async function persistAutomationAudienceLog(entry) {
  const db = getDb();
  if (!db || !entry) return;

  const reasons = Array.isArray(entry.reasons)
    ? entry.reasons.map((r) => String(r)).filter(Boolean)
    : [];

  await db.createDocument(DB_ID, COL, ID.unique(), {
    academy_id: String(entry.academy_id || '').trim(),
    trigger: String(entry.trigger || '').trim(),
    student_id: String(entry.student_id || '').trim(),
    passed: entry.passed === true,
    reasons,
    sent: entry.sent === true,
    evaluated_at: String(entry.evaluated_at || new Date().toISOString()),
    sent_at: entry.sent_at ? String(entry.sent_at) : null,
  });
}

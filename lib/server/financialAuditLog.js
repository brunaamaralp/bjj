/**
 * financial_audit_log — trilha de operações em mensalidades (student_payments).
 * Fase 2: espelha em academy_events via recordAuditEvent.
 * Env: APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID
 */
import { Client, Databases, ID, Permission, Role } from 'node-appwrite';
import { recordAuditEvent } from './auditLog.js';
import {
  FINANCE_AUDIT_SKIP_ACADEMY_MIRROR,
  defaultFinanceAuditSummary,
  financeActionToAuditEvent,
} from './auditEventTypes.js';

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

function financeTargetType(action) {
  const a = String(action || '').trim();
  if (a.startsWith('sale')) return 'sale';
  if (a.startsWith('payment')) return 'payment';
  if (a.startsWith('tx')) return 'finance_tx';
  return 'finance';
}

export async function recordFinancialAudit(entry) {
  const db = getDb();
  const action = String(entry.action || '').trim();
  const academyId = String(entry.academy_id || '').trim();
  const userId = String(entry.user_id || 'system').slice(0, 64);

  const payload = {
    action: action.slice(0, 64),
    payment_id: entry.payment_id ? String(entry.payment_id) : '',
    student_id: entry.student_id ? String(entry.student_id) : '',
    academy_id: academyId,
    user_id: userId,
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

  let auditId = null;
  if (db) {
    try {
      const doc = await db.createDocument(DB_ID, AUDIT_COL(), ID.unique(), payload, [
        Permission.read(Role.users()),
      ]);
      auditId = doc.$id;
    } catch (e) {
      console.error('[financial_audit]', e?.message || e);
    }
  } else {
    console.warn('[financial_audit] collection not configured');
  }

  if (academyId && action && !FINANCE_AUDIT_SKIP_ACADEMY_MIRROR.has(action)) {
    const eventType = financeActionToAuditEvent(action);
    if (eventType) {
      const targetId = String(entry.payment_id || entry.student_id || '').trim();
      recordAuditEvent({
        eventType,
        academyId,
        actor: {
          type: userId === 'system' || userId === 'cron' ? userId : 'user',
          id: userId,
          name: String(entry.user_name || entry.actor_name || '').trim(),
        },
        target: targetId
          ? { type: financeTargetType(action), id: targetId, name: '' }
          : undefined,
        context: entry.student_id ? { lead_id: String(entry.student_id) } : {},
        source: 'legacy.recordFinancialAudit',
        summary: defaultFinanceAuditSummary(action, entry),
        payload: {
          action,
          amount: entry.amount,
          previous_status: entry.previous_status,
          new_status: entry.new_status,
          payment_id: entry.payment_id,
          student_id: entry.student_id,
          financial_audit_id: auditId,
        },
      }).catch((e) => console.warn('[financial_audit] Falha ao espelhar em academy_events:', e?.message || e));
    }
  }

  return auditId;
}

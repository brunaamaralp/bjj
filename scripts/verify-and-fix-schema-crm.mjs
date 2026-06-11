/**
 * Verifica e provisiona schema Appwrite — CRM + Financeiro avançado + Auditoria + Academia.
 *
 * Uso: node scripts/verify-and-fix-schema-crm.mjs
 *
 * Fonte da verdade: campos usados em lib/server/, api/, src/, functions/.
 * Coleções sem env → puladas. ACCOUNTS/JOURNAL existem no código (não são só proposta).
 *
 * --- SCHEMA PROPOSTO (não provisionado automaticamente se não houver env) ---
 * Se no futuro ACCOUNTS_COL / JOURNAL_COL estiverem vazios no .env, ver blocos 7–8 abaixo.
 */
import { Client, Databases } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function applyEnvFile(relPath, { override } = { override: false }) {
  try {
    const p = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf-8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) return;
      const k = m[1];
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      if (override || !(k in process.env)) process.env[k] = v;
    });
  } catch {
    void 0;
  }
}

applyEnvFile('.env', { override: false });
applyEnvFile('.env.local', { override: true });

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID =
  process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || process.env.DB_ID || '';

const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const TASKS_COL =
  process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';
const TASK_TEMPLATES_COL =
  process.env.VITE_APPWRITE_TASK_TEMPLATES_COLLECTION_ID ||
  process.env.APPWRITE_TASK_TEMPLATES_COLLECTION_ID ||
  '';
const BANK_STATEMENTS_COL =
  process.env.VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID || process.env.BANK_STATEMENTS_COL || '';
const BANK_STATEMENT_ITEMS_COL =
  process.env.VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID ||
  process.env.BANK_STATEMENT_ITEMS_COL ||
  '';
const ACCOUNTS_COL =
  process.env.VITE_APPWRITE_ACCOUNTS_COLLECTION_ID || process.env.APPWRITE_ACCOUNTS_COLLECTION_ID || '';
const JOURNAL_COL =
  process.env.VITE_APPWRITE_JOURNAL_COLLECTION_ID || process.env.APPWRITE_JOURNAL_COLLECTION_ID || '';
const ACADEMY_EVENTS_COL =
  process.env.APPWRITE_ACADEMY_EVENTS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_ACADEMY_EVENTS_COLLECTION_ID ||
  '';
const AUDIT_COL =
  process.env.APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID ||
  process.env.VITE_APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID ||
  '';
const LEAD_EVENTS_COL =
  process.env.APPWRITE_LEAD_EVENTS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID ||
  '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const ATTR_GAP_MS = Number(process.env.PROVISION_ATTR_GAP_MS || 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emptyStats() {
  return { created: 0, exists: 0, divergent: 0, errors: 0, skipped: false };
}

const summary = {
  LEADS: emptyStats(),
  STUDENTS: emptyStats(),
  TASKS: emptyStats(),
  TASK_TEMPLATES: emptyStats(),
  BANK_STATEMENTS: emptyStats(),
  BANK_STATEMENT_ITEMS: emptyStats(),
  ACCOUNTS: emptyStats(),
  JOURNAL: emptyStats(),
  ACADEMY_EVENTS: emptyStats(),
  financial_audit: emptyStats(),
  ACADEMIES: emptyStats(),
  LEAD_EVENTS: emptyStats(),
};

function isAlreadyExists(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = Number(err?.code || err?.response?.code || 0);
  return (
    code === 409 ||
    msg.includes('already exists') ||
    msg.includes('attribute already') ||
    msg.includes('index already') ||
    msg.includes('duplicate')
  );
}

function normalizeAttrType(attr) {
  return String(attr?.type || '').toLowerCase();
}

function isNumericType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'double' || t === 'float' || t === 'number';
}

function typesCompatible(expected, found, { key } = {}) {
  const f = normalizeAttrType(found);
  if (!f) return false;
  if (expected === 'string') return f === 'string';
  if (expected === 'float') return isNumericType(f);
  if (expected === 'integer') return f === 'integer' || (isNumericType(f) && /day|degree|quota|installments/i.test(key));
  if (expected === 'boolean') return f === 'boolean';
  if (expected === 'datetime') return f === 'datetime' || f === 'string';
  return f === expected;
}

async function listAttrMap(databases, collectionId) {
  const res = await databases.listAttributes({ databaseId: DB_ID, collectionId });
  return new Map((res.attributes || []).map((a) => [a.key, a]));
}

async function listIndexKeys(databases, collectionId) {
  const res = await databases.listIndexes({ databaseId: DB_ID, collectionId });
  return new Set((res.indexes || []).map((i) => i.key));
}

async function waitForAttribute(databases, collectionId, key) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const res = await databases.listAttributes({ databaseId: DB_ID, collectionId });
    const attr = (res.attributes || []).find((a) => a.key === key);
    if (!attr) {
      await sleep(800);
      continue;
    }
    const status = String(attr.status || '').toLowerCase();
    if (status === 'available' || status === 'enabled') return 'available';
    if (status === 'failed') throw new Error(attr.error || 'attribute_failed');
    if (status === 'processing' || status === 'creating' || status === 'staged') return 'processing';
    await sleep(1500);
  }
  const res = await databases.listAttributes({ databaseId: DB_ID, collectionId });
  const attr = (res.attributes || []).find((a) => a.key === key);
  if (attr) {
    const status = String(attr.status || '').toLowerCase();
    if (status === 'failed') throw new Error(attr.error || 'attribute_failed');
    if (status !== 'available' && status !== 'enabled') return 'processing';
    return 'available';
  }
  throw new Error('timeout_waiting_attribute');
}

async function ensureAttr(databases, collectionId, statsKey, spec) {
  const stats = summary[statsKey];
  const { key, type, size = 64, required = false } = spec;
  const label = statsKey;

  let attrMap;
  try {
    attrMap = await listAttrMap(databases, collectionId);
  } catch (e) {
    console.log(`❌ erro — ${label}.${key}: não foi possível listar atributos (${e?.message || e})`);
    stats.errors += 1;
    return;
  }

  const existing = attrMap.get(key);
  if (existing) {
    if (typesCompatible(type, existing, { key })) {
      console.log(`⏭ já existe — ${label}.${key}`);
      stats.exists += 1;
    } else {
      console.log(
        `⚠️ divergente — ${label}.${key} (esperado: ${type}, encontrado: ${normalizeAttrType(existing) || 'desconhecido'})`
      );
      stats.divergent += 1;
    }
    return;
  }

  try {
    if (type === 'string') {
      await databases.createStringAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        size,
        required,
      });
    } else if (type === 'float') {
      await databases.createFloatAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
        xdefault: 0,
      });
    } else if (type === 'integer') {
      await databases.createIntegerAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
      });
    } else if (type === 'boolean') {
      await databases.createBooleanAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
        xdefault: spec.default === true,
      });
    } else if (type === 'datetime') {
      await databases.createDatetimeAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
      });
    }
    try {
      const waitState = await waitForAttribute(databases, collectionId, key);
      if (waitState === 'processing') {
        console.log(`⏭ já existe (processando) — ${label}.${key}`);
        stats.exists += 1;
      } else {
        console.log(`✅ criado — ${label}.${key}`);
        stats.created += 1;
      }
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('timeout_waiting_attribute')) {
        try {
          const again = await listAttrMap(databases, collectionId);
          const late = again.get(key);
          if (late && typesCompatible(type, late, { key })) {
            console.log(`⏭ já existe (processando) — ${label}.${key}`);
            stats.exists += 1;
            await sleep(ATTR_GAP_MS);
            return;
          }
        } catch {
          void 0;
        }
      }
      console.log(`❌ erro — ${label}.${key}: ${msg}`);
      stats.errors += 1;
      await sleep(ATTR_GAP_MS);
      return;
    }
  } catch (e) {
    if (isAlreadyExists(e)) {
      console.log(`⏭ já existe — ${label}.${key}`);
      stats.exists += 1;
    } else {
      console.log(`❌ erro — ${label}.${key}: ${e?.message || e}`);
      stats.errors += 1;
    }
  }
  await sleep(ATTR_GAP_MS);
}

async function ensureIndex(databases, collectionId, statsKey, indexKey, attributes) {
  const stats = summary[statsKey];
  const label = statsKey;

  let keys;
  try {
    keys = await listIndexKeys(databases, collectionId);
  } catch (e) {
    console.log(`❌ erro — ${label} índice ${indexKey}: ${e?.message || e}`);
    stats.errors += 1;
    return;
  }

  if (keys.has(indexKey)) {
    console.log(`⏭ já existe — ${label} índice ${indexKey}`);
    stats.exists += 1;
    return;
  }

  try {
    await databases.createIndex({
      databaseId: DB_ID,
      collectionId,
      key: indexKey,
      type: 'key',
      attributes,
    });
    console.log(`✅ criado — ${label} índice ${indexKey}`);
    stats.created += 1;
  } catch (e) {
    if (isAlreadyExists(e)) {
      console.log(`⏭ já existe — ${label} índice ${indexKey}`);
      stats.exists += 1;
    } else {
      console.log(`❌ erro — ${label} índice ${indexKey}: ${e?.message || e}`);
      stats.errors += 1;
    }
  }
  await sleep(ATTR_GAP_MS);
}

async function processCollection(databases, { id, statsKey, title, attrs, indexes }) {
  const cid = String(id || '').trim();
  if (!cid) {
    console.log(`\n⏭ collection não configurada no .env — ${title} (pulando)`);
    summary[statsKey].skipped = true;
    return;
  }
  console.log(`\n══ ${title} (${cid}) ══`);
  try {
    await databases.getCollection(DB_ID, cid);
  } catch (e) {
    console.log(`❌ ${title}: coleção inacessível — ${e?.message || e}`);
    summary[statsKey].errors += 1;
    return;
  }
  for (const spec of attrs) {
    try {
      await ensureAttr(databases, cid, statsKey, spec);
    } catch (e) {
      console.log(`❌ erro — ${statsKey}.${spec.key}: ${e?.message || e}`);
      summary[statsKey].errors += 1;
    }
  }
  for (const { key, attributes } of indexes) {
    try {
      await ensureIndex(databases, cid, statsKey, key, attributes);
    } catch (e) {
      console.log(`❌ erro — ${statsKey} índice ${key}: ${e?.message || e}`);
      summary[statsKey].errors += 1;
    }
  }
}

/** Campos usados em useLeadStore, mapAppwriteLeadDoc, agentRespond, api/leads */
const LEADS_ATTRS = [
  { key: 'academyId', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'name', type: 'string', size: 128 },
  { key: 'phone', type: 'string', size: 32 },
  { key: 'phone_number', type: 'string', size: 32 },
  { key: 'email', type: 'string', size: 128 },
  { key: 'status', type: 'string', size: 32 },
  { key: 'pipeline_stage', type: 'string', size: 64 },
  { key: 'pipeline_stage_changed_at', type: 'string', size: 64 },
  { key: 'status_changed_at', type: 'string', size: 64 },
  { key: 'origin', type: 'string', size: 128 },
  { key: 'source', type: 'string', size: 128 },
  { key: 'contact_type', type: 'string', size: 32 },
  { key: 'type', type: 'string', size: 32 },
  { key: 'assigned_to', type: 'string', size: 64 },
  { key: 'assigned_name', type: 'string', size: 128 },
  { key: 'notes', type: 'string', size: 2048 },
  { key: 'tags_json', type: 'string', size: 2048 },
  { key: 'created_by', type: 'string', size: 64 },
  { key: 'created_by_name', type: 'string', size: 128 },
  { key: 'converted_at', type: 'string', size: 64 },
  { key: 'converted_by', type: 'string', size: 64 },
  { key: 'last_contact_at', type: 'string', size: 64 },
  { key: 'last_whatsapp_activity_at', type: 'string', size: 64 },
  { key: 'last_note_at', type: 'string', size: 64 },
  { key: 'utm_source', type: 'string', size: 128 },
  { key: 'utm_medium', type: 'string', size: 128 },
  { key: 'utm_campaign', type: 'string', size: 128 },
  { key: 'scheduledDate', type: 'string', size: 16 },
  { key: 'scheduledTime', type: 'string', size: 16 },
  { key: 'parentName', type: 'string', size: 128 },
  { key: 'age', type: 'string', size: 8 },
  { key: 'birth_date', type: 'string', size: 16 },
  { key: 'sexo', type: 'string', size: 16 },
  { key: 'belt', type: 'string', size: 32 },
  { key: 'custom_answers_json', type: 'string', size: 8192 },
  { key: 'is_first_experience', type: 'string', size: 8 },
  { key: 'student_status', type: 'string', size: 16 },
  { key: 'exit_reason', type: 'string', size: 256 },
  { key: 'exit_date', type: 'string', size: 16 },
  { key: 'whatsapp_intention', type: 'string', size: 64 },
  { key: 'whatsapp_priority', type: 'string', size: 32 },
  { key: 'whatsapp_lead_quente', type: 'string', size: 8 },
  { key: 'whatsapp_classified_at', type: 'string', size: 64 },
  { key: 'need_human', type: 'boolean' },
  { key: 'attended_at', type: 'string', size: 64 },
  { key: 'missed_at', type: 'string', size: 64 },
  { key: 'lost_at', type: 'string', size: 64 },
  { key: 'lostReason', type: 'string', size: 256 },
  { key: 'imported_at', type: 'string', size: 64 },
  { key: 'pending_automations', type: 'string', size: 4096 },
  { key: 'has_pending_automations', type: 'boolean' },
  { key: 'label_ids', type: 'string', size: 2048 },
];

/** leadStudentPayload.js, useStudentStore, studentsHandler, collectionRules */
const STUDENTS_ATTRS = [
  { key: 'academyId', type: 'string', size: 64 },
  { key: 'name', type: 'string', size: 128 },
  { key: 'phone', type: 'string', size: 32 },
  { key: 'email', type: 'string', size: 128 },
  { key: 'cpf', type: 'string', size: 20 },
  { key: 'birth_date', type: 'string', size: 16 },
  { key: 'plan', type: 'string', size: 128 },
  { key: 'plan_billing', type: 'string', size: 16 },
  { key: 'due_day', type: 'integer' },
  { key: 'student_status', type: 'string', size: 32 },
  { key: 'belt', type: 'string', size: 32 },
  { key: 'enrollmentDate', type: 'string', size: 16 },
  { key: 'converted_at', type: 'string', size: 64 },
  { key: 'exit_reason', type: 'string', size: 256 },
  { key: 'exit_date', type: 'string', size: 16 },
  { key: 'emergencyContact', type: 'string', size: 256 },
  { key: 'emergencyPhone', type: 'string', size: 32 },
  { key: 'preferred_payment_method', type: 'string', size: 32 },
  { key: 'preferred_payment_account', type: 'string', size: 128 },
  { key: 'type', type: 'string', size: 32 },
  { key: 'sexo', type: 'string', size: 16 },
  { key: 'parentName', type: 'string', size: 128 },
  { key: 'source_origin', type: 'string', size: 128 },
  { key: 'custom_answers_json', type: 'string', size: 8192 },
  { key: 'label_ids', type: 'string', size: 2048 },
  { key: 'turma', type: 'string', size: 64 },
  { key: 'freeze_start', type: 'string', size: 16 },
  { key: 'freeze_end', type: 'string', size: 16 },
  { key: 'freeze_status', type: 'string', size: 16 },
  { key: 'freeze_days_used', type: 'integer' },
  { key: 'freeze_quota_year', type: 'string', size: 16 },
  { key: 'device_id', type: 'integer' },
  { key: 'controlid_user_id', type: 'integer' },
  { key: 'controlid_synced', type: 'boolean' },
  { key: 'controlid_sync_error', type: 'string', size: 256 },
  { key: 'photo_url', type: 'string', size: 512 },
  { key: 'collection_snooze_month', type: 'string', size: 7 },
  { key: 'collection_snooze_until', type: 'string', size: 32 },
  { key: 'overdue', type: 'boolean' },
  { key: 'overdue_label', type: 'string', size: 30 },
];

/** api/tasks.js, applyTaskTemplate.js, inventoryMoveHandler */
const TASKS_ATTRS = [
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'title', type: 'string', size: 256 },
  { key: 'description', type: 'string', size: 8192 },
  { key: 'status', type: 'string', size: 32 },
  { key: 'due_date', type: 'string', size: 32 },
  { key: 'assigned_to', type: 'string', size: 64 },
  { key: 'assigned_name', type: 'string', size: 128 },
  { key: 'lead_id', type: 'string', size: 64 },
  { key: 'lead_name', type: 'string', size: 128 },
  { key: 'created_by', type: 'string', size: 64 },
  { key: 'created_by_name', type: 'string', size: 128 },
  { key: 'created_at', type: 'string', size: 64 },
  { key: 'updated_at', type: 'string', size: 64 },
  { key: 'completed_at', type: 'string', size: 64 },
  { key: 'completed_by', type: 'string', size: 64 },
  { key: 'completed_by_name', type: 'string', size: 128 },
  { key: 'priority', type: 'string', size: 16 },
  { key: 'template_id', type: 'string', size: 64 },
  { key: 'template_batch_id', type: 'string', size: 64 },
  { key: 'template_name', type: 'string', size: 128 },
  { key: 'trigger', type: 'string', size: 32 },
  { key: 'category', type: 'string', size: 64 },
];

/** leadEvents.js, agentActionAudit.js */
const LEAD_EVENTS_ATTRS = [
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'lead_id', type: 'string', size: 64 },
  { key: 'type', type: 'string', size: 64 },
  { key: 'from', type: 'string', size: 128 },
  { key: 'to', type: 'string', size: 128 },
  { key: 'text', type: 'string', size: 1000 },
  { key: 'at', type: 'string', size: 64 },
  { key: 'created_by', type: 'string', size: 64 },
  { key: 'payload_json', type: 'string', size: 65535 },
];

const TASK_TEMPLATES_ATTRS = [
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'name', type: 'string', size: 128 },
  { key: 'trigger', type: 'string', size: 32 },
  { key: 'items_json', type: 'string', size: 8192 },
  { key: 'enabled', type: 'boolean', default: true },
  { key: 'created_by', type: 'string', size: 64 },
  { key: 'created_at', type: 'string', size: 64 },
  { key: 'updated_at', type: 'string', size: 64 },
];

/** bankReconciliationHandler.js, provision-finance-features-schema.mjs */
const BANK_STATEMENTS_ATTRS = [
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'bank', type: 'string', size: 64 },
  { key: 'account', type: 'string', size: 64 },
  { key: 'filename', type: 'string', size: 256 },
  { key: 'period_start', type: 'string', size: 10 },
  { key: 'period_end', type: 'string', size: 10 },
  { key: 'import_date', type: 'datetime' },
  { key: 'imported_at', type: 'string', size: 64 },
  { key: 'imported_by', type: 'string', size: 64 },
  { key: 'imported_by_name', type: 'string', size: 128 },
  { key: 'status', type: 'string', size: 16 },
  { key: 'total_credit', type: 'float' },
  { key: 'total_debit', type: 'float' },
  { key: 'total_credits', type: 'float' },
  { key: 'total_debits', type: 'float' },
  { key: 'file_url', type: 'string', size: 512 },
  { key: 'completion_note', type: 'string', size: 2000 },
  { key: 'completed_at', type: 'datetime' },
  { key: 'completed_by', type: 'string', size: 64 },
];

const BANK_STATEMENT_ITEMS_ATTRS = [
  { key: 'statement_id', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'date', type: 'string', size: 10 },
  { key: 'description', type: 'string', size: 512 },
  { key: 'amount', type: 'float' },
  { key: 'direction', type: 'string', size: 8 },
  { key: 'balance', type: 'float' },
  { key: 'matched_tx_id', type: 'string', size: 64 },
  { key: 'financial_tx_id', type: 'string', size: 64 },
  { key: 'suggested_tx_id', type: 'string', size: 64 },
  { key: 'match_score', type: 'float' },
  { key: 'status', type: 'string', size: 16 },
  { key: 'conciliated', type: 'boolean' },
  { key: 'conciliated_at', type: 'string', size: 64 },
  { key: 'conciliated_by', type: 'string', size: 64 },
];

/** AccountsTab.jsx, financeJournalServer.js, CaixaAccountingPanel.jsx */
const ACCOUNTS_ATTRS = [
  { key: 'academyId', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'code', type: 'string', size: 32 },
  { key: 'name', type: 'string', size: 128 },
  { key: 'type', type: 'string', size: 32 },
  { key: 'nature', type: 'string', size: 16 },
  { key: 'parent_id', type: 'string', size: 64 },
  { key: 'dreGrupo', type: 'string', size: 64 },
  { key: 'dfcClasse', type: 'string', size: 64 },
  { key: 'dfcSubclasse', type: 'string', size: 64 },
  { key: 'cash', type: 'boolean' },
  { key: 'is_active', type: 'boolean', default: true },
  { key: 'created_by', type: 'string', size: 64 },
];

/** JournalTab.jsx, financeJournalServer.js */
const JOURNAL_ATTRS = [
  { key: 'academyId', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'financial_tx_id', type: 'string', size: 64 },
  { key: 'account_id', type: 'string', size: 64 },
  { key: 'date', type: 'string', size: 16 },
  { key: 'memo', type: 'string', size: 2048 },
  { key: 'lines', type: 'string', size: 16384 },
  { key: 'direction', type: 'string', size: 8 },
  { key: 'amount', type: 'float' },
  { key: 'description', type: 'string', size: 512 },
  { key: 'competence_date', type: 'string', size: 16 },
  { key: 'competence_month', type: 'string', size: 7 },
  { key: 'created_at', type: 'string', size: 64 },
  { key: 'created_by', type: 'string', size: 64 },
];

/** academyEvents.js */
const ACADEMY_EVENTS_ATTRS = [
  { key: 'event_type', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'actor_user_id', type: 'string', size: 64 },
  { key: 'actor_name', type: 'string', size: 128 },
  { key: 'target_type', type: 'string', size: 32 },
  { key: 'target_id', type: 'string', size: 64 },
  { key: 'target_user_id', type: 'string', size: 64 },
  { key: 'target_name', type: 'string', size: 128 },
  { key: 'previous_role', type: 'string', size: 32 },
  { key: 'new_role', type: 'string', size: 32 },
  { key: 'changed_fields', type: 'string', size: 512 },
  { key: 'previous_values', type: 'string', size: 4096 },
  { key: 'new_values', type: 'string', size: 4096 },
  { key: 'timestamp', type: 'string', size: 64 },
  { key: 'payload_json', type: 'string', size: 65535 },
  { key: 'ip', type: 'string', size: 64 },
  { key: 'user_agent', type: 'string', size: 512 },
];

/** financialAuditLog.js — código usa previous_status/new_status (não status_before/after) */
const FINANCIAL_AUDIT_ATTRS = [
  { key: 'action', type: 'string', size: 64 },
  { key: 'payment_id', type: 'string', size: 64 },
  { key: 'student_id', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'user_id', type: 'string', size: 64 },
  { key: 'user_name', type: 'string', size: 128 },
  { key: 'amount', type: 'float' },
  { key: 'previous_status', type: 'string', size: 32 },
  { key: 'new_status', type: 'string', size: 32 },
  { key: 'status_before', type: 'string', size: 32 },
  { key: 'status_after', type: 'string', size: 32 },
  { key: 'timestamp', type: 'string', size: 64 },
  { key: 'meta_json', type: 'string', size: 4096 },
];

/** planService, App.jsx, ensure-academy-attrs, AcademySettings */
const ACADEMIES_ATTRS = [
  { key: 'ownerId', type: 'string', size: 64 },
  { key: 'owner_id', type: 'string', size: 64 },
  { key: 'name', type: 'string', size: 128 },
  { key: 'slug', type: 'string', size: 64 },
  { key: 'phone', type: 'string', size: 32 },
  { key: 'email', type: 'string', size: 128 },
  { key: 'teamId', type: 'string', size: 64 },
  { key: 'plan', type: 'string', size: 32 },
  { key: 'plan_status', type: 'string', size: 32 },
  { key: 'trial_ends_at', type: 'string', size: 64 },
  { key: 'subscription_id', type: 'string', size: 64 },
  { key: 'asaas_customer_id', type: 'string', size: 64 },
  { key: 'asaasCustomerId', type: 'string', size: 64 },
  { key: 'asaasSubscriptionId', type: 'string', size: 64 },
  { key: 'settings', type: 'string', size: 16384 },
  { key: 'settings_json', type: 'string', size: 16384 },
  { key: 'financeConfig', type: 'string', size: 16384 },
  { key: 'onboardingChecklist', type: 'string', size: 512 },
  { key: 'timezone', type: 'string', size: 64 },
  { key: 'created_at', type: 'string', size: 64 },
  { key: 'ai_threads_limit', type: 'integer' },
  { key: 'ai_threads_used', type: 'integer' },
  { key: 'plan_started_at', type: 'string', size: 64 },
  { key: 'billing_cycle_day', type: 'integer' },
  { key: 'quota_leads', type: 'integer' },
  { key: 'quota_used_leads', type: 'integer' },
  { key: 'quota_messages', type: 'integer' },
  { key: 'quota_used_messages', type: 'integer' },
  { key: 'zapsterInstanceId', type: 'string', size: 64 },
  { key: 'zapster_instance_id', type: 'string', size: 64 },
  { key: 'wa_phone', type: 'string', size: 32 },
  { key: 'notified_trial_d3', type: 'boolean' },
  { key: 'notified_trial_d1', type: 'boolean' },
  { key: 'notified_trial_expired', type: 'boolean' },
];

function printLineSummary(name, s) {
  if (s.skipped) {
    console.log(`  ${name.padEnd(22)} → não configurada no .env`);
    return;
  }
  console.log(
    `  ${name.padEnd(22)} → ${s.created} criados, ${s.exists} já existiam, ${s.divergent} divergentes, ${s.errors} erros`
  );
}

async function main() {
  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
    console.error('❌ Faltam APPWRITE_ENDPOINT, PROJECT_ID, API_KEY ou DATABASE_ID no .env');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  console.log('Verificação e correção de schema CRM + Financeiro avançado');
  console.log(`Database: ${DB_ID}`);
  console.log(`Intervalo entre operações: ${ATTR_GAP_MS}ms`);
  console.log('\nℹ️  ACCOUNTS e JOURNAL: implementados em src/ (AccountsTab, JournalTab, financeJournalServer).');
  console.log('ℹ️  financial_audit: campos reais previous_status/new_status (+ aliases status_before/after).\n');

  await processCollection(databases, {
    id: LEADS_COL,
    statsKey: 'LEADS',
    title: 'LEADS',
    attrs: LEADS_ATTRS,
    indexes: [
      { key: 'idx_leads_academy_id', attributes: ['academyId'] },
      { key: 'idx_leads_academy_id_snake', attributes: ['academy_id'] },
      { key: 'idx_leads_phone', attributes: ['phone'] },
      { key: 'idx_leads_status', attributes: ['status'] },
      { key: 'idx_leads_pipeline_stage', attributes: ['pipeline_stage'] },
      { key: 'idx_leads_assigned_to', attributes: ['assigned_to'] },
    ],
  });

  await processCollection(databases, {
    id: STUDENTS_COL,
    statsKey: 'STUDENTS',
    title: 'STUDENTS',
    attrs: STUDENTS_ATTRS,
    indexes: [
      { key: 'idx_students_academy_id', attributes: ['academyId'] },
      { key: 'idx_students_phone', attributes: ['phone'] },
      { key: 'idx_students_student_status', attributes: ['student_status'] },
      { key: 'idx_students_academy_status', attributes: ['academyId', 'student_status'] },
      { key: 'idx_students_plan', attributes: ['plan'] },
    ],
  });

  await processCollection(databases, {
    id: TASKS_COL,
    statsKey: 'TASKS',
    title: 'TASKS',
    attrs: TASKS_ATTRS,
    indexes: [
      { key: 'idx_tasks_academy_id', attributes: ['academy_id'] },
      { key: 'idx_tasks_assigned_to', attributes: ['assigned_to'] },
      { key: 'idx_tasks_lead_id', attributes: ['lead_id'] },
      { key: 'idx_tasks_status', attributes: ['status'] },
      { key: 'idx_tasks_due_date', attributes: ['due_date'] },
      { key: 'idx_tasks_created_by', attributes: ['created_by'] },
    ],
  });

  await processCollection(databases, {
    id: LEAD_EVENTS_COL,
    statsKey: 'LEAD_EVENTS',
    title: 'LEAD_EVENTS',
    attrs: LEAD_EVENTS_ATTRS,
    indexes: [
      { key: 'idx_lead_events_academy_id', attributes: ['academy_id'] },
      { key: 'idx_lead_events_lead_id', attributes: ['lead_id'] },
      { key: 'idx_lead_events_type', attributes: ['type'] },
      { key: 'idx_lead_events_at', attributes: ['at'] },
    ],
  });

  await processCollection(databases, {
    id: TASK_TEMPLATES_COL,
    statsKey: 'TASK_TEMPLATES',
    title: 'TASK_TEMPLATES',
    attrs: TASK_TEMPLATES_ATTRS,
    indexes: [
      { key: 'idx_task_templates_academy_id', attributes: ['academy_id'] },
      { key: 'idx_task_templates_trigger', attributes: ['trigger'] },
      { key: 'idx_task_templates_enabled', attributes: ['enabled'] },
    ],
  });

  await processCollection(databases, {
    id: BANK_STATEMENTS_COL,
    statsKey: 'BANK_STATEMENTS',
    title: 'BANK_STATEMENTS',
    attrs: BANK_STATEMENTS_ATTRS,
    indexes: [
      { key: 'idx_bank_stmts_academy_id', attributes: ['academy_id'] },
      { key: 'idx_bank_stmts_status', attributes: ['status'] },
      { key: 'idx_bank_stmts_period_start', attributes: ['period_start'] },
    ],
  });

  await processCollection(databases, {
    id: BANK_STATEMENT_ITEMS_COL,
    statsKey: 'BANK_STATEMENT_ITEMS',
    title: 'BANK_STATEMENT_ITEMS',
    attrs: BANK_STATEMENT_ITEMS_ATTRS,
    indexes: [
      { key: 'idx_bank_items_statement_id', attributes: ['statement_id'] },
      { key: 'idx_bank_items_academy_id', attributes: ['academy_id'] },
      { key: 'idx_bank_items_matched_tx', attributes: ['matched_tx_id'] },
      { key: 'idx_bank_items_financial_tx', attributes: ['financial_tx_id'] },
      { key: 'idx_bank_items_status', attributes: ['status'] },
    ],
  });

  await processCollection(databases, {
    id: ACCOUNTS_COL,
    statsKey: 'ACCOUNTS',
    title: 'ACCOUNTS (plano de contas)',
    attrs: ACCOUNTS_ATTRS,
    indexes: [
      { key: 'idx_accounts_academy_id', attributes: ['academyId'] },
      { key: 'idx_accounts_type', attributes: ['type'] },
      { key: 'idx_accounts_is_active', attributes: ['is_active'] },
    ],
  });

  await processCollection(databases, {
    id: JOURNAL_COL,
    statsKey: 'JOURNAL',
    title: 'JOURNAL (lançamentos contábeis)',
    attrs: JOURNAL_ATTRS,
    indexes: [
      { key: 'idx_journal_academy_id', attributes: ['academyId'] },
      { key: 'idx_journal_financial_tx_id', attributes: ['financial_tx_id'] },
      { key: 'idx_journal_account_id', attributes: ['account_id'] },
      { key: 'idx_journal_competence_month', attributes: ['competence_month'] },
    ],
  });

  await processCollection(databases, {
    id: ACADEMY_EVENTS_COL,
    statsKey: 'ACADEMY_EVENTS',
    title: 'ACADEMY_EVENTS',
    attrs: ACADEMY_EVENTS_ATTRS,
    indexes: [
      { key: 'idx_academy_events_academy_id', attributes: ['academy_id'] },
      { key: 'idx_academy_events_event_type', attributes: ['event_type'] },
      { key: 'idx_academy_events_actor', attributes: ['actor_user_id'] },
      { key: 'idx_academy_events_target_id', attributes: ['target_id'] },
      { key: 'idx_academy_events_timestamp', attributes: ['timestamp'] },
    ],
  });

  await processCollection(databases, {
    id: AUDIT_COL,
    statsKey: 'financial_audit',
    title: 'financial_audit_log',
    attrs: FINANCIAL_AUDIT_ATTRS,
    indexes: [
      { key: 'idx_fin_audit_academy_id', attributes: ['academy_id'] },
      { key: 'idx_fin_audit_payment_id', attributes: ['payment_id'] },
      { key: 'idx_fin_audit_student_id', attributes: ['student_id'] },
      { key: 'idx_fin_audit_user_id', attributes: ['user_id'] },
    ],
  });

  await processCollection(databases, {
    id: ACADEMIES_COL,
    statsKey: 'ACADEMIES',
    title: 'ACADEMIES',
    attrs: ACADEMIES_ATTRS,
    indexes: [
      { key: 'idx_academies_owner_id', attributes: ['ownerId'] },
      { key: 'idx_academies_slug', attributes: ['slug'] },
      { key: 'idx_academies_plan_status', attributes: ['plan_status'] },
    ],
  });

  console.log('\n════════════════════════════════════════');
  console.log('RESUMO POR COLLECTION');
  console.log('════════════════════════════════════════');
  printLineSummary('LEADS', summary.LEADS);
  printLineSummary('STUDENTS', summary.STUDENTS);
  printLineSummary('TASKS', summary.TASKS);
  printLineSummary('LEAD_EVENTS', summary.LEAD_EVENTS);
  printLineSummary('TASK_TEMPLATES', summary.TASK_TEMPLATES);
  printLineSummary('BANK_STATEMENTS', summary.BANK_STATEMENTS);
  printLineSummary('BANK_STATEMENT_ITEMS', summary.BANK_STATEMENT_ITEMS);
  printLineSummary('ACCOUNTS', summary.ACCOUNTS);
  printLineSummary('JOURNAL', summary.JOURNAL);
  printLineSummary('ACADEMY_EVENTS', summary.ACADEMY_EVENTS);
  printLineSummary('financial_audit_log', summary.financial_audit);
  printLineSummary('ACADEMIES', summary.ACADEMIES);
  console.log('════════════════════════════════════════\n');

  const totalErrors = Object.values(summary).reduce((n, s) => n + s.errors, 0);
  if (totalErrors > 0) process.exit(2);
}

main().catch((e) => {
  console.error('\n❌ Falha ao iniciar:', e?.message || e);
  process.exit(1);
});

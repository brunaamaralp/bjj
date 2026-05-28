/**
 * Verifica e provisiona schema Appwrite — WhatsApp + Catraca + Contratos.
 *
 * Uso: node scripts/verify-and-fix-schema-integrations.mjs
 *
 * Notas do código:
 * - MESSAGES: não há coleção separada — histórico em CONVERSATIONS.messages (JSON).
 * - CLASSES_COL: não referenciado no código (turmas em academies.settings JSON).
 * - Catraca: Control iD + coleção ATTENDANCE (check-in); sem ACCESS_LOG_COL dedicada.
 *
 * --- SCHEMA PROPOSTO (não provisionado automaticamente) ---
 * CLASSES_COL: academy_id, name, instructor_id, days_of_week, start_time, end_time, ...
 * ACCESS_LOG_COL (futuro): ver bloco ATTENDANCE / comentário no final do script.
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

const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  '';
const MESSAGE_FLAGS_COL =
  process.env.APPWRITE_MESSAGE_FLAGS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_MESSAGE_FLAGS_COLLECTION_ID ||
  '';
const CONVERSATION_NOTES_COL =
  process.env.APPWRITE_CONVERSATION_NOTES_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATION_NOTES_COLLECTION_ID ||
  '';
const LABELS_COL =
  process.env.VITE_APPWRITE_LABELS_COLLECTION_ID || process.env.APPWRITE_LABELS_COLLECTION_ID || '';
const CONTRACTS_COL = process.env.APPWRITE_CONTRACTS_COLLECTION_ID || '';
const CONTRACT_SIGNERS_COL = process.env.APPWRITE_CONTRACT_SIGNERS_COLLECTION_ID || '';
const CONTRACT_EVENTS_COL = process.env.APPWRITE_CONTRACT_EVENTS_COLLECTION_ID || '';
const CONTRACT_TEMPLATES_COL = process.env.APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID || '';
const WEBHOOK_LOGS_COL = process.env.APPWRITE_WEBHOOK_LOGS_COLLECTION_ID || '';
const ATTENDANCE_COL =
  process.env.APPWRITE_ATTENDANCE_COLLECTION_ID ||
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID ||
  process.env.VITE_APPWRITE_ATTENDANCE_COLLECTION_ID ||
  '';
const CLASSES_COL =
  process.env.VITE_APPWRITE_CLASSES_COLLECTION_ID || process.env.APPWRITE_CLASSES_COLLECTION_ID || '';

const ATTR_GAP_MS = Number(process.env.PROVISION_ATTR_GAP_MS || 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emptyStats() {
  return { created: 0, exists: 0, divergent: 0, errors: 0, skipped: false, note: '' };
}

const summary = {
  CONVERSATIONS: emptyStats(),
  MESSAGES: emptyStats(),
  MESSAGE_FLAGS: emptyStats(),
  CONVERSATION_NOTES: emptyStats(),
  LABELS: emptyStats(),
  CONTRACTS: emptyStats(),
  CONTRACT_SIGNERS: emptyStats(),
  CONTRACT_EVENTS: emptyStats(),
  CONTRACT_TEMPLATES: emptyStats(),
  WEBHOOK_LOGS: emptyStats(),
  CLASSES: emptyStats(),
  ACCESS_LOG: emptyStats(),
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
  if (expected === 'string') return f === 'string' || f === 'text';
  if (expected === 'float') return isNumericType(f);
  if (expected === 'integer') return f === 'integer' || (isNumericType(f) && /count|capacity|degree/i.test(key));
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
      await databases.createStringAttribute({ databaseId: DB_ID, collectionId, key, size, required });
    } else if (type === 'float') {
      await databases.createFloatAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
        xdefault: 0,
      });
    } else if (type === 'integer') {
      await databases.createIntegerAttribute({ databaseId: DB_ID, collectionId, key, required });
    } else if (type === 'boolean') {
      await databases.createBooleanAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
        xdefault: spec.default === true,
      });
    } else if (type === 'datetime') {
      await databases.createDatetimeAttribute({ databaseId: DB_ID, collectionId, key, required });
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

function logSkippedBlock(statsKey, title, reason) {
  console.log(`\n══ ${title} ══`);
  console.log(`ℹ️ ${reason}`);
  summary[statsKey].skipped = true;
  summary[statsKey].note = reason;
}

/** conversationsStore, api/conversations, zapsterWebhook, agentRespond */
const CONVERSATIONS_ATTRS = [
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'phone_number', type: 'string', size: 32 },
  { key: 'phone', type: 'string', size: 32 },
  { key: 'messages', type: 'string', size: 65535 },
  { key: 'updated_at', type: 'string', size: 64 },
  { key: 'archived', type: 'boolean' },
  { key: 'unread_count', type: 'integer' },
  { key: 'last_user_msg_at', type: 'string', size: 64 },
  { key: 'last_read_at', type: 'string', size: 64 },
  { key: 'human_handoff_until', type: 'string', size: 64 },
  { key: 'is_in_handoff', type: 'boolean' },
  { key: 'handoff_started_at', type: 'string', size: 64 },
  { key: 'handoff_started_by', type: 'string', size: 64 },
  { key: 'handoff_note', type: 'string', size: 512 },
  { key: 'lead_id', type: 'string', size: 64 },
  { key: 'lead_name', type: 'string', size: 128 },
  { key: 'contact_name', type: 'string', size: 128 },
  { key: 'contact_name_source', type: 'string', size: 32 },
  { key: 'contact_name_updated_at', type: 'string', size: 64 },
  { key: 'whatsapp_profile_name', type: 'string', size: 128 },
  { key: 'whatsapp_profile_name_updated_at', type: 'string', size: 64 },
  { key: 'whatsapp_profile_image_url', type: 'string', size: 512 },
  { key: 'whatsapp_profile_image_updated_at', type: 'string', size: 64 },
  { key: 'last_preview', type: 'string', size: 512 },
  { key: 'last_message', type: 'string', size: 512 },
  { key: 'last_message_role', type: 'string', size: 16 },
  { key: 'last_message_sender', type: 'string', size: 64 },
  { key: 'last_message_timestamp', type: 'string', size: 64 },
  { key: 'last_message_at', type: 'string', size: 64 },
  { key: 'status', type: 'string', size: 32 },
  { key: 'assigned_to', type: 'string', size: 64 },
  { key: 'assigned_name', type: 'string', size: 128 },
  { key: 'label_ids', type: 'string', size: 2048 },
  { key: 'channel', type: 'string', size: 32 },
  { key: 'zapster_instance_id', type: 'string', size: 64 },
  { key: 'wa_chat_id', type: 'string', size: 128 },
  { key: 'summary', type: 'string', size: 8192 },
  { key: 'ai_thread_cycle_id', type: 'string', size: 64 },
  { key: 'last_dispatch_error', type: 'string', size: 128 },
  { key: 'last_dispatch_at', type: 'string', size: 64 },
  { key: 'zapster_status', type: 'string', size: 32 },
  { key: 'zapster_status_updated_at', type: 'string', size: 64 },
];

const MESSAGE_FLAGS_ATTRS = [
  { key: 'message_id', type: 'string', size: 128 },
  { key: 'conversation_id', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'type', type: 'string', size: 32 },
  { key: 'flag_type', type: 'string', size: 32 },
  { key: 'created_at', type: 'string', size: 64 },
  { key: 'created_by', type: 'string', size: 64 },
  { key: 'created_by_name', type: 'string', size: 128 },
  { key: 'note', type: 'string', size: 512 },
];

const CONVERSATION_NOTES_ATTRS = [
  { key: 'conversation_id', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'lead_id', type: 'string', size: 64 },
  { key: 'body', type: 'string', size: 4096 },
  { key: 'author_id', type: 'string', size: 64 },
  { key: 'created_by', type: 'string', size: 64 },
  { key: 'created_by_name', type: 'string', size: 128 },
  { key: 'created_at', type: 'string', size: 64 },
  { key: 'edited_at', type: 'string', size: 64 },
  { key: 'edited_by_name', type: 'string', size: 128 },
];

const LABELS_ATTRS = [
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'name', type: 'string', size: 64 },
  { key: 'color', type: 'string', size: 16 },
  { key: 'is_active', type: 'boolean', default: true },
  { key: 'is_system', type: 'boolean' },
  { key: 'created_by', type: 'string', size: 64 },
];

/** contractService.ts */
const CONTRACTS_ATTRS = [
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'lead_id', type: 'string', size: 64 },
  { key: 'template_id', type: 'string', size: 64 },
  { key: 'name', type: 'string', size: 256 },
  { key: 'title', type: 'string', size: 256 },
  { key: 'status', type: 'string', size: 32 },
  { key: 'sandbox', type: 'boolean' },
  { key: 'autentique_id', type: 'string', size: 64 },
  { key: 'autentique_doc_id', type: 'string', size: 64 },
  { key: 'signers_links', type: 'string', size: 2048 },
  { key: 'signers_json', type: 'string', size: 4096 },
  { key: 'variables_json', type: 'string', size: 8192 },
  { key: 'expires_at', type: 'string', size: 64 },
  { key: 'meta_status', type: 'string', size: 64 },
  { key: 'sent_at', type: 'string', size: 64 },
  { key: 'signed_at', type: 'string', size: 64 },
  { key: 'created_by', type: 'string', size: 64 },
  { key: 'created_by_name', type: 'string', size: 128 },
  { key: 'file_url', type: 'string', size: 512 },
  { key: 'note', type: 'string', size: 2048 },
];

const CONTRACT_SIGNERS_ATTRS = [
  { key: 'contract_id', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'lead_id', type: 'string', size: 64 },
  { key: 'name', type: 'string', size: 128 },
  { key: 'email', type: 'string', size: 128 },
  { key: 'phone', type: 'string', size: 32 },
  { key: 'status', type: 'string', size: 32 },
  { key: 'signed_at', type: 'string', size: 64 },
  { key: 'autentique_public_id', type: 'string', size: 64 },
  { key: 'autentique_signer_id', type: 'string', size: 64 },
  { key: 'autentique_document_id', type: 'string', size: 64 },
  { key: 'action', type: 'string', size: 32 },
  { key: 'delivery_method', type: 'string', size: 32 },
];

const CONTRACT_EVENTS_ATTRS = [
  { key: 'contract_id', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'event_type', type: 'string', size: 64 },
  { key: 'actor', type: 'string', size: 64 },
  { key: 'actor_name', type: 'string', size: 128 },
  { key: 'payload_json', type: 'string', size: 16384 },
  { key: 'autentique_event_id', type: 'string', size: 64 },
  { key: 'autentique_document_id', type: 'string', size: 64 },
];

/** contractTemplateService.ts */
/** contractService.saveWebhookLog */
const WEBHOOK_LOGS_ATTRS = [
  { key: 'raw_payload', type: 'string', size: 65535 },
  { key: 'signature_valid', type: 'boolean' },
  { key: 'processed', type: 'boolean' },
  { key: 'event_type', type: 'string', size: 64 },
  { key: 'error', type: 'string', size: 2048 },
  { key: 'payload', type: 'string', size: 65535 },
  { key: 'signature_header', type: 'string', size: 512 },
  { key: 'is_valid', type: 'boolean' },
  { key: 'autentique_event_id', type: 'string', size: 64 },
];

const CONTRACT_TEMPLATES_ATTRS = [
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'name', type: 'string', size: 128 },
  { key: 'description', type: 'string', size: 512 },
  { key: 'kind', type: 'string', size: 32 },
  { key: 'body_html', type: 'string', size: 28000 },
  { key: 'body', type: 'string', size: 28000 },
  { key: 'variables_json', type: 'string', size: 4096 },
  { key: 'plan_names', type: 'string', size: 2048 },
  { key: 'is_default', type: 'boolean' },
  { key: 'active', type: 'boolean', default: true },
  { key: 'is_active', type: 'boolean', default: true },
  { key: 'created_by', type: 'string', size: 64 },
];

/** attendance.js, attendanceDocument.js, controlid — check-in / catraca */
const ATTENDANCE_ATTRS = [
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'student_id', type: 'string', size: 64 },
  { key: 'lead_id', type: 'string', size: 64 },
  { key: 'student_name', type: 'string', size: 256 },
  { key: 'checked_in_at', type: 'string', size: 64 },
  { key: 'checked_in_by', type: 'string', size: 128 },
  { key: 'checked_in_by_name', type: 'string', size: 128 },
  { key: 'source', type: 'string', size: 32 },
  { key: 'device_log_id', type: 'string', size: 64 },
  { key: 'device_user_id', type: 'string', size: 64 },
  { key: 'direction', type: 'string', size: 16 },
  { key: 'method', type: 'string', size: 32 },
  { key: 'device_id', type: 'string', size: 64 },
  { key: 'granted', type: 'boolean' },
  { key: 'deny_reason', type: 'string', size: 256 },
  { key: 'class_id', type: 'string', size: 64 },
  { key: 'timestamp', type: 'string', size: 64 },
];

function printLineSummary(name, s) {
  if (s.skipped && s.note) {
    console.log(`  ${name.padEnd(22)} → ${s.note}`);
    return;
  }
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

  console.log('Verificação e correção de schema — Integrações');
  console.log(`Database: ${DB_ID}`);
  console.log(`Intervalo entre operações: ${ATTR_GAP_MS}ms`);
  console.log('\nℹ️ MESSAGES: sem coleção Appwrite — mensagens em CONVERSATIONS.messages (JSON).');
  console.log('ℹ️ Catraca: Control iD + ATTENDANCE_COL (presença); logs do equipamento via API Control iD.');

  await processCollection(databases, {
    id: CONVERSATIONS_COL,
    statsKey: 'CONVERSATIONS',
    title: 'CONVERSATIONS',
    attrs: CONVERSATIONS_ATTRS,
    indexes: [
      { key: 'idx_conv_academy_id', attributes: ['academy_id'] },
      { key: 'idx_conv_lead_id', attributes: ['lead_id'] },
      { key: 'idx_conv_status', attributes: ['status'] },
      { key: 'idx_conv_updated_at', attributes: ['updated_at'] },
      { key: 'idx_conv_assigned_to', attributes: ['assigned_to'] },
      { key: 'idx_conv_human_handoff', attributes: ['human_handoff_until'] },
    ],
  });

  logSkippedBlock(
    'MESSAGES',
    'MESSAGES (coleção separada)',
    'não usada — histórico em CONVERSATIONS.messages; configure MESSAGES_COL só se migrar no futuro'
  );

  await processCollection(databases, {
    id: MESSAGE_FLAGS_COL,
    statsKey: 'MESSAGE_FLAGS',
    title: 'MESSAGE_FLAGS',
    attrs: MESSAGE_FLAGS_ATTRS,
    indexes: [
      { key: 'idx_msg_flags_message_id', attributes: ['message_id'] },
      { key: 'idx_msg_flags_conversation_id', attributes: ['conversation_id'] },
      { key: 'idx_msg_flags_academy_id', attributes: ['academy_id'] },
    ],
  });

  await processCollection(databases, {
    id: CONVERSATION_NOTES_COL,
    statsKey: 'CONVERSATION_NOTES',
    title: 'CONVERSATION_NOTES',
    attrs: CONVERSATION_NOTES_ATTRS,
    indexes: [
      { key: 'idx_conv_notes_conversation_id', attributes: ['conversation_id'] },
      { key: 'idx_conv_notes_academy_id', attributes: ['academy_id'] },
    ],
  });

  await processCollection(databases, {
    id: LABELS_COL,
    statsKey: 'LABELS',
    title: 'LABELS',
    attrs: LABELS_ATTRS,
    indexes: [{ key: 'idx_labels_academy_id', attributes: ['academy_id'] }],
  });

  await processCollection(databases, {
    id: CONTRACTS_COL,
    statsKey: 'CONTRACTS',
    title: 'CONTRACTS',
    attrs: CONTRACTS_ATTRS,
    indexes: [
      { key: 'idx_contracts_academy_id', attributes: ['academy_id'] },
      { key: 'idx_contracts_lead_id', attributes: ['lead_id'] },
    ],
  });

  await processCollection(databases, {
    id: CONTRACT_SIGNERS_COL,
    statsKey: 'CONTRACT_SIGNERS',
    title: 'CONTRACT_SIGNERS',
    attrs: CONTRACT_SIGNERS_ATTRS,
    indexes: [
      { key: 'idx_contract_signers_academy_id', attributes: ['academy_id'] },
      { key: 'idx_contract_signers_lead_id', attributes: ['lead_id'] },
    ],
  });

  await processCollection(databases, {
    id: CONTRACT_EVENTS_COL,
    statsKey: 'CONTRACT_EVENTS',
    title: 'CONTRACT_EVENTS',
    attrs: CONTRACT_EVENTS_ATTRS,
    indexes: [
      { key: 'idx_contract_events_academy_id', attributes: ['academy_id'] },
    ],
  });

  await processCollection(databases, {
    id: CONTRACT_TEMPLATES_COL,
    statsKey: 'CONTRACT_TEMPLATES',
    title: 'CONTRACT_TEMPLATES',
    attrs: CONTRACT_TEMPLATES_ATTRS,
    indexes: [
      { key: 'idx_contract_tpl_academy_id', attributes: ['academy_id'] },
      { key: 'idx_contract_tpl_active', attributes: ['active'] },
    ],
  });

  await processCollection(databases, {
    id: WEBHOOK_LOGS_COL,
    statsKey: 'WEBHOOK_LOGS',
    title: 'WEBHOOK_LOGS',
    attrs: WEBHOOK_LOGS_ATTRS,
    indexes: [{ key: 'idx_webhook_logs_event_type', attributes: ['event_type'] }],
  });

  if (CLASSES_COL) {
    logSkippedBlock(
      'CLASSES',
      'CLASSES',
      'env configurado mas coleção não referenciada no código — turmas em academies.settings; schema proposto no cabeçalho do script'
    );
  } else {
    logSkippedBlock(
      'CLASSES',
      'CLASSES',
      'não referenciada no código — turmas em academies.settings JSON; ver comentário no script'
    );
  }

  await processCollection(databases, {
    id: ATTENDANCE_COL,
    statsKey: 'ACCESS_LOG',
    title: 'ATTENDANCE (check-in / catraca)',
    attrs: ATTENDANCE_ATTRS,
    indexes: [
      { key: 'idx_attendance_academy_id', attributes: ['academy_id'] },
      { key: 'idx_attendance_student_id', attributes: ['student_id'] },
      { key: 'idx_attendance_lead_id', attributes: ['lead_id'] },
      { key: 'idx_attendance_checked_in_at', attributes: ['checked_in_at'] },
    ],
  });

  console.log('\n════════════════════════════════════════');
  console.log('RESUMO POR COLLECTION');
  console.log('════════════════════════════════════════');
  printLineSummary('CONVERSATIONS', summary.CONVERSATIONS);
  printLineSummary('MESSAGES', summary.MESSAGES);
  printLineSummary('MESSAGE_FLAGS', summary.MESSAGE_FLAGS);
  printLineSummary('CONVERSATION_NOTES', summary.CONVERSATION_NOTES);
  printLineSummary('LABELS', summary.LABELS);
  printLineSummary('CONTRACTS', summary.CONTRACTS);
  printLineSummary('CONTRACT_SIGNERS', summary.CONTRACT_SIGNERS);
  printLineSummary('CONTRACT_EVENTS', summary.CONTRACT_EVENTS);
  printLineSummary('CONTRACT_TEMPLATES', summary.CONTRACT_TEMPLATES);
  printLineSummary('WEBHOOK_LOGS', summary.WEBHOOK_LOGS);
  printLineSummary('CLASSES', summary.CLASSES);
  printLineSummary('ACCESS_LOG (ATTENDANCE)', summary.ACCESS_LOG);
  console.log('════════════════════════════════════════\n');

  const totalErrors = Object.values(summary).reduce((n, s) => n + s.errors, 0);
  if (totalErrors > 0) process.exit(2);
}

main().catch((e) => {
  console.error('\n❌ Falha ao iniciar:', e?.message || e);
  process.exit(1);
});

/**
 * Atributos da coleção webhook_logs para o handler Autentique (contractService.saveWebhookLog).
 * Uso: node --env-file=.env scripts/provision-webhook-logs-schema.mjs
 */
import { Client, Databases } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(relPath, { override } = { override: false }) {
  try {
    const p = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(p)) return;
    fs.readFileSync(p, 'utf-8')
      .split(/\r?\n/)
      .forEach((line) => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) return;
        const k = m[1];
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (override || !(k in process.env)) process.env[k] = v;
      });
  } catch {
    void 0;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local', { override: true });

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const KEY = process.env.APPWRITE_API_KEY;
const DB = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const COL = process.env.APPWRITE_WEBHOOK_LOGS_COLLECTION_ID || 'webhook_logs';

const ATTR_GAP_MS = Number(process.env.PROVISION_ATTR_GAP_MS || 1200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!ENDPOINT || !PROJECT || !KEY || !DB) {
  console.error('Defina APPWRITE_ENDPOINT, PROJECT_ID, API_KEY e DATABASE_ID');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY);
const db = new Databases(client);

async function safeCreate(fn, label) {
  try {
    await fn();
    console.log('OK', label);
    return true;
  } catch (e) {
    const msg = String(e?.message || e).toLowerCase();
    if (msg.includes('already')) {
      console.log('SKIP (exists)', label);
      return true;
    }
    console.warn('WARN', label, e?.message || e);
    return false;
  }
}

async function waitForAttribute(collectionId, key) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const res = await db.listAttributes({ databaseId: DB, collectionId });
    const attr = (res.attributes || []).find((a) => a.key === key);
    if (!attr) {
      await sleep(800);
      continue;
    }
    const status = String(attr.status || '').toLowerCase();
    if (status === 'available' || status === 'enabled') return;
    if (status === 'failed') throw new Error(attr.error || `attribute ${key} failed`);
    await sleep(1500);
  }
}

try {
  await db.getCollection(DB, COL);
  console.log('Coleção:', COL);
} catch (e) {
  console.error('Coleção inacessível:', COL, e?.message || e);
  process.exit(1);
}

const specs = [
  {
    label: 'webhook_logs.raw_payload',
    create: () =>
      db.createStringAttribute({
        databaseId: DB,
        collectionId: COL,
        key: 'raw_payload',
        size: 65535,
        required: false,
      }),
  },
  {
    label: 'webhook_logs.signature_valid',
    create: () =>
      db.createBooleanAttribute({
        databaseId: DB,
        collectionId: COL,
        key: 'signature_valid',
        required: false,
        xdefault: false,
      }),
  },
  {
    label: 'webhook_logs.processed',
    create: () =>
      db.createBooleanAttribute({
        databaseId: DB,
        collectionId: COL,
        key: 'processed',
        required: false,
        xdefault: false,
      }),
  },
  {
    label: 'webhook_logs.error',
    create: () =>
      db.createStringAttribute({
        databaseId: DB,
        collectionId: COL,
        key: 'error',
        size: 2048,
        required: false,
      }),
  },
];

let failed = 0;
for (const spec of specs) {
  const created = await safeCreate(spec.create, spec.label);
  if (!created) {
    failed += 1;
    continue;
  }
  const key = spec.label.split('.')[1];
  try {
    await waitForAttribute(COL, key);
    console.log('READY', key);
  } catch (e) {
    console.warn('WAIT', key, e?.message || e);
    failed += 1;
  }
  await sleep(ATTR_GAP_MS);
}

const res = await db.listAttributes({ databaseId: DB, collectionId: COL });
console.log('\nAtributos na coleção:');
for (const a of res.attributes || []) {
  console.log(`  ${a.key} (${a.status})`);
}

if (failed > 0) {
  console.error('\nConcluído com avisos/erros:', failed);
  process.exit(2);
}
console.log('\nProvisionamento webhook_logs concluído.');

/**
 * Atributos de recorrência em FINANCIAL_TX.
 * Uso: node scripts/provision-finance-recurrence-schema.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases } from 'node-appwrite';

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
      if (override || !(k in process.env)) process.env[k] = v;
    });
  } catch {
    void 0;
  }
}

applyEnvFile('.env', { override: false });
applyEnvFile('.env.local', { override: true });

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

async function ensureString(databases, col, key, size, required = false) {
  try {
    await databases.createStringAttribute(DB_ID, col, key, size, required);
    console.log('string:', col, key);
  } catch (e) {
    if (e?.code !== 409) console.warn('string', key, e?.message);
  }
}

async function ensureInteger(databases, col, key, required = false) {
  try {
    await databases.createIntegerAttribute(DB_ID, col, key, required);
    console.log('integer:', col, key);
  } catch (e) {
    if (e?.code !== 409) console.warn('integer', key, e?.message);
  }
}

async function ensureBool(databases, col, key, required = false) {
  try {
    await databases.createBooleanAttribute(DB_ID, col, key, required);
    console.log('bool:', col, key);
  } catch (e) {
    if (e?.code !== 409) console.warn('bool', key, e?.message);
  }
}

async function main() {
  if (!ENDPOINT || !PROJECT || !API_KEY || !DB_ID || !FINANCIAL_TX_COL) {
    console.error('missing Appwrite env (FINANCIAL_TX collection required)');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
  const databases = new Databases(client);

  await ensureString(databases, FINANCIAL_TX_COL, 'recurrence_type', 16, false);
  await ensureInteger(databases, FINANCIAL_TX_COL, 'recurrence_day', false);
  await ensureString(databases, FINANCIAL_TX_COL, 'recurrence_end', 7, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'recurrence_origin_id', 64, false);
  await ensureBool(databases, FINANCIAL_TX_COL, 'is_recurrence_template', false);

  console.log('\nRecorrência financeira provisionada em', FINANCIAL_TX_COL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

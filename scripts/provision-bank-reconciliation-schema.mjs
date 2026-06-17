/**
 * Provisiona coleções bank_statements, bank_statement_items e atributos de conciliação em FINANCIAL_TX.
 * Uso: node scripts/provision-bank-reconciliation-schema.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases, ID, Permission, Role } from 'node-appwrite';

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
  (process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '').trim();

function resolveColId(...candidates) {
  for (const raw of candidates) {
    const id = String(raw || '').trim();
    if (id) return id;
  }
  return '';
}

async function ensureCollection(databases, colId, name) {
  const id = String(colId || '').trim();
  try {
    await databases.getCollection(DB_ID, id);
    console.log('collection exists:', id);
    return id;
  } catch {
    const created = await databases.createCollection(
      DB_ID,
      id || ID.unique(),
      name,
      [Permission.read(Role.users()), Permission.create(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
    );
    console.log('collection created:', created.$id);
    return created.$id;
  }
}

async function ensureString(databases, col, key, size, required = false) {
  try {
    await databases.createStringAttribute(DB_ID, col, key, size, required);
    console.log('string:', col, key);
  } catch (e) {
    if (e?.code !== 409) console.warn('string', key, e?.message);
  }
}

async function ensureFloat(databases, col, key, required = false) {
  try {
    await databases.createFloatAttribute(DB_ID, col, key, required);
    console.log('float:', col, key);
  } catch (e) {
    if (e?.code !== 409) console.warn('float', key, e?.message);
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

async function ensureDatetime(databases, col, key, required = false) {
  try {
    await databases.createDatetimeAttribute(DB_ID, col, key, required);
    console.log('datetime:', col, key);
  } catch (e) {
    if (e?.code !== 409) console.warn('datetime', key, e?.message);
  }
}

async function main() {
  if (!ENDPOINT || !PROJECT || !API_KEY || !DB_ID) {
    console.error('missing Appwrite env');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
  const databases = new Databases(client);

  const statementsId = await ensureCollection(
    databases,
    resolveColId(
      process.env.BANK_STATEMENTS_COL,
      process.env.VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID,
      '6a0e7102000ecb5a5579'
    ),
    'bank_statements'
  );
  await ensureString(databases, statementsId, 'academy_id', 64, true);
  await ensureString(databases, statementsId, 'filename', 256, false);
  await ensureDatetime(databases, statementsId, 'import_date', false);
  await ensureString(databases, statementsId, 'period_start', 10, false);
  await ensureString(databases, statementsId, 'period_end', 10, false);
  await ensureFloat(databases, statementsId, 'total_credit', false);
  await ensureFloat(databases, statementsId, 'total_debit', false);
  await ensureString(databases, statementsId, 'status', 16, false);
  await ensureString(databases, statementsId, 'completion_note', 2000, false);
  await ensureDatetime(databases, statementsId, 'completed_at', false);
  await ensureString(databases, statementsId, 'completed_by', 64, false);
  await ensureString(databases, statementsId, 'bank_account', 128, false);
  await ensureString(databases, statementsId, 'source_format', 16, false);
  await ensureString(databases, statementsId, 'parse_method', 16, false);
  await ensureString(databases, statementsId, 'parse_warnings', 2000, false);

  const itemsId = await ensureCollection(
    databases,
    resolveColId(
      process.env.BANK_STATEMENT_ITEMS_COL,
      process.env.VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID,
      '6a0e71030005e0afe2f9'
    ),
    'bank_statement_items'
  );
  await ensureString(databases, itemsId, 'statement_id', 64, true);
  await ensureString(databases, itemsId, 'date', 10, true);
  await ensureString(databases, itemsId, 'description', 512, false);
  await ensureFloat(databases, itemsId, 'amount', true);
  await ensureString(databases, itemsId, 'direction', 8, true);
  await ensureString(databases, itemsId, 'matched_tx_id', 64, false);
  await ensureString(databases, itemsId, 'suggested_tx_id', 64, false);
  await ensureFloat(databases, itemsId, 'match_score', false);
  await ensureString(databases, itemsId, 'status', 16, false);

  if (FINANCIAL_TX_COL) {
    console.log('\n--- FINANCIAL_TX (conciliação) ---');
    await ensureBool(databases, FINANCIAL_TX_COL, 'reconciled', false);
    await ensureDatetime(databases, FINANCIAL_TX_COL, 'reconciled_at', false);
    await ensureString(databases, FINANCIAL_TX_COL, 'reconciled_by', 64, false);
    await ensureString(databases, FINANCIAL_TX_COL, 'bank_statement_id', 64, false);
  } else {
    console.warn(
      '\nAVISO: VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID não definido — atributos reconciled* não foram criados.',
    );
    console.warn('Rode também: node scripts/provision-finance-features-schema.mjs');
  }

  console.log('\nProvisionamento concluído.');
  console.log('Defina no .env.local:');
  console.log(`VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID=${statementsId}`);
  console.log(`VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID=${itemsId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

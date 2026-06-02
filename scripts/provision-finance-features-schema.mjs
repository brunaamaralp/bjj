/**
 * Provisiona Appwrite para: previsão de caixa, conciliação bancária e recorrência.
 * - Coleções bank_statements + bank_statement_items
 * - Atributos em FINANCIAL_TX (competência, categoria, conciliação, recorrência)
 *
 * Uso: node scripts/provision-finance-features-schema.mjs
 * Requer: APPWRITE_API_KEY, VITE_APPWRITE_DATABASE_ID, VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID
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
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

async function ensureCollection(databases, colId, name) {
  if (colId) {
    try {
      await databases.getCollection(DB_ID, colId);
      console.log('collection exists:', colId);
      return colId;
    } catch {
      /* create below */
    }
  }
  const created = await databases.createCollection(
    DB_ID,
    colId || ID.unique(),
    name,
    [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ]
  );
  console.log('collection created:', created.$id);
  return created.$id;
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

async function ensureDatetime(databases, col, key, required = false) {
  try {
    await databases.createDatetimeAttribute(DB_ID, col, key, required);
    console.log('datetime:', col, key);
  } catch (e) {
    if (e?.code !== 409) console.warn('datetime', key, e?.message);
  }
}

async function provisionFinancialTx(databases) {
  if (!FINANCIAL_TX_COL) {
    console.warn('skip FINANCIAL_TX — defina VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID');
    return;
  }
  console.log('\n--- FINANCIAL_TX ---');
  await ensureString(databases, FINANCIAL_TX_COL, 'category', 128, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'competence_month', 7, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'direction', 8, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'lead_id', 64, false);
  await ensureBool(databases, FINANCIAL_TX_COL, 'reconciled', false);
  await ensureDatetime(databases, FINANCIAL_TX_COL, 'reconciled_at', false);
  await ensureString(databases, FINANCIAL_TX_COL, 'reconciled_by', 64, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'bank_statement_id', 64, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'bank_account', 128, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'recurrence_type', 16, false);
  await ensureInteger(databases, FINANCIAL_TX_COL, 'recurrence_day', false);
  await ensureString(databases, FINANCIAL_TX_COL, 'recurrence_end', 7, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'recurrence_origin_id', 64, false);
  await ensureBool(databases, FINANCIAL_TX_COL, 'is_recurrence_template', false);
}

async function provisionBankCollections(databases) {
  console.log('\n--- Conciliação bancária ---');
  const statementsId = await ensureCollection(
    databases,
    process.env.BANK_STATEMENTS_COL || process.env.VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID || '',
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

  const itemsId = await ensureCollection(
    databases,
    process.env.BANK_STATEMENT_ITEMS_COL || process.env.VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID || '',
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

  return { statementsId, itemsId };
}

async function main() {
  if (!ENDPOINT || !PROJECT || !API_KEY || !DB_ID) {
    console.error('missing Appwrite env (ENDPOINT, PROJECT, API_KEY, DATABASE)');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
  const databases = new Databases(client);

  await provisionFinancialTx(databases);
  const bank = await provisionBankCollections(databases);

  console.log('\n=== Variáveis para .env.local / Vercel ===\n');
  if (FINANCIAL_TX_COL) {
    console.log(`VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID=${FINANCIAL_TX_COL}`);
    console.log(`FINANCIAL_TX_COL=${FINANCIAL_TX_COL}`);
  }
  if (bank) {
    console.log(`VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID=${bank.statementsId}`);
    console.log(`VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID=${bank.itemsId}`);
    console.log(`BANK_STATEMENTS_COL=${bank.statementsId}`);
    console.log(`BANK_STATEMENT_ITEMS_COL=${bank.itemsId}`);
  }
  console.log('\nAuditoria (eventos finance_recurrence_* / bank_*):');
  console.log('APPWRITE_ACADEMY_EVENTS_COLLECTION_ID=  # npm run provision:academy-events');
  console.log('\nCron recorrência: CRON_SECRET (já usado pelos outros crons)');
  console.log('\nPrevisão de caixa: sem coleção nova — usa FINANCIAL_TX, mensalidades e alunos.');
  console.log('\nÍndices recomendados no Appwrite (manual):');
  console.log('  FINANCIAL_TX: academyId + status; academyId + is_recurrence_template');
  console.log('  FINANCIAL_TX: academyId + recurrence_origin_id + competence_month');
  console.log('  bank_statement_items: statement_id');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

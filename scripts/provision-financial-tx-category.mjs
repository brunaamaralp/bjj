/**
 * Provisiona atributos opcionais de FINANCIAL_TX usados pelo Caixa (category, direction, etc.).
 *
 * Uso: npm run provision:financial-tx-category
 * Requer: APPWRITE_API_KEY, VITE_APPWRITE_DATABASE_ID, VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID
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
    console.log('  + string', key);
    return 'created';
  } catch (e) {
    if (e?.code === 409) {
      console.log('  = string', key, '(exists)');
      return 'exists';
    }
    throw e;
  }
}

async function ensureInteger(databases, col, key, required = false) {
  try {
    await databases.createIntegerAttribute(DB_ID, col, key, required);
    console.log('  + integer', key);
    return 'created';
  } catch (e) {
    if (e?.code === 409) {
      console.log('  = integer', key, '(exists)');
      return 'exists';
    }
    throw e;
  }
}

async function ensureBool(databases, col, key, required = false) {
  try {
    await databases.createBooleanAttribute(DB_ID, col, key, required);
    console.log('  + boolean', key);
    return 'created';
  } catch (e) {
    if (e?.code === 409) {
      console.log('  = boolean', key, '(exists)');
      return 'exists';
    }
    throw e;
  }
}

async function ensureDatetime(databases, col, key, required = false) {
  try {
    await databases.createDatetimeAttribute(DB_ID, col, key, required);
    console.log('  + datetime', key);
    return 'created';
  } catch (e) {
    if (e?.code === 409) {
      console.log('  = datetime', key, '(exists)');
      return 'exists';
    }
    throw e;
  }
}

async function main() {
  if (!ENDPOINT || !PROJECT || !API_KEY) {
    console.error('Defina APPWRITE_API_KEY, endpoint e project (ver .env)');
    process.exit(1);
  }
  if (!DB_ID || !FINANCIAL_TX_COL) {
    console.error('Defina VITE_APPWRITE_DATABASE_ID e VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
  const databases = new Databases(client);

  try {
    await databases.getCollection(DB_ID, FINANCIAL_TX_COL);
  } catch (e) {
    console.error('Coleção FINANCIAL_TX não encontrada:', FINANCIAL_TX_COL, e?.message);
    process.exit(1);
  }

  console.log('Database:', DB_ID);
  console.log('Collection:', FINANCIAL_TX_COL);
  console.log('\nAtributos FINANCIAL_TX:');

  await ensureString(databases, FINANCIAL_TX_COL, 'category', 128, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'competence_month', 7, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'direction', 8, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'lead_id', 64, false);
  await ensureBool(databases, FINANCIAL_TX_COL, 'reconciled', false);
  await ensureDatetime(databases, FINANCIAL_TX_COL, 'reconciled_at', false);
  await ensureString(databases, FINANCIAL_TX_COL, 'reconciled_by', 64, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'bank_statement_id', 64, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'recurrence_type', 16, false);
  await ensureInteger(databases, FINANCIAL_TX_COL, 'recurrence_day', false);
  await ensureString(databases, FINANCIAL_TX_COL, 'recurrence_end', 7, false);
  await ensureString(databases, FINANCIAL_TX_COL, 'recurrence_origin_id', 64, false);
  await ensureBool(databases, FINANCIAL_TX_COL, 'is_recurrence_template', false);

  console.log('\nConcluído. Aguarde o status "available" no Appwrite antes de salvar lançamentos.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Garante atributos de pagamento habitual na coleção leads (Appwrite).
 *
 * Uso:
 *   npm run provision:lead-payment-attrs
 *
 * Requer APPWRITE_API_KEY, VITE_APPWRITE_DATABASE_ID, VITE_APPWRITE_LEADS_COLLECTION_ID
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
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      if (override || !(k in process.env)) process.env[k] = v;
    });
  } catch {
    void 0;
  }
}

applyEnvFile('.env', { override: false });
applyEnvFile('.env.local', { override: true });

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
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureStringAttr(databases, collectionId, key, size, required = false) {
  try {
    await databases.createStringAttribute(DB_ID, collectionId, key, size, required);
    console.log(`✅ [${collectionId}] Criado: ${key} (string, ${size}, required=${required})`);
    await sleep(1500);
  } catch (e) {
    if (e.code === 409) {
      console.log(`⏭️  [${collectionId}] ${key} já existe`);
    } else {
      console.error(`❌ [${collectionId}] ${key}: ${e.message}`);
      throw e;
    }
  }
}

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function main() {
  if (!API_KEY) fail('Defina APPWRITE_API_KEY no .env');
  if (!DB_ID) fail('Defina VITE_APPWRITE_DATABASE_ID no .env');
  if (!LEADS_COL) fail('Defina VITE_APPWRITE_LEADS_COLLECTION_ID no .env');

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  const targets = [{ id: LEADS_COL, label: 'leads' }];
  if (STUDENTS_COL && STUDENTS_COL !== LEADS_COL) {
    targets.push({ id: STUDENTS_COL, label: 'students' });
  }

  for (const { id, label } of targets) {
    console.log(`\nProvisionando pagamento habitual em ${label} (${id})...\n`);
    await ensureStringAttr(databases, id, 'preferred_payment_method', 64, false);
    await ensureStringAttr(databases, id, 'preferred_payment_account', 128, false);
  }

  console.log('\n✅ Concluído. Aguarde alguns segundos até os atributos ficarem disponíveis no Appwrite.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Garante atributos na coleção academies (Appwrite).
 *
 * Uso: npm run provision:academy-attrs
 *
 *   settings — JSON (motivos trancamento/saída, estoque, vendas, turmas, catraca, etc.)
 *   onboardingChecklist — JSON compacto (checklist Navefit)
 *
 * Motivos de trancamento/desligamento ficam DENTRO de settings (limite de atributos na coleção).
 *
 * Requer: APPWRITE_API_KEY, VITE_APPWRITE_DATABASE_ID, VITE_APPWRITE_ACADEMIES_COLLECTION_ID
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
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureStringAttr(databases, key, size, required = false) {
  try {
    await databases.createStringAttribute(DB_ID, ACADEMIES_COL, key, size, required);
    console.log(`✅ Criado: ${key} (string, ${size})`);
    await sleep(1500);
  } catch (e) {
    const msg = String(e?.message || '');
    if (e.type === 'attribute_limit_exceeded' || msg.includes('attribute_limit')) {
      console.log(`⚠️  Limite de atributos — não foi possível criar ${key}.`);
    } else if (e.code === 409 || msg.includes('already exists')) {
      console.log(`⏭️  ${key} já existe`);
    } else {
      console.error(`❌ ${key}: ${e.message}`);
      throw e;
    }
  }
}

async function ensureIntegerAttr(databases, key, required = false, defaultValue = null) {
  try {
    await databases.createIntegerAttribute(DB_ID, ACADEMIES_COL, key, required, 1, 10, defaultValue);
    console.log(`✅ Criado: ${key} (integer, default=${defaultValue})`);
    await sleep(1500);
  } catch (e) {
    const msg = String(e?.message || '');
    if (e.type === 'attribute_limit_exceeded' || msg.includes('attribute_limit')) {
      console.log(`⚠️  Limite de atributos — não foi possível criar ${key}.`);
    } else if (e.code === 409 || msg.includes('already exists')) {
      console.log(`⏭️  ${key} já existe`);
    } else {
      console.error(`❌ ${key}: ${e.message}`);
      throw e;
    }
  }
}

async function ensureBooleanAttr(databases, key, required = false, defaultValue = false) {
  try {
    await databases.createBooleanAttribute(DB_ID, ACADEMIES_COL, key, required, defaultValue);
    console.log(`✅ Criado: ${key} (boolean, default=${defaultValue})`);
    await sleep(1500);
  } catch (e) {
    const msg = String(e?.message || '');
    if (e.type === 'attribute_limit_exceeded' || msg.includes('attribute_limit')) {
      console.log(`⚠️  Limite de atributos — não foi possível criar ${key}.`);
    } else if (e.code === 409 || msg.includes('already exists')) {
      console.log(`⏭️  ${key} já existe`);
    } else {
      console.error(`❌ ${key}: ${e.message}`);
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
  if (!ACADEMIES_COL) fail('Defina VITE_APPWRITE_ACADEMIES_COLLECTION_ID no .env');

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  console.log('Provisionando atributos em academies...\n');
  await ensureStringAttr(databases, 'settings', 16384, false);
  await ensureStringAttr(databases, 'financeConfig', 16384, false);
  await ensureStringAttr(databases, 'financeBankAccounts', 8192, false);
  await ensureStringAttr(databases, 'onboardingChecklist', 512, false);
  console.log('\nPagBank (multi-tenant):');
  // Credenciais criptografadas em settings.pagbank (limite 56 atributos na coleção).
  // Débito técnico / rota de fuga: docs/data-model.md §4.1 «PagBank Assinaturas».
  await ensureStringAttr(databases, 'pagbank_token', 512, false);
  await ensureStringAttr(databases, 'pagbank_public_key', 512, false);
  await ensureStringAttr(databases, 'pagbank_webhook_secret', 256, false);
  await ensureBooleanAttr(databases, 'pagbank_enabled', false, false);
  await ensureIntegerAttr(databases, 'pagbank_max_retries', false, 3);
  console.log('\n✅ Concluído.');
  console.log('Se financeConfig já existir com limite menor (ex.: 2500), aumente manualmente no console Appwrite ou via verify-and-fix-schema-crm.');
  console.log('Motivos de trancamento/desligamento: gravados em settings.student_freeze_reasons / student_exit_reasons (JSON).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

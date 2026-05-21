/**
 * Cria atributos de custo médio / CMV no Appwrite.
 *
 * - product_variants (ou STOCK_ITEMS legado): average_cost, last_purchase_cost
 * - sale_items: cmv
 *
 * Uso:
 *   npm run provision:inventory-cost
 *   node --env-file=.env scripts/provision-inventory-cost-schema.mjs
 *
 * Requer: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY,
 *         VITE_APPWRITE_DATABASE_ID (ou APPWRITE_DATABASE_ID)
 *         VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID (ou SALE_ITEMS_COL)
 *         VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID e/ou VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID
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

const STOCK_ITEMS_COL =
  process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '';
const PRODUCT_VARIANTS_COL =
  process.env.VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID || process.env.PRODUCT_VARIANTS_COL || '';
const SALE_ITEMS_COL =
  process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || process.env.SALE_ITEMS_COL || '';

const ATTR_WAIT_MS = Number(process.env.PROVISION_ATTR_WAIT_MS || 4000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isAlreadyExists(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = Number(err?.code || err?.response?.code || 0);
  return (
    code === 409 ||
    msg.includes('already exists') ||
    msg.includes('attribute already') ||
    msg.includes('duplicate')
  );
}

async function listAttrKeys(databases, collectionId) {
  const res = await databases.listAttributes({ databaseId: DB_ID, collectionId });
  return new Set((res.attributes || []).map((a) => a.key));
}

async function waitForAttribute(databases, collectionId, key) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const res = await databases.listAttributes({ databaseId: DB_ID, collectionId });
    const attr = (res.attributes || []).find((a) => a.key === key);
    if (!attr) {
      await sleep(1500);
      continue;
    }
    const status = String(attr.status || '').toLowerCase();
    if (status === 'available' || status === 'enabled') return attr;
    if (status === 'failed') {
      throw new Error(`Atributo ${key} falhou no Appwrite: ${attr.error || 'unknown'}`);
    }
    await sleep(2000);
  }
  throw new Error(`Timeout aguardando atributo ${key} em ${collectionId}`);
}

async function ensureFloatAttribute(databases, collectionId, collectionLabel, key, defaultValue = 0) {
  const existing = await listAttrKeys(databases, collectionId);
  if (existing.has(key)) {
    console.log(`  ✓ ${collectionLabel}.${key} — já existe`);
    return 'exists';
  }

  try {
    await databases.createFloatAttribute({
      databaseId: DB_ID,
      collectionId,
      key,
      required: false,
      xdefault: defaultValue,
    });
    console.log(`  + ${collectionLabel}.${key} — criado (aguardando disponibilidade…)`);
    await waitForAttribute(databases, collectionId, key);
    console.log(`  ✓ ${collectionLabel}.${key} — disponível`);
    return 'created';
  } catch (e) {
    if (isAlreadyExists(e)) {
      console.log(`  ✓ ${collectionLabel}.${key} — já existe (concorrência)`);
      return 'exists';
    }
    throw e;
  }
}

async function provisionCollection(databases, collectionId, label, keys) {
  console.log(`\n[${label}] collectionId=${collectionId}`);
  const results = {};
  for (const key of keys) {
    results[key] = await ensureFloatAttribute(databases, collectionId, label, key, 0);
    if (results[key] === 'created') await sleep(ATTR_WAIT_MS);
  }
  return results;
}

async function main() {
  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
    console.error('Faltam APPWRITE_ENDPOINT, PROJECT_ID, API_KEY ou DATABASE_ID no .env');
    process.exit(1);
  }
  if (!SALE_ITEMS_COL && !STOCK_ITEMS_COL && !PRODUCT_VARIANTS_COL) {
    console.error(
      'Defina ao menos SALE_ITEMS_COL e STOCK_ITEMS_COL ou PRODUCT_VARIANTS_COL no .env'
    );
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  console.log('Provisionando atributos de custo médio / CMV…');
  console.log(`Database: ${DB_ID}`);

  const stockTargets = [];
  if (PRODUCT_VARIANTS_COL) stockTargets.push({ id: PRODUCT_VARIANTS_COL, label: 'product_variants' });
  if (STOCK_ITEMS_COL && STOCK_ITEMS_COL !== PRODUCT_VARIANTS_COL) {
    stockTargets.push({ id: STOCK_ITEMS_COL, label: 'stock_items' });
  }

  for (const { id, label } of stockTargets) {
    await provisionCollection(databases, id, label, ['average_cost', 'last_purchase_cost']);
  }

  if (!stockTargets.length) {
    console.warn('\n⚠ Nenhuma coleção de estoque configurada (STOCK_ITEMS / PRODUCT_VARIANTS).');
  } else if (!PRODUCT_VARIANTS_COL) {
    console.warn(
      '\n⚠ VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID não definido — só STOCK_ITEMS foi atualizado.'
    );
    console.warn('  Se usa catálogo pai+variante, adicione o ID da coleção e rode de novo.');
  }

  if (SALE_ITEMS_COL) {
    await provisionCollection(databases, SALE_ITEMS_COL, 'sale_items', ['cmv']);
  } else {
    console.warn('\n⚠ SALE_ITEMS_COL ausente — cmv não provisionado.');
  }

  console.log('\nConcluído.');
}

main().catch((e) => {
  console.error('\nErro:', e?.message || e);
  process.exit(1);
});

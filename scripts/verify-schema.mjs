/**
 * Verificação read-only de schema Appwrite.
 *
 * Uso:
 *   node scripts/verify-schema.mjs
 *
 * Não cria nem altera nada — apenas lê atributos/índices e compara.
 */
import { Client, Databases } from 'node-appwrite';
import fs from 'fs';
import path from 'path';

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

const STOCK_MOVES_COL =
  process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || process.env.STOCK_MOVES_COL || '';
const SALES_COL = process.env.VITE_APPWRITE_SALES_COLLECTION_ID || process.env.SALES_COL || '';
const STOCK_ITEMS_COL =
  process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '';
const SALE_ITEMS_COL =
  process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID ||
  process.env.SALE_ITEMS_COL ||
  process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID ||
  '';

function colLabel(id, fallback) {
  const s = String(id || '').trim();
  return s || fallback;
}

function normalizeTypeName(attr) {
  const type = String(attr?.type || '').toLowerCase();
  if (type) return type;
  // Appwrite SDKs sometimes expose nested types; keep a safe fallback.
  const key = String(attr?.key || '');
  return key ? '' : '';
}

function isNumericType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'double' || t === 'float' || t === 'number';
}

function formatExpected(expected) {
  if (expected === 'number') return 'double/float';
  if (expected === 'integer') return 'integer';
  return expected;
}

function checkAttr(label, key, expected, attrsByKey, counters, missingList, mismatchList) {
  const attr = attrsByKey.get(key);
  if (!attr) {
    console.log(`❌ ${label} / ${key.padEnd(22)} — NÃO ENCONTRADO`);
    counters.missing += 1;
    missingList.push(`${label} / ${key}`);
    return;
  }
  const found = normalizeTypeName(attr);
  const ok =
    expected === 'string'
      ? found === 'string'
      : expected === 'number'
        ? isNumericType(found)
        : expected === 'integer'
          ? found === 'integer'
        : found === expected;

  if (ok) {
    console.log(`✅ ${label} / ${key.padEnd(22)} — ${found || 'ok'}, existe`);
    counters.ok += 1;
    return;
  }
  console.log(
    `⚠️ ${label} / ${key.padEnd(22)} — existe mas tipo divergente\n` +
      `                                      (esperado: ${formatExpected(expected)}, encontrado: ${found || 'desconhecido'})`
  );
  counters.mismatch += 1;
  mismatchList.push(`${label} / ${key} (esperado: ${formatExpected(expected)}, encontrado: ${found || 'desconhecido'})`);
}

function checkIndex(label, indexKey, indexesByKey, counters, missingList) {
  const idx = indexesByKey.get(indexKey);
  if (!idx) {
    console.log(`❌ ${label} / índice ${indexKey} — NÃO ENCONTRADO`);
    counters.indexMissing += 1;
    missingList.push(`${label} / índice ${indexKey}`);
    return;
  }
  console.log(`✅ ${label} / índice ${indexKey} — existe`);
  counters.indexOk += 1;
}

async function listAttrsByKey(databases, collectionId) {
  const res = await databases.listAttributes({ databaseId: DB_ID, collectionId });
  const map = new Map();
  for (const a of res.attributes || []) {
    if (a?.key) map.set(String(a.key), a);
  }
  return map;
}

async function listIndexesByKey(databases, collectionId) {
  const res = await databases.listIndexes({ databaseId: DB_ID, collectionId });
  const map = new Map();
  for (const i of res.indexes || []) {
    if (i?.key) map.set(String(i.key), i);
  }
  return map;
}

async function verifyCollection(databases, { id, name, attrs = [], indexes = [] }, counters, missing, mismatches, idxMissing) {
  const cid = String(id || '').trim();
  if (!cid) {
    console.log(`\n⚠️ ${name}: collection id não configurado no .env (pulando)`);
    return;
  }
  counters.collections += 1;
  console.log(`\n══ ${name} (${cid}) ══`);

  let attrsByKey;
  let indexesByKey;
  try {
    [attrsByKey, indexesByKey] = await Promise.all([listAttrsByKey(databases, cid), listIndexesByKey(databases, cid)]);
  } catch (e) {
    console.log(`❌ ${name} — falha ao ler schema: ${String(e?.message || e)}`);
    return;
  }

  for (const { key, expected } of attrs) {
    checkAttr(name, key, expected, attrsByKey, counters, missing, mismatches);
  }
  for (const indexKey of indexes) {
    checkIndex(name, indexKey, indexesByKey, counters, idxMissing);
  }
}

async function main() {
  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
    console.error('❌ Faltam APPWRITE_ENDPOINT, PROJECT_ID, API_KEY ou DATABASE_ID no .env');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  const counters = {
    collections: 0,
    ok: 0,
    missing: 0,
    mismatch: 0,
    indexOk: 0,
    indexMissing: 0,
  };
  const missing = [];
  const mismatches = [];
  const idxMissing = [];

  await verifyCollection(
    databases,
    {
      id: STOCK_MOVES_COL,
      name: 'STOCK_MOVES',
      attrs: [
        { key: 'movement_kind', expected: 'string' },
        { key: 'product_id', expected: 'string' },
        { key: 'sale_id', expected: 'string' },
        { key: 'sale_item_id', expected: 'string' },
        { key: 'lead_id', expected: 'string' },
        { key: 'unit_price', expected: 'number' },
        { key: 'line_total', expected: 'number' },
        { key: 'payment_status_at_move', expected: 'string' },
        { key: 'payment_method', expected: 'string' },
        { key: 'usuario_name', expected: 'string' },
        { key: 'cmv_unit', expected: 'number' },
        { key: 'source', expected: 'string' },
      ],
      indexes: ['idx_moves_sale_id', 'idx_moves_lead_id', 'idx_moves_movement_kind'],
    },
    counters,
    missing,
    mismatches,
    idxMissing
  );

  await verifyCollection(
    databases,
    {
      id: SALES_COL,
      name: 'SALES',
      attrs: [{ key: 'origin_detail', expected: 'string' }],
      indexes: [],
    },
    counters,
    missing,
    mismatches,
    idxMissing
  );

  await verifyCollection(
    databases,
    {
      id: STOCK_ITEMS_COL,
      name: 'STOCK_ITEMS',
      attrs: [
        { key: 'nome', expected: 'string' },
        { key: 'Tamanho', expected: 'string' },
        { key: 'sale_price', expected: 'number' },
        { key: 'cost_price', expected: 'number' },
        { key: 'current_quantity', expected: 'integer' },
        { key: 'minimum_level', expected: 'integer' },
        { key: 'academy_id', expected: 'string' },
      ],
      indexes: [],
    },
    counters,
    missing,
    mismatches,
    idxMissing
  );

  await verifyCollection(
    databases,
    {
      id: SALE_ITEMS_COL,
      name: 'SALE_ITEMS',
      attrs: [
        { key: 'venda_id', expected: 'string' },
        { key: 'item_estoque_id', expected: 'string' },
        { key: 'quantidade', expected: 'integer' },
        { key: 'preco_unitario', expected: 'number' },
        { key: 'cmv', expected: 'number' },
      ],
      indexes: [],
    },
    counters,
    missing,
    mismatches,
    idxMissing
  );

  console.log('\n════════════════════════════════════════');
  console.log('RESUMO FINAL');
  console.log('════════════════════════════════════════');
  console.log(`Collections verificadas: ${counters.collections}`);
  console.log(`Atributos OK:            ${counters.ok}`);
  console.log(`Atributos faltando:      ${counters.missing}`);
  if (missing.length) {
    for (const m of missing) console.log(`  - ${m}`);
  }
  console.log(`Tipos divergentes:       ${counters.mismatch}`);
  if (mismatches.length) {
    for (const m of mismatches) console.log(`  - ${m}`);
  }
  console.log(`Índices OK:              ${counters.indexOk}`);
  console.log(`Índices faltando:        ${counters.indexMissing}`);
  if (idxMissing.length) {
    for (const m of idxMissing) console.log(`  - ${m}`);
  }
  console.log('════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('\n❌ Falha fatal:', e?.message || e);
  process.exit(1);
});


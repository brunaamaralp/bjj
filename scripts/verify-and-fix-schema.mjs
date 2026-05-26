/**
 * Verifica e provisiona schema Appwrite (Financeiro + Produtos + Vendas).
 *
 * Uso: node scripts/verify-and-fix-schema.mjs
 *
 * Idempotente — pausa 1s entre criações na mesma collection.
 * Não aborta por erro em um campo; continua e resume no final.
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

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const STUDENT_PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.STUDENT_PAYMENTS_COL ||
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const AUDIT_COL =
  process.env.APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID ||
  process.env.VITE_APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID ||
  '';
const STOCK_ITEMS_COL =
  process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '';
const SALE_ITEMS_COL =
  process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID ||
  process.env.SALE_ITEMS_COL ||
  process.env.VITE_APPWRITE_SALE_ITEMS_COL ||
  '';
const SALES_COL = process.env.VITE_APPWRITE_SALES_COLLECTION_ID || process.env.SALES_COL || '';

const ATTR_GAP_MS = Number(process.env.PROVISION_ATTR_GAP_MS || 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emptyStats() {
  return { created: 0, exists: 0, divergent: 0, errors: 0 };
}

const summary = {
  FINANCIAL_TX: emptyStats(),
  STUDENT_PAYMENTS: emptyStats(),
  financial_audit: emptyStats(),
  STOCK_ITEMS: emptyStats(),
  SALE_ITEMS: emptyStats(),
  SALES: emptyStats(),
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
  if (expected === 'string') return f === 'string';
  if (expected === 'float') return isNumericType(f);
  if (expected === 'integer') return f === 'integer' || (isNumericType(f) && /quantity|level|installments/i.test(key));
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
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const res = await databases.listAttributes({ databaseId: DB_ID, collectionId });
    const attr = (res.attributes || []).find((a) => a.key === key);
    if (!attr) {
      await sleep(800);
      continue;
    }
    const status = String(attr.status || '').toLowerCase();
    if (status === 'available' || status === 'enabled') return;
    if (status === 'failed') throw new Error(attr.error || 'attribute_failed');
    await sleep(1500);
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
      await databases.createStringAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        size,
        required,
      });
    } else if (type === 'float') {
      await databases.createFloatAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
        xdefault: 0,
      });
    } else if (type === 'integer') {
      await databases.createIntegerAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
        min: Number.isFinite(spec.min) ? spec.min : undefined,
        max: Number.isFinite(spec.max) ? spec.max : undefined,
      });
    } else if (type === 'boolean') {
      await databases.createBooleanAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
        xdefault: spec.default === true,
      });
    } else if (type === 'datetime') {
      await databases.createDatetimeAttribute({
        databaseId: DB_ID,
        collectionId,
        key,
        required,
      });
    }
    try {
      await waitForAttribute(databases, collectionId, key);
    } catch (e) {
      console.log(`❌ erro — ${label}.${key}: ${e?.message || e}`);
      stats.errors += 1;
      await sleep(ATTR_GAP_MS);
      return;
    }
    console.log(`✅ criado — ${label}.${key}`);
    stats.created += 1;
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
    console.log(`\n⚠️ ${title}: collection id não configurado no .env (pulando)`);
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

const FINANCIAL_TX_ATTRS = [
  { key: 'academyId', type: 'string', size: 64 },
  { key: 'saleId', type: 'string', size: 64 },
  { key: 'method', type: 'string', size: 32 },
  { key: 'installments', type: 'integer' },
  { key: 'type', type: 'string', size: 64 },
  { key: 'planName', type: 'string', size: 256 },
  { key: 'gross', type: 'float' },
  { key: 'fee', type: 'float' },
  { key: 'net', type: 'float' },
  { key: 'status', type: 'string', size: 32 },
  { key: 'settledAt', type: 'string', size: 64 },
  { key: 'note', type: 'string', size: 2048 },
  { key: 'category', type: 'string', size: 128 },
  { key: 'direction', type: 'string', size: 8 },
  { key: 'lead_id', type: 'string', size: 64 },
  { key: 'competence_month', type: 'string', size: 7 },
  { key: 'origin', type: 'string', size: 64 },
  { key: 'origin_detail', type: 'string', size: 128 },
  { key: 'origin_type', type: 'string', size: 64 },
  { key: 'origin_id', type: 'string', size: 64 },
  { key: 'created_by', type: 'string', size: 64 },
  { key: 'updated_by', type: 'string', size: 64 },
  { key: 'updated_at', type: 'string', size: 64 },
  { key: 'recurrence_origin_id', type: 'string', size: 64 },
  { key: 'recurrence_type', type: 'string', size: 16 },
  { key: 'recurrence_day', type: 'integer' },
  { key: 'recurrence_end', type: 'string', size: 7 },
  { key: 'is_recurrence_template', type: 'boolean' },
  { key: 'reconciled', type: 'boolean' },
  { key: 'reconciled_at', type: 'datetime' },
  { key: 'reconciled_by', type: 'string', size: 64 },
  { key: 'bank_statement_id', type: 'string', size: 64 },
];

const STUDENT_PAYMENTS_ATTRS = [
  { key: 'lead_id', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'amount', type: 'float' },
  { key: 'paid_amount', type: 'float' },
  { key: 'expected_amount', type: 'float' },
  { key: 'method', type: 'string', size: 32 },
  { key: 'account', type: 'string', size: 64 },
  { key: 'plan_name', type: 'string', size: 128 },
  { key: 'status', type: 'string', size: 32 },
  { key: 'reference_month', type: 'string', size: 7 },
  { key: 'due_date', type: 'string', size: 32 },
  { key: 'paid_at', type: 'string', size: 64 },
  { key: 'registered_by', type: 'string', size: 64 },
  { key: 'registered_by_name', type: 'string', size: 128 },
  { key: 'note', type: 'string', size: 2048 },
  { key: 'payment_category', type: 'string', size: 32 },
  { key: 'financial_tx_id', type: 'string', size: 64 },
  { key: 'financial_tx_sync_pending', type: 'boolean' },
];

const AUDIT_ATTRS = [
  { key: 'action', type: 'string', size: 64 },
  { key: 'payment_id', type: 'string', size: 64 },
  { key: 'student_id', type: 'string', size: 64 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'user_id', type: 'string', size: 64 },
  { key: 'amount', type: 'float' },
  { key: 'previous_status', type: 'string', size: 32 },
  { key: 'new_status', type: 'string', size: 32 },
  { key: 'timestamp', type: 'string', size: 64 },
  { key: 'meta_json', type: 'string', size: 4096 },
];

const STOCK_ITEMS_ATTRS = [
  { key: 'nome', type: 'string', size: 128 },
  { key: 'descricao', type: 'string', size: 512 },
  { key: 'categoria', type: 'string', size: 64 },
  { key: 'Tamanho', type: 'string', size: 16 },
  { key: 'sale_price', type: 'float' },
  { key: 'cost_price', type: 'float' },
  { key: 'current_quantity', type: 'float' },
  { key: 'minimum_level', type: 'float' },
  { key: 'unit', type: 'string', size: 32 },
  { key: 'notes', type: 'string', size: 2048 },
  { key: 'academy_id', type: 'string', size: 64 },
  { key: 'average_cost', type: 'float' },
  { key: 'last_purchase_cost', type: 'float' },
  { key: 'last_updated', type: 'string', size: 64 },
  { key: 'last_checked', type: 'string', size: 64 },
  { key: 'is_active', type: 'boolean' },
  { key: 'is_for_sale', type: 'boolean' },
  { key: 'image_url', type: 'string', size: 512 },
  { key: 'sku', type: 'string', size: 64 },
];

const SALE_ITEMS_ATTRS = [
  { key: 'venda_id', type: 'string', size: 64 },
  { key: 'item_estoque_id', type: 'string', size: 64 },
  { key: 'product_variant_id', type: 'string', size: 64 },
  { key: 'quantidade', type: 'float' },
  { key: 'preco_unitario', type: 'float' },
  { key: 'cmv', type: 'float' },
];

const SALES_ATTRS = [
  { key: 'academyId', type: 'string', size: 64 },
  { key: 'aluno_id', type: 'string', size: 64 },
  { key: 'total', type: 'float' },
  { key: 'forma_pagamento', type: 'string', size: 64 },
  { key: 'status', type: 'string', size: 32 },
  { key: 'idempotency_key', type: 'string', size: 128 },
  { key: 'canal', type: 'string', size: 32 },
  { key: 'created_by', type: 'string', size: 64 },
  { key: 'created_by_name', type: 'string', size: 128 },
  { key: 'cliente_nome', type: 'string', size: 128 },
  { key: 'cliente_telefone', type: 'string', size: 32 },
  { key: 'pagamentos_json', type: 'string', size: 2048 },
  { key: 'itens_snapshot_json', type: 'string', size: 8192 },
  { key: 'venda_colaborador', type: 'boolean' },
  { key: 'cancelada_em', type: 'string', size: 64 },
  { key: 'cancel_motivo', type: 'string', size: 256 },
  { key: 'origin_detail', type: 'string', size: 128 },
];

function printLineSummary(name, s) {
  console.log(
    `  ${name.padEnd(20)} → ${s.created} criados, ${s.exists} já existiam, ${s.divergent} divergentes, ${s.errors} erros`
  );
}

async function main() {
  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
    console.error('❌ Faltam APPWRITE_ENDPOINT, PROJECT_ID, API_KEY ou DATABASE_ID no .env');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  console.log('Verificação e correção de schema Appwrite');
  console.log(`Database: ${DB_ID}`);
  console.log(`Intervalo entre operações: ${ATTR_GAP_MS}ms\n`);

  await processCollection(databases, {
    id: FINANCIAL_TX_COL,
    statsKey: 'FINANCIAL_TX',
    title: 'FINANCIAL_TX',
    attrs: FINANCIAL_TX_ATTRS,
    indexes: [
      { key: 'idx_fin_tx_academy_created', attributes: ['academyId', '$createdAt'] },
      { key: 'idx_fin_tx_sale_id', attributes: ['saleId'] },
      { key: 'idx_fin_tx_lead_id', attributes: ['lead_id'] },
      { key: 'idx_fin_tx_status', attributes: ['status'] },
    ],
  });

  await processCollection(databases, {
    id: STUDENT_PAYMENTS_COL,
    statsKey: 'STUDENT_PAYMENTS',
    title: 'STUDENT_PAYMENTS',
    attrs: STUDENT_PAYMENTS_ATTRS,
    indexes: [
      { key: 'idx_student_payments_academy_id', attributes: ['academy_id'] },
      { key: 'idx_student_payments_lead_id', attributes: ['lead_id'] },
      { key: 'idx_student_payments_reference_month', attributes: ['reference_month'] },
      { key: 'idx_student_payments_status', attributes: ['status'] },
    ],
  });

  if (AUDIT_COL) {
    await processCollection(databases, {
      id: AUDIT_COL,
      statsKey: 'financial_audit',
      title: 'financial_audit_log',
      attrs: AUDIT_ATTRS,
      indexes: [
        { key: 'idx_audit_academy_id', attributes: ['academy_id'] },
        { key: 'idx_audit_payment_id', attributes: ['payment_id'] },
      ],
    });
  } else {
    console.log('\n⚠️ financial_audit_log: APPWRITE_FINANCIAL_AUDIT_LOG_COLLECTION_ID não configurado (pulando)');
  }

  await processCollection(databases, {
    id: STOCK_ITEMS_COL,
    statsKey: 'STOCK_ITEMS',
    title: 'STOCK_ITEMS',
    attrs: STOCK_ITEMS_ATTRS,
    indexes: [
      { key: 'idx_stock_items_academy_id', attributes: ['academy_id'] },
      { key: 'idx_stock_items_is_active', attributes: ['is_active'] },
    ],
  });

  await processCollection(databases, {
    id: SALE_ITEMS_COL,
    statsKey: 'SALE_ITEMS',
    title: 'SALE_ITEMS',
    attrs: SALE_ITEMS_ATTRS,
    indexes: [
      { key: 'idx_sale_items_venda_id', attributes: ['venda_id'] },
      { key: 'idx_sale_items_item_estoque_id', attributes: ['item_estoque_id'] },
    ],
  });

  await processCollection(databases, {
    id: SALES_COL,
    statsKey: 'SALES',
    title: 'SALES',
    attrs: SALES_ATTRS,
    indexes: [
      { key: 'idx_sales_idempotency_key', attributes: ['idempotency_key'] },
      { key: 'idx_sales_academy_id', attributes: ['academyId'] },
      { key: 'idx_sales_aluno_id', attributes: ['aluno_id'] },
      { key: 'idx_sales_status', attributes: ['status'] },
    ],
  });

  console.log('\n════════════════════════════════════════');
  console.log('RESUMO POR COLLECTION');
  console.log('════════════════════════════════════════');
  printLineSummary('FINANCIAL_TX', summary.FINANCIAL_TX);
  printLineSummary('STUDENT_PAYMENTS', summary.STUDENT_PAYMENTS);
  printLineSummary('financial_audit', summary.financial_audit);
  printLineSummary('STOCK_ITEMS', summary.STOCK_ITEMS);
  printLineSummary('SALE_ITEMS', summary.SALE_ITEMS);
  printLineSummary('SALES', summary.SALES);
  console.log('════════════════════════════════════════\n');

  const totalErrors = Object.values(summary).reduce((n, s) => n + s.errors, 0);
  if (totalErrors > 0) process.exit(2);
}

main().catch((e) => {
  console.error('\n❌ Falha ao iniciar:', e?.message || e);
  process.exit(1);
});

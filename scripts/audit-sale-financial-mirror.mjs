/**
 * Audita espelho financeiro de vendas concluídas (receita + CMV).
 *
 * Uso:
 *   node --env-file=.env scripts/audit-sale-financial-mirror.mjs
 *   node --env-file=.env scripts/audit-sale-financial-mirror.mjs --academy=ACADEMY_ID
 *   node --env-file=.env scripts/audit-sale-financial-mirror.mjs --limit=100 --json
 *   node --env-file=.env scripts/audit-sale-financial-mirror.mjs --academy=ID --fix
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Client, Databases, Query } from 'node-appwrite';

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

const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const JSON_OUT = args.includes('--json');
const academyArg = args.find((a) => a.startsWith('--academy='));
const limitArg = args.find((a) => a.startsWith('--limit='));

const ACADEMY_FILTER =
  (academyArg ? academyArg.split('=').slice(1).join('=') : '') ||
  String(process.env.AUDIT_SALE_ACADEMY_ID || '').trim();

const LIMIT = Math.min(500, Math.max(1, Number(limitArg?.split('=')[1] || 200) || 200));

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const SALE_REVENUE_TYPES = new Set(['product', 'rental']);

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function absGross(doc) {
  return Math.abs(Number(doc?.gross) || 0);
}

function txOrigin(doc) {
  return String(doc?.origin_type || doc?.originType || '').toLowerCase();
}

function txType(doc) {
  return String(doc?.type || '').toLowerCase();
}

function isRevenueTx(doc) {
  const type = txType(doc);
  if (SALE_REVENUE_TYPES.has(type)) return true;
  return txOrigin(doc) === 'sale' && type !== 'stock_purchase';
}

function isCmvTx(doc) {
  const origin = txOrigin(doc);
  if (origin === 'sale_cmv') return true;
  return txType(doc) === 'stock_purchase' && origin !== 'sale';
}

function isTrocoTx(doc) {
  return txType(doc) === 'expense_operational' && String(doc?.note || '').toLowerCase().includes('troco');
}

function classifySale(sale, txs, saleItems) {
  const issues = [];
  const vendaId = sale.$id;
  const saleTotal = roundMoney(sale.total);
  const settled = (txs || []).filter((d) => String(d.status || '').toLowerCase() !== 'cancelled');

  const revenueTxs = settled.filter(isRevenueTx);
  const cmvTxs = settled.filter(isCmvTx);
  const trocoTxs = settled.filter(isTrocoTx);

  const revenueGross = roundMoney(revenueTxs.reduce((s, d) => s + absGross(d), 0));
  const cmvGross = roundMoney(cmvTxs.reduce((s, d) => s + absGross(d), 0));
  const itemsCmv = roundMoney(
    (saleItems || []).reduce((s, it) => s + Math.max(0, Number(it.cmv) || 0), 0)
  );

  if (!revenueTxs.length) {
    issues.push('missing_revenue');
    if (cmvTxs.length) issues.push('cmv_only');
  }

  if (revenueTxs.length > 1) {
    issues.push('duplicate_revenue');
  }

  if (saleTotal > 0 && revenueTxs.length && Math.abs(revenueGross - saleTotal) > 0.02) {
    issues.push('revenue_total_mismatch');
  }

  if (cmvTxs.length > 1) {
    issues.push('duplicate_cmv');
  }

  for (const d of cmvTxs) {
    if (Number(d.gross) < -0.001) issues.push('cmv_legacy_negative_gross');
  }

  if (saleTotal > 0 && cmvGross > saleTotal + 0.02) {
    issues.push('cmv_exceeds_sale_total');
  }

  if (itemsCmv > 0 && cmvTxs.length && Math.abs(itemsCmv - cmvGross) > 0.05) {
    issues.push('cmv_mismatch_sale_items');
  }

  const ok = issues.length === 0;
  return {
    venda_id: vendaId,
    venda_short: String(vendaId).slice(-4).toUpperCase(),
    academy_id: String(sale.academyId || sale.academy_id || ''),
    sale_total: saleTotal,
    created_at: sale.$createdAt || '',
    revenue_count: revenueTxs.length,
    revenue_gross: revenueGross,
    cmv_count: cmvTxs.length,
    cmv_gross: cmvGross,
    items_cmv: itemsCmv,
    troco_count: trocoTxs.length,
    issues,
    ok,
  };
}

async function paginateSales(databases, academyId) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 20 && out.length < LIMIT; page += 1) {
    const q = [
      Query.equal('status', 'concluida'),
      Query.orderDesc('$createdAt'),
      Query.limit(Math.min(100, LIMIT - out.length)),
    ];
    if (academyId) {
      try {
        q.unshift(Query.equal('academyId', academyId));
      } catch {
        void 0;
      }
    }
    if (cursor) q.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, SALES_COL, q);
    } catch {
      const q2 = [
        Query.equal('status', 'concluida'),
        Query.orderDesc('$createdAt'),
        Query.limit(Math.min(100, LIMIT - out.length)),
      ];
      if (cursor) q2.push(Query.cursorAfter(cursor));
      res = await databases.listDocuments(DB_ID, SALES_COL, q2);
    }
    const docs = res.documents || [];
    for (const d of docs) {
      if (academyId && String(d.academyId || d.academy_id || '') !== academyId) continue;
      out.push(d);
      if (out.length >= LIMIT) break;
    }
    if (docs.length < 100 || out.length >= LIMIT) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return out;
}

async function listTxForSale(databases, vendaId) {
  if (!FINANCIAL_TX_COL || !vendaId) return [];
  try {
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
      Query.equal('saleId', vendaId),
      Query.limit(50),
    ]);
    return res.documents || [];
  } catch {
    return [];
  }
}

async function listSaleItems(databases, vendaId) {
  if (!SALE_ITEMS_COL || !vendaId) return [];
  try {
    const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
      Query.equal('venda_id', vendaId),
      Query.limit(50),
    ]);
    return res.documents || [];
  } catch {
    return [];
  }
}

async function loadAcademyMap(databases, academyIds) {
  const map = new Map();
  if (!ACADEMIES_COL) return map;
  for (const id of academyIds) {
    if (!id || map.has(id)) continue;
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
      map.set(id, doc);
    } catch {
      map.set(id, null);
    }
  }
  return map;
}

async function main() {
  if (!API_KEY || !DB_ID || !SALES_COL) {
    fail('Configure APPWRITE_API_KEY, DB_ID e SALES_COL no .env');
  }
  if (!FINANCIAL_TX_COL) {
    fail('Configure FINANCIAL_TX_COL / VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID');
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  const sales = await paginateSales(databases, ACADEMY_FILTER);
  const rows = [];

  for (const sale of sales) {
    const [txs, items] = await Promise.all([
      listTxForSale(databases, sale.$id),
      listSaleItems(databases, sale.$id),
    ]);
    rows.push(classifySale(sale, txs, items));
  }

  const issueCounts = {};
  for (const row of rows) {
    for (const issue of row.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  const needsFix = rows.filter((r) => r.issues.includes('missing_revenue'));
  let repaired = [];
  let repairFailed = [];

  if (FIX && needsFix.length) {
    const { mirrorSaleFinancialsForDoc } = await import(
      pathToFileURL(path.resolve(__dirname, '../lib/server/salesMirror.js')).href
    );
    const academyMap = await loadAcademyMap(
      databases,
      [...new Set(needsFix.map((r) => r.academy_id).filter(Boolean))]
    );

    for (const row of needsFix) {
      const sale = sales.find((s) => s.$id === row.venda_id);
      const academyDoc = academyMap.get(row.academy_id);
      if (!sale || !academyDoc) {
        repairFailed.push({ venda_id: row.venda_id, error: 'sale_or_academy_not_found' });
        continue;
      }
      try {
        const result = await mirrorSaleFinancialsForDoc(sale, academyDoc);
        if (result.ok) repaired.push(row.venda_id);
        else repairFailed.push({ venda_id: row.venda_id, warnings: result.warnings || [] });
      } catch (e) {
        repairFailed.push({ venda_id: row.venda_id, error: String(e?.message || e) });
      }
    }

    if (repaired.length) {
      for (let i = 0; i < rows.length; i += 1) {
        if (!repaired.includes(rows[i].venda_id)) continue;
        const sale = sales.find((s) => s.$id === rows[i].venda_id);
        const [txs, items] = await Promise.all([
          listTxForSale(databases, sale.$id),
          listSaleItems(databases, sale.$id),
        ]);
        rows[i] = classifySale(sale, txs, items);
      }
      Object.keys(issueCounts).forEach((k) => delete issueCounts[k]);
      for (const row of rows) {
        for (const issue of row.issues) {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
      }
    }
  }

  const summary = {
    academy_filter: ACADEMY_FILTER || '(todas)',
    sales_checked: rows.length,
    ok_count: rows.filter((r) => r.ok).length,
    with_issues: rows.filter((r) => !r.ok).length,
    issue_counts: issueCounts,
    missing_revenue_ids: rows.filter((r) => r.issues.includes('missing_revenue')).map((r) => r.venda_id),
    repaired_count: repaired.length,
    repaired_ids: repaired,
    repair_failed: repairFailed,
    rows: rows.filter((r) => !r.ok),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('\n=== Auditoria: espelho financeiro de vendas ===\n');
  console.log(`Academia: ${summary.academy_filter}`);
  console.log(`Vendas concluídas analisadas: ${summary.sales_checked}`);
  console.log(`OK: ${summary.ok_count} | Com problema: ${summary.with_issues}\n`);

  if (Object.keys(issueCounts).length) {
    console.log('Problemas por tipo:');
    for (const [k, v] of Object.entries(issueCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${k}: ${v}`);
    }
    console.log('');
  }

  const bad = rows.filter((r) => !r.ok).slice(0, 40);
  if (bad.length) {
    console.log('Amostra (até 40 vendas com problema):');
    for (const r of bad) {
      console.log(
        `  #${r.venda_short} ${r.venda_id} | total R$ ${r.sale_total.toFixed(2)} | receita: ${r.revenue_count} (R$ ${r.revenue_gross}) | CMV: ${r.cmv_count} (R$ ${r.cmv_gross}) | ${r.issues.join(', ')}`
      );
    }
    if (rows.filter((r) => !r.ok).length > 40) {
      console.log(`  … e mais ${rows.filter((r) => !r.ok).length - 40} venda(s)`);
    }
    console.log('');
  }

  if (needsFix.length) {
    console.log(`Vendas sem receita (missing_revenue): ${needsFix.length}`);
    if (!FIX) {
      console.log('  → Rode com --fix para criar lançamentos de receita faltantes.\n');
    }
  }

  if (FIX) {
    console.log(`Reparo: ${repaired.length} corrigida(s), ${repairFailed.length} falha(s).`);
    if (repairFailed.length) {
      for (const f of repairFailed.slice(0, 10)) {
        console.log(`  falha ${f.venda_id}: ${f.error || JSON.stringify(f.warnings)}`);
      }
    }
    console.log('');
  }

  const manual = rows.filter(
    (r) => r.issues.some((i) => i !== 'missing_revenue' && i !== 'cmv_only')
  );
  if (manual.length) {
    console.log(
      `⚠️  ${manual.length} venda(s) com problemas que exigem revisão manual (estorno/ajuste no Financeiro).`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Auditoria de estornos FINANCIAL_TX — somente leitura.
 *
 * Uso:
 *   node --env-file=.env --env-file=.env.local scripts/audit-finance-reversal-orphans.mjs --academy=ACADEMY_ID
 *   node --env-file=.env --env-file=.env.local scripts/audit-finance-reversal-orphans.mjs --academy=ACADEMY_ID --month=2026-06
 *   node --env-file=.env --env-file=.env.local scripts/audit-finance-reversal-orphans.mjs --academy=ACADEMY_ID --json
 *   node --env-file=.env --env-file=.env.local scripts/audit-finance-reversal-orphans.mjs --academy=ACADEMY_ID --out=reports/reversal-audit.csv
 *
 * Padrão: --dry-run (não grava nada).
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
      if (override && !v && k in process.env) return;
      if (override || !(k in process.env)) process.env[k] = v;
    });
  } catch {
    void 0;
  }
}

applyEnvFile('.env', { override: false });
applyEnvFile('.env.local', { override: true });

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const academyArg = args.find((a) => a.startsWith('--academy='));
const monthArg = args.find((a) => a.startsWith('--month='));
const outArg = args.find((a) => a.startsWith('--out='));

const ACADEMY_ID = (academyArg ? academyArg.split('=').slice(1).join('=') : '').trim();
const MONTH = (monthArg ? monthArg.split('=').slice(1).join('=') : '').trim();
const OUT_PATH = outArg ? outArg.split('=').slice(1).join('=') : '';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
  process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
  process.env.FINANCIAL_TX_COL ||
  '';

const { auditFinanceReversalIntegrity } = await import(
  pathToFileURL(path.resolve(__dirname, '../lib/server/financeTxReversalIntegrity.js')).href
);

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function listAllFinancialTx(databases, academyId) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 200; page += 1) {
    const queries = [Query.equal('academyId', academyId), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, queries);
    const docs = res.documents || [];
    if (!docs.length) break;
    out.push(...docs);
    cursor = docs[docs.length - 1].$id;
    if (docs.length < 100) break;
  }
  return out;
}

function filterByMonth(docs, month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return docs;
  return docs.filter((d) => {
    const cm = String(d.competence_month || '').slice(0, 7);
    const settled = String(d.settledAt || d.$createdAt || '').slice(0, 7);
    return cm === month || settled === month;
  });
}

function toCsv(report) {
  const lines = ['section,id,gross,status,note,linked_id,extra'];
  for (const row of report.orphans) {
    lines.push(
      [
        'orphan',
        row.id,
        row.gross,
        row.status,
        JSON.stringify(row.note || ''),
        row.reverses_id || '',
        row.reason,
      ].join(',')
    );
  }
  for (const row of report.inflated_pairs) {
    lines.push(
      [
        'inflated_pair',
        row.entrada_id,
        row.gross,
        'settled',
        JSON.stringify(row.entrada_note || ''),
        row.estorno_id,
        JSON.stringify(row.estorno_note || ''),
      ].join(',')
    );
    lines.push(
      [
        'inflated_pair_estorno',
        row.estorno_id,
        row.gross,
        'settled',
        JSON.stringify(row.estorno_note || ''),
        row.entrada_id,
        '',
      ].join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  if (!ACADEMY_ID) fail('Informe --academy=ACADEMY_ID');
  if (!API_KEY || !PROJECT_ID || !DB_ID || !FINANCIAL_TX_COL) {
    fail('Configure APPWRITE_API_KEY, PROJECT, DB_ID e FINANCIAL_TX_COL');
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  console.log(`\n🔍 Auditoria estornos FINANCIAL_TX (dry-run)`);
  console.log(`   academy: ${ACADEMY_ID}`);
  if (MONTH) console.log(`   mês:     ${MONTH}`);

  const all = await listAllFinancialTx(databases, ACADEMY_ID);
  const scoped = filterByMonth(all, MONTH);
  const report = auditFinanceReversalIntegrity(scoped);

  if (JSON_OUT) {
    console.log(JSON.stringify({ academyId: ACADEMY_ID, month: MONTH || null, ...report }, null, 2));
  } else {
    console.log(`\nTotal lançamentos analisados: ${scoped.length}`);
    console.log(`Estornos órfãos:            ${report.orphan_count}`);
    console.log(`Pares entrada+estorno:      ${report.inflated_pair_count}`);

    if (report.orphans.length) {
      console.log('\n--- Estornos órfãos ---');
      for (const row of report.orphans) {
        console.log(`  ${row.id}  R$ ${row.gross}  ${row.reason}  ${row.note}`);
      }
    }

    if (report.inflated_pairs.length) {
      console.log('\n--- Pares entrada errada + estorno ---');
      for (const row of report.inflated_pairs) {
        console.log(
          `  entrada ${row.entrada_id} + estorno ${row.estorno_id}  R$ ${row.gross}`
        );
      }
    }

    if (!report.orphan_count && !report.inflated_pair_count) {
      console.log('\n✅ Nenhuma inconsistência detectada no escopo.');
    } else {
      console.log('\n⚠️  Somente relatório — nenhum dado foi alterado.');
    }
  }

  if (OUT_PATH) {
    const abs = path.resolve(process.cwd(), OUT_PATH);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, toCsv(report), 'utf-8');
    console.log(`\nCSV gravado em ${abs}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

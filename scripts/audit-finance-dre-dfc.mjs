/**
 * Auditoria read-only — cobertura de categoria, competência e mapeamento DRE/DFC.
 *
 * Uso:
 *   node --env-file=.env.local scripts/audit-finance-dre-dfc.mjs
 *   node --env-file=.env.local scripts/audit-finance-dre-dfc.mjs --academy=ACADEMY_ID
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const academyArg = process.argv.find((a) => a.startsWith('--academy='));
const ACADEMY_ID = (academyArg ? academyArg.split('=').slice(1).join('=') : '699f21b70006985daa90').trim();

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const TX_COL = process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const ACC_COL = process.env.VITE_APPWRITE_ACCOUNTS_COLLECTION_ID || '';

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

if (!API_KEY || !DB_ID || !TX_COL) {
  fail('Missing APPWRITE_API_KEY, DB_ID or FINANCIAL_TX collection');
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function fetchAll(col, queries) {
  let all = [];
  let cursor = null;
  for (let i = 0; i < 60; i += 1) {
    const q = [...queries, Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await db.listDocuments(DB_ID, col, q);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1]?.$id;
    if (!cursor) break;
  }
  return all;
}

function catFromDoc(d) {
  const direct = String(d.category || '').trim();
  if (direct) return { value: direct, source: 'category' };
  const note = String(d.note || '');
  const m = note.match(/^@cat:([^\n]+)/m);
  if (m) return { value: m[1].trim(), source: 'note' };
  return { value: '', source: 'none' };
}

const txs = await fetchAll(TX_COL, [Query.equal('academyId', ACADEMY_ID)]);
const accounts = ACC_COL ? await fetchAll(ACC_COL, [Query.equal('academyId', ACADEMY_ID)]) : [];

const txStats = {
  total: txs.length,
  settled: 0,
  withCategoryAttr: 0,
  withCategoryNote: 0,
  withoutCategory: 0,
  withCompetenceMonth: 0,
  withoutCompetenceMonth: 0,
  saleCmv: 0,
  cardFeeType: 0,
  withFeeField: 0,
  topCategories: {},
};

for (const d of txs) {
  const st = String(d.status || '').toLowerCase();
  if (st === 'settled') txStats.settled += 1;

  const cat = catFromDoc(d);
  if (cat.source === 'category') txStats.withCategoryAttr += 1;
  else if (cat.source === 'note') txStats.withCategoryNote += 1;
  else txStats.withoutCategory += 1;
  if (cat.value) txStats.topCategories[cat.value] = (txStats.topCategories[cat.value] || 0) + 1;

  if (/^\d{4}-\d{2}$/.test(String(d.competence_month || ''))) txStats.withCompetenceMonth += 1;
  else txStats.withoutCompetenceMonth += 1;

  const o = String(d.origin_type || '').toLowerCase();
  if (o === 'sale_cmv') txStats.saleCmv += 1;
  if (String(d.type || '').toLowerCase() === 'card_fee') txStats.cardFeeType += 1;
  if (Number(d.fee) > 0.009) txStats.withFeeField += 1;
}

const accStats = {
  total: accounts.length,
  withDreGrupo: 0,
  withDfcClasse: 0,
  resultAccountsNeedingBackfill: 0,
};

const RESULT_TYPES = new Set(['receita', 'custo', 'despesa']);

for (const a of accounts) {
  if (String(a.dreGrupo || '').trim()) accStats.withDreGrupo += 1;
  if (String(a.dfcClasse || '').trim()) accStats.withDfcClasse += 1;
  const t = String(a.type || '').toLowerCase();
  if (!RESULT_TYPES.has(t)) continue;
  const dre = String(a.dreGrupo || '').trim();
  const dfc = String(a.dfcClasse || '').trim();
  const needsDre = !dre;
  const needsDfc = !dfc || (dre === 'Resultado Financeiro' && dfc === 'Financiamento');
  if (needsDre || needsDfc) accStats.resultAccountsNeedingBackfill += 1;
}

const topCats = Object.entries(txStats.topCategories)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([label, count]) => ({ label, count }));

console.log(
  JSON.stringify(
    {
      academyId: ACADEMY_ID,
      financialTx: {
        ...txStats,
        topCategories: topCats,
        categoryFilledPct: txStats.total
          ? Math.round((100 * (txStats.withCategoryAttr + txStats.withCategoryNote)) / txStats.total)
          : 0,
        competenceFilledPct: txStats.total
          ? Math.round((100 * txStats.withCompetenceMonth) / txStats.total)
          : 0,
      },
      accounts: {
        ...accStats,
        dreGrupoFilledPct: accounts.length ? Math.round((100 * accStats.withDreGrupo) / accounts.length) : 0,
        dfcClasseFilledPct: accounts.length ? Math.round((100 * accStats.withDfcClasse) / accounts.length) : 0,
      },
    },
    null,
    2
  )
);

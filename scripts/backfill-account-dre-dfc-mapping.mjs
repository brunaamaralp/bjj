/**
 * Backfill dry-run — dreGrupo / dfcClasse em contas de resultado (receita, custo, despesa).
 * Não cria atributos novos; só preenche valores vazios ou corrige Financiamento → Operacional
 * em contas de Resultado Financeiro.
 *
 * Uso:
 *   node --env-file=.env.local scripts/backfill-account-dre-dfc-mapping.mjs --academy=ID
 *   node --env-file=.env.local scripts/backfill-account-dre-dfc-mapping.mjs --academy=ID --fix
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Client, Databases, Query } from 'node-appwrite';
import { suggestFieldsForType } from '../src/lib/financeAccountFormRules.js';
import {
  DFC_GROUPS,
  defaultDfcClasseForAccountType,
  normalizeDfcClasse,
} from '../src/lib/financeDfcMapping.js';

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
const academyArg = args.find((a) => a.startsWith('--academy='));
const ACADEMY_ID = (academyArg ? academyArg.split('=').slice(1).join('=') : '').trim();

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACC_COL = process.env.VITE_APPWRITE_ACCOUNTS_COLLECTION_ID || '';

const RESULT_TYPES = new Set(['receita', 'custo', 'despesa']);

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

if (!ACADEMY_ID) fail('Informe --academy=ID');
if (!API_KEY || !DB_ID || !ACC_COL) fail('Missing APPWRITE_API_KEY, DB_ID or ACCOUNTS collection');

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

function proposePatch(account) {
  const type = String(account.type || '').trim().toLowerCase();
  if (!RESULT_TYPES.has(type)) return null;

  const currentDre = String(account.dreGrupo || '').trim();
  const currentDfc = normalizeDfcClasse(account.dfcClasse);
  const patch = {};
  const reasons = [];

  if (!currentDre) {
    const suggested = suggestFieldsForType(type);
    if (suggested.dreGrupo) {
      patch.dreGrupo = suggested.dreGrupo;
      reasons.push('dreGrupo_vazio');
    }
  }

  const effectiveDre = patch.dreGrupo || currentDre;
  const targetDfc = defaultDfcClasseForAccountType(type, effectiveDre);

  if (!currentDfc && targetDfc) {
    patch.dfcClasse = targetDfc;
    reasons.push('dfcClasse_vazio');
  } else if (
    effectiveDre === 'Resultado Financeiro' &&
    currentDfc === DFC_GROUPS.FINANCING
  ) {
    patch.dfcClasse = DFC_GROUPS.OPERATIONAL;
    reasons.push('resultado_financeiro_nao_e_financiamento');
  }

  if (!Object.keys(patch).length) return null;

  return {
    id: account.$id,
    code: account.code,
    name: account.name,
    type: account.type,
    before: { dreGrupo: currentDre || null, dfcClasse: currentDfc || null },
    after: {
      dreGrupo: patch.dreGrupo ?? (currentDre || null),
      dfcClasse: patch.dfcClasse ?? (currentDfc || null),
    },
    patch,
    reasons,
  };
}

async function fetchAccounts(academyId) {
  let all = [];
  let cursor = null;
  for (let i = 0; i < 20; i += 1) {
    const q = [Query.equal('academyId', academyId), Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await db.listDocuments(DB_ID, ACC_COL, q);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1]?.$id;
  }
  return all;
}

const accounts = await fetchAccounts(ACADEMY_ID);
const proposals = accounts.map(proposePatch).filter(Boolean);

const summary = {
  academyId: ACADEMY_ID,
  mode: FIX ? 'fix' : 'dry-run',
  totalAccounts: accounts.length,
  resultAccounts: accounts.filter((a) => RESULT_TYPES.has(String(a.type || '').toLowerCase())).length,
  proposals: proposals.length,
  byReason: {},
};

for (const p of proposals) {
  for (const r of p.reasons) {
    summary.byReason[r] = (summary.byReason[r] || 0) + 1;
  }
}

console.log(JSON.stringify({ summary, changes: proposals }, null, 2));

if (FIX && proposals.length > 0) {
  let updated = 0;
  for (const p of proposals) {
    try {
      await db.updateDocument(DB_ID, ACC_COL, p.id, p.patch);
      updated += 1;
    } catch (e) {
      console.error(`Failed ${p.code}: ${e?.message || e}`);
    }
  }
  console.error(`\n✅ ${updated}/${proposals.length} contas atualizadas.`);
} else if (!FIX && proposals.length > 0) {
  console.error('\nℹ️  Dry-run — use --fix para aplicar após revisão.');
}

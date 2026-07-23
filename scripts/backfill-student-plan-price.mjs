/**
 * Preenche students.plan_price a partir do catálogo atual (financeConfig).
 *
 * Uso:
 *   node --env-file=.env --env-file=.env.local scripts/backfill-student-plan-price.mjs [--apply] [--academy-id=xxx]
 *
 * Padrão: dry-run (não grava).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Client, Databases, Query } from 'node-appwrite';
import { resolvePlanPriceBackfillPatch } from '../lib/server/studentPlanPriceBackfill.js';

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
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const academyFilter = args.find((a) => a.startsWith('--academy-id='))?.split('=')[1]?.trim() || '';

const { parseFinanceConfigRaw } = await import(
  pathToFileURL(path.resolve(__dirname, '../src/lib/financeConfigStorage.js')).href
);

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function listAcademies(databases) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 50; page += 1) {
    const q = [Query.limit(100), Query.orderAsc('$id')];
    if (academyFilter) q.push(Query.equal('$id', academyFilter));
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, ACADEMIES_COL, q);
    const docs = res.documents || [];
    out.push(...docs);
    if (docs.length < 100 || academyFilter) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return out;
}

async function migrateAcademy(databases, academyDoc) {
  const academyId = academyDoc.$id;
  const financeConfig = parseFinanceConfigRaw(academyDoc.financeConfig) || { plans: [] };
  const stats = {
    scanned: 0,
    skipped_already_has_snapshot: 0,
    skipped_no_plan: 0,
    skipped_plan_not_in_catalog: 0,
    updated: 0,
    errors: 0,
  };

  let cursor = null;
  for (let page = 0; page < 200; page += 1) {
    const q = [Query.equal('academyId', academyId), Query.limit(100), Query.orderDesc('$createdAt')];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, STUDENTS_COL, q);
    const docs = res.documents || [];

    for (const doc of docs) {
      stats.scanned += 1;
      const decision = resolvePlanPriceBackfillPatch(doc, financeConfig);

      if (decision.skip) {
        if (decision.reason === 'already_has_snapshot') stats.skipped_already_has_snapshot += 1;
        else if (decision.reason === 'no_plan') stats.skipped_no_plan += 1;
        else if (decision.reason === 'plan_not_in_catalog') stats.skipped_plan_not_in_catalog += 1;
        continue;
      }

      stats.updated += 1;

      if (dryRun) {
        console.log(
          `[dry-run] ${academyId} ${doc.$id} plan=${JSON.stringify(doc.plan)} → plan_price=${decision.patch.plan_price}`
        );
        continue;
      }

      try {
        await databases.updateDocument(DB_ID, STUDENTS_COL, doc.$id, decision.patch);
      } catch (e) {
        stats.errors += 1;
        stats.updated -= 1;
        console.warn(`⚠️  ${doc.$id}: ${e?.message || e}`);
      }
    }

    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }

  return stats;
}

async function main() {
  if (!API_KEY) fail('Defina APPWRITE_API_KEY no .env');
  if (!DB_ID) fail('Defina VITE_APPWRITE_DATABASE_ID no .env');
  if (!ACADEMIES_COL) fail('Defina VITE_APPWRITE_ACADEMIES_COLLECTION_ID no .env');
  if (!STUDENTS_COL) fail('Defina VITE_APPWRITE_STUDENTS_COLLECTION_ID no .env');
  if (!PROJECT_ID) fail('Defina APPWRITE_PROJECT_ID / VITE_APPWRITE_PROJECT no .env');

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  console.log(dryRun ? '\n🔍 Modo dry-run (use --apply para gravar)\n' : '\n✏️  Aplicando alterações…\n');

  const academies = await listAcademies(databases);
  if (!academies.length) {
    console.log(academyFilter ? `Academia ${academyFilter} não encontrada.` : 'Nenhuma academia encontrada.');
    return;
  }

  const total = {
    academies: academies.length,
    dryRun,
    scanned: 0,
    skipped_already_has_snapshot: 0,
    skipped_no_plan: 0,
    skipped_plan_not_in_catalog: 0,
    updated: 0,
    errors: 0,
  };

  for (const academy of academies) {
    const out = await migrateAcademy(databases, academy);
    total.scanned += out.scanned;
    total.skipped_already_has_snapshot += out.skipped_already_has_snapshot;
    total.skipped_no_plan += out.skipped_no_plan;
    total.skipped_plan_not_in_catalog += out.skipped_plan_not_in_catalog;
    total.updated += out.updated;
    total.errors += out.errors;
    console.log(JSON.stringify({ academyId: academy.$id, ...out }));
  }

  console.log('\n--- Resumo ---');
  console.log(JSON.stringify(total, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

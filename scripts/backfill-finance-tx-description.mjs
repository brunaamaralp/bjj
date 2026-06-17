/**
 * Preenche planName em FINANCIAL_TX legados a partir de note ou template de recorrência.
 *
 * Uso:
 *   node --env-file=.env --env-file=.env.local scripts/backfill-finance-tx-description.mjs [--dry-run] [--apply] [--academy-id=xxx]
 *
 * Padrão: --dry-run (não grava). Use --apply para persistir.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases, Query } from 'node-appwrite';
import { resolveFinanceTxDescriptionBackfill } from '../lib/server/financeTxDescriptionBackfill.js';

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
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const academyFilter = args.find((a) => a.startsWith('--academy-id='))?.split('=')[1]?.trim() || '';

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function loadTemplatePlanName(databases, templateCache, templateId) {
  const id = String(templateId || '').trim();
  if (!id) return '';
  if (templateCache.has(id)) return templateCache.get(id);
  try {
    const doc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, id);
    const planName = String(doc?.planName || '').trim();
    templateCache.set(id, planName);
    return planName;
  } catch {
    templateCache.set(id, '');
    return '';
  }
}

async function migrateAcademy(databases, academyId) {
  const templateCache = new Map();
  const stats = {
    scanned: 0,
    skipped_has_planName: 0,
    updated_from_note: 0,
    updated_from_template: 0,
    unresolved: 0,
    errors: 0,
  };
  const unresolvedSamples = [];
  let cursor = null;

  for (let page = 0; page < 200; page += 1) {
    const q = [Query.equal('academyId', academyId), Query.limit(100), Query.orderDesc('$createdAt')];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    const docs = res.documents || [];

    for (const doc of docs) {
      stats.scanned += 1;
      const templateId = String(doc.recurrence_origin_id || '').trim();
      const templatePlanName = templateId
        ? await loadTemplatePlanName(databases, templateCache, templateId)
        : '';
      const decision = resolveFinanceTxDescriptionBackfill(doc, { templatePlanName });

      if (decision.action === 'skip') {
        stats.skipped_has_planName += 1;
        continue;
      }

      if (decision.action === 'unresolved') {
        stats.unresolved += 1;
        if (unresolvedSamples.length < 15) {
          unresolvedSamples.push({
            id: doc.$id,
            category: doc.category || '',
            type: doc.type || '',
            status: doc.status || '',
            reason: decision.reason,
            createdAt: doc.$createdAt,
          });
        }
        continue;
      }

      if (decision.source === 'note') stats.updated_from_note += 1;
      if (decision.source === 'template') stats.updated_from_template += 1;

      if (dryRun) {
        console.log(
          `[dry-run] ${doc.$id} ← ${decision.source}: ${JSON.stringify(decision.planName)}`
        );
        continue;
      }

      try {
        await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, doc.$id, {
          planName: decision.planName,
        });
      } catch (e) {
        stats.errors += 1;
        console.warn(`⚠️  ${doc.$id}: ${e?.message || e}`);
      }
    }

    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }

  return { ...stats, unresolvedSamples };
}

async function listAcademyIds(databases) {
  const academyIds = new Set();
  let cursor = null;
  for (let page = 0; page < 50; page += 1) {
    const q = [Query.limit(100), Query.orderDesc('$createdAt')];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    for (const doc of res.documents || []) {
      const aid = String(doc.academyId || '').trim();
      if (aid) academyIds.add(aid);
    }
    if ((res.documents || []).length < 100) break;
    cursor = res.documents[res.documents.length - 1]?.$id;
    if (!cursor) break;
  }
  return [...academyIds];
}

async function main() {
  if (!API_KEY) fail('Defina APPWRITE_API_KEY no .env');
  if (!DB_ID) fail('Defina VITE_APPWRITE_DATABASE_ID no .env');
  if (!FINANCIAL_TX_COL) fail('Defina FINANCIAL_TX_COL / VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID');

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  console.log(dryRun ? '\n🔍 Modo dry-run (use --apply para gravar)\n' : '\n✏️  Aplicando alterações…\n');

  const academyIds = academyFilter ? [academyFilter] : await listAcademyIds(databases);
  if (!academyIds.length) {
    console.log('Nenhuma academia com lançamentos encontrada.');
    return;
  }

  const total = {
    academies: academyIds.length,
    dryRun,
    scanned: 0,
    skipped_has_planName: 0,
    updated_from_note: 0,
    updated_from_template: 0,
    unresolved: 0,
    errors: 0,
  };

  for (const academyId of academyIds) {
    const out = await migrateAcademy(databases, academyId);
    total.scanned += out.scanned;
    total.skipped_has_planName += out.skipped_has_planName;
    total.updated_from_note += out.updated_from_note;
    total.updated_from_template += out.updated_from_template;
    total.unresolved += out.unresolved;
    total.errors += out.errors;
    console.log(JSON.stringify({ academyId, ...out, unresolvedSamples: undefined }));
    if (out.unresolvedSamples?.length) {
      console.log('  Amostra sem fonte:', JSON.stringify(out.unresolvedSamples, null, 2));
    }
  }

  const wouldUpdate = total.updated_from_note + total.updated_from_template;
  console.log('\n--- Resumo ---');
  console.log(JSON.stringify({ ...total, wouldUpdate }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

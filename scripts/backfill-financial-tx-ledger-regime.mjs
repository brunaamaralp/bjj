/**
 * Retroage ledger_regime em FINANCIAL_TX (CMV sale_cmv → accrual; resto → cash).
 *
 * Uso:
 *   node --env-file=.env --env-file=.env.local scripts/backfill-financial-tx-ledger-regime.mjs [--dry-run] [--apply] [--academy-id=xxx]
 *
 * Padrão: --dry-run (somente contagem).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases, Query } from 'node-appwrite';
import {
  FINANCE_LEDGER_REGIME,
  classifyLedgerRegimeForMigration,
  normalizeLedgerRegime,
} from '../src/lib/financeLedgerRegime.js';

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
      if (override || !(k in process.env)) process.env[k] = v;
    });
  } catch {
    void 0;
  }
}

applyEnvFile('.env', { override: false });
applyEnvFile('.env.local', { override: true });

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const academyFilter = args.find((a) => a.startsWith('--academy-id='))?.split('=')[1]?.trim() || '';

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function listAcademyIds(databases) {
  if (academyFilter) return [academyFilter];
  if (!ACADEMIES_COL) fail('Defina ACADEMIES_COL ou --academy-id=');
  const ids = [];
  let cursor = null;
  for (let i = 0; i < 50; i += 1) {
    const q = [Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, ACADEMIES_COL, q);
    const docs = res.documents || [];
    for (const d of docs) ids.push(d.$id);
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
  }
  return ids;
}

async function migrateAcademy(databases, academyId) {
  const stats = {
    scanned: 0,
    skipped_ok: 0,
    to_accrual: 0,
    to_cash: 0,
    errors: 0,
  };

  let cursor = null;
  for (let page = 0; page < 200; page += 1) {
    const q = [Query.equal('academyId', academyId), Query.limit(100), Query.orderDesc('$createdAt')];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    const docs = res.documents || [];
    if (!docs.length) break;

    for (const doc of docs) {
      stats.scanned += 1;
      const target = classifyLedgerRegimeForMigration(doc);
      const current = normalizeLedgerRegime(doc);
      if (current === target) {
        stats.skipped_ok += 1;
        continue;
      }

      if (target === FINANCE_LEDGER_REGIME.ACCRUAL) stats.to_accrual += 1;
      else stats.to_cash += 1;

      if (!dryRun) {
        try {
          await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, doc.$id, {
            ledger_regime: target,
          });
        } catch (e) {
          stats.errors += 1;
          console.warn('  erro', doc.$id, e?.message || e);
        }
      }
    }

    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
  }

  return stats;
}

async function main() {
  if (!ENDPOINT || !PROJECT || !API_KEY || !DB_ID || !FINANCIAL_TX_COL) {
    fail('Defina Appwrite env + FINANCIAL_TX_COL');
  }

  console.log(`\n=== Backfill ledger_regime (${dryRun ? 'DRY-RUN' : 'APPLY'}) ===\n`);

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
  const databases = new Databases(client);
  const academyIds = await listAcademyIds(databases);

  const totals = {
    academies: academyIds.length,
    scanned: 0,
    skipped_ok: 0,
    to_accrual: 0,
    to_cash: 0,
    errors: 0,
  };

  for (const academyId of academyIds) {
    const s = await migrateAcademy(databases, academyId);
    totals.scanned += s.scanned;
    totals.skipped_ok += s.skipped_ok;
    totals.to_accrual += s.to_accrual;
    totals.to_cash += s.to_cash;
    totals.errors += s.errors;
    if (s.to_accrual || s.to_cash) {
      console.log(
        `Academia ${academyId}: scanned=${s.scanned} accrual=${s.to_accrual} cash=${s.to_cash} já_ok=${s.skipped_ok}`
      );
    }
  }

  console.log('\n--- Resumo ---');
  console.log(`Academias: ${totals.academies}`);
  console.log(`Lançamentos lidos: ${totals.scanned}`);
  console.log(`Já corretos: ${totals.skipped_ok}`);
  console.log(`Seriam/ foram accrual: ${totals.to_accrual}`);
  console.log(`Seriam/ foram cash: ${totals.to_cash}`);
  console.log(`Erros: ${totals.errors}`);
  if (dryRun && (totals.to_accrual || totals.to_cash)) {
    console.log('\nRode com --apply para persistir.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

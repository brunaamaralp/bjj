/**
 * Unifica rótulos de conta bancária em pagamentos e lançamentos do Caixa.
 *
 * Uso (dry-run):
 *   npm run unify:bank-labels -- --academy=ACADEMY_ID --target=Sicoob
 *
 * Aplicar:
 *   npm run unify:bank-labels -- --academy=ACADEMY_ID --target=Sicoob --fix
 *
 * Se --target omitido, usa a primeira conta cadastrada na academia (financeConfig mesclado).
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
const targetArg = args.find((a) => a.startsWith('--target='));

const ACADEMY_ID =
  (academyArg ? academyArg.split('=').slice(1).join('=') : '') ||
  String(process.env.UNIFY_BANK_ACADEMY_ID || '').trim();

const TARGET_OVERRIDE = targetArg ? targetArg.split('=').slice(1).join('=').trim() : '';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const STUDENT_PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.STUDENT_PAYMENTS_COL ||
  '';

const { mergeFinanceConfigFromAcademyDoc } = await import(
  pathToFileURL(path.resolve(__dirname, '../src/lib/financeConfigStorage.js')).href
);
const { formatBankAccountLabel } = await import(
  pathToFileURL(path.resolve(__dirname, '../src/lib/bankAccounts.js')).href
);

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

function norm(s) {
  return String(s || '').trim();
}

function shouldReplace(current, target) {
  const c = norm(current);
  if (!c) return false;
  if (c === target) return false;
  return true;
}

function patchFinancialTxNote(note, target) {
  const raw = String(note || '');
  if (!/^@bank:/m.test(raw)) return null;
  const next = raw.replace(/^@bank:[^\n]+/m, `@bank:${target}`);
  return next === raw ? null : next;
}

async function paginate(databases, colId, queries, maxPages = 100) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < maxPages; i += 1) {
    const q = [...queries, Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, colId, q);
    const batch = res.documents || [];
    out.push(...batch);
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1]?.$id;
    if (!cursor) break;
  }
  return out;
}

async function resolveTargetLabel(databases, academyId) {
  if (TARGET_OVERRIDE) return TARGET_OVERRIDE;
  const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
  const cfg = mergeFinanceConfigFromAcademyDoc(doc);
  const banks = cfg.bankAccounts || [];
  if (!banks.length) fail('Academia sem contas cadastradas. Passe --target=Sicoob ou cadastre a conta.');
  return formatBankAccountLabel(banks[0]) || norm(banks[0].bankName);
}

async function main() {
  if (!API_KEY || !DB_ID || !ACADEMIES_COL) fail('Configure APPWRITE_API_KEY, DB e ACADEMIES_COL no .env');
  if (!ACADEMY_ID) fail('Informe --academy=ID ou UNIFY_BANK_ACADEMY_ID');
  if (!STUDENT_PAYMENTS_COL && !FINANCIAL_TX_COL) {
    fail('Configure STUDENT_PAYMENTS_COL e/ou FINANCIAL_TX_COL');
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  const target = await resolveTargetLabel(databases, ACADEMY_ID);
  const report = {
    academyId: ACADEMY_ID,
    target,
    fix: FIX,
    payments: { scanned: 0, updated: 0, samples: [] },
    financialTx: { scanned: 0, updated: 0, samples: [] },
  };

  if (STUDENT_PAYMENTS_COL) {
    const payments = await paginate(databases, STUDENT_PAYMENTS_COL, [
      Query.equal('academy_id', ACADEMY_ID),
    ]);
    report.payments.scanned = payments.length;

    for (const doc of payments) {
      const current = norm(doc.account);
      if (!shouldReplace(current, target)) continue;

      report.payments.updated += 1;
      if (report.payments.samples.length < 8) {
        report.payments.samples.push({ id: doc.$id, from: current, to: target });
      }

      if (FIX) {
        await databases.updateDocument(DB_ID, STUDENT_PAYMENTS_COL, doc.$id, { account: target });
      }
    }
  }

  if (FINANCIAL_TX_COL) {
    const txs = await paginate(databases, FINANCIAL_TX_COL, [Query.equal('academyId', ACADEMY_ID)]);
    report.financialTx.scanned = txs.length;

    for (const doc of txs) {
      const current = norm(doc.bank_account || doc.bankAccount);
      const notePatch = patchFinancialTxNote(doc.note, target);
      const needsAccount = shouldReplace(current, target);
      if (!needsAccount && !notePatch) continue;

      report.financialTx.updated += 1;
      if (report.financialTx.samples.length < 8) {
        report.financialTx.samples.push({
          id: doc.$id,
          from: current || '(note)',
          to: target,
        });
      }

      if (FIX) {
        const payload = {};
        if (needsAccount) payload.bank_account = target;
        if (notePatch) payload.note = notePatch;
        await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, doc.$id, payload);
      }
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(FIX ? 'Unificando rótulos de conta (--fix)\n' : 'Dry-run: unificação de rótulos\n');
  console.log(`Academia: ${ACADEMY_ID}`);
  console.log(`Conta alvo: "${target}"\n`);

  console.log(
    `Pagamentos: ${report.payments.scanned} lidos, ${report.payments.updated} ${FIX ? 'atualizados' : 'a atualizar'}`
  );
  for (const s of report.payments.samples) {
    console.log(`  · ${s.id}: "${s.from}" → "${s.to}"`);
  }

  console.log(
    `\nCaixa (FINANCIAL_TX): ${report.financialTx.scanned} lidos, ${report.financialTx.updated} ${FIX ? 'atualizados' : 'a atualizar'}`
  );
  for (const s of report.financialTx.samples) {
    console.log(`  · ${s.id}: "${s.from}" → "${s.to}"`);
  }

  if (!FIX && (report.payments.updated > 0 || report.financialTx.updated > 0)) {
    console.log('\nPara aplicar:');
    console.log(`  npm run unify:bank-labels -- --academy=${ACADEMY_ID} --target=${target} --fix`);
  } else if (report.payments.updated === 0 && report.financialTx.updated === 0) {
    console.log('\nNada a alterar — todos os lançamentos já usam a conta alvo.');
  } else {
    console.log('\n✅ Concluído.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

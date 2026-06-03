/**
 * Audita e (opcionalmente) recupera contas bancárias offloaded em academies.
 *
 * Fontes verificadas por academia:
 *   - financeConfig.bankAccounts
 *   - settings.financeBankAccounts / settings.bankAccounts
 *   - onboardingChecklist.fba
 *   - atributo raiz financeBankAccounts (legado)
 *
 * Lançamentos (FINANCIAL_TX / pagamentos) NÃO são alterados — só leitura de rótulos em uso.
 *
 * Uso:
 *   npm run recover:bank-accounts
 *   npm run recover:bank-accounts -- --academy=ACADEMY_ID
 *   npm run recover:bank-accounts -- --fix
 *   npm run recover:bank-accounts -- --academy=ACADEMY_ID --fix
 *   npm run recover:bank-accounts -- --json
 *
 * Requer: APPWRITE_API_KEY, VITE_APPWRITE_DATABASE_ID, VITE_APPWRITE_ACADEMIES_COLLECTION_ID
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
const ACADEMY_FILTER =
  (academyArg ? academyArg.split('=').slice(1).join('=') : '') ||
  String(process.env.RECOVER_BANK_ACCOUNTS_ACADEMY_ID || '').trim();

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
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
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

const {
  auditBankAccountsFromAcademyDoc,
  mergeFinanceConfigFromAcademyDoc,
  buildAcademyFinanceConfigUpdate,
  academyDocSupportsSettings,
} = await import(pathToFileURL(path.resolve(__dirname, '../src/lib/financeConfigStorage.js')).href);

const { formatBankAccountLabel } = await import(
  pathToFileURL(path.resolve(__dirname, '../src/lib/bankAccounts.js')).href
);

const { readCollectionSettingsFromAcademy, mergeCollectionIntoFinanceConfig } = await import(
  pathToFileURL(path.resolve(__dirname, '../src/lib/collectionRules.js')).href
);

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

function labelList(accounts) {
  return (accounts || []).map((acc) => formatBankAccountLabel(acc)).filter(Boolean);
}

function academyDisplayName(doc) {
  return String(doc?.name || doc?.academyName || doc?.$id || '').trim() || doc?.$id;
}

async function listAllAcademies(databases) {
  const out = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const queries = [Query.limit(limit), Query.offset(offset), Query.orderAsc('$id')];
    if (ACADEMY_FILTER) queries.push(Query.equal('$id', ACADEMY_FILTER));
    const res = await databases.listDocuments(DB_ID, ACADEMIES_COL, queries);
    const batch = res.documents || [];
    out.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
    if (ACADEMY_FILTER) break;
  }
  return out;
}

async function collectTxBankLabels(databases, academyId) {
  const labels = new Set();
  if (!FINANCIAL_TX_COL) return labels;

  let cursor = null;
  for (let page = 0; page < 50; page += 1) {
    const queries = [Query.equal('academyId', academyId), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, queries);
    } catch {
      break;
    }
    const docs = res.documents || [];
    for (const doc of docs) {
      const direct = String(doc.bank_account || doc.bankAccount || '').trim();
      if (direct) labels.add(direct);
      const note = String(doc.note || '');
      const match = note.match(/^@bank:([^\n]+)/m);
      if (match) labels.add(String(match[1] || '').trim());
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return labels;
}

async function collectPaymentBankLabels(databases, academyId) {
  const labels = new Set();
  if (!STUDENT_PAYMENTS_COL) return labels;

  let cursor = null;
  for (let page = 0; page < 50; page += 1) {
    const queries = [Query.equal('academy_id', academyId), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, STUDENT_PAYMENTS_COL, queries);
    } catch {
      break;
    }
    const docs = res.documents || [];
    for (const doc of docs) {
      const direct = String(doc.account || '').trim();
      if (direct) labels.add(direct);
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return labels;
}

function orphanLabels(mergedLabels, usedLabels) {
  const registered = new Set(mergedLabels);
  return [...usedLabels].filter((lbl) => lbl && !registered.has(lbl)).sort();
}

async function auditAcademy(databases, doc) {
  const audit = auditBankAccountsFromAcademyDoc(doc);
  const mergedLabels = labelList(audit.merged);
  const txLabels = await collectTxBankLabels(databases, doc.$id);
  const payLabels = await collectPaymentBankLabels(databases, doc.$id);
  const usedLabels = new Set([...txLabels, ...payLabels]);
  const orphans = orphanLabels(mergedLabels, usedLabels);

  return {
    academyId: doc.$id,
    name: academyDisplayName(doc),
    audit,
    mergedLabels,
    txLabelCount: txLabels.size,
    paymentLabelCount: payLabels.size,
    orphanLabels: orphans,
  };
}

async function fixAcademy(databases, doc) {
  const cfg = mergeFinanceConfigFromAcademyDoc(doc);
  const coll = readCollectionSettingsFromAcademy(doc);
  const mergedCfg = mergeCollectionIntoFinanceConfig(cfg, coll);

  const freshDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, doc.$id);
  const built = buildAcademyFinanceConfigUpdate(freshDoc, mergedCfg, {
    hasSettingsAttribute: academyDocSupportsSettings(freshDoc),
  });
  const payload = { financeConfig: built.financeConfig };
  if (built.settings !== undefined) payload.settings = built.settings;
  if (built.onboardingChecklist !== undefined) payload.onboardingChecklist = built.onboardingChecklist;

  await databases.updateDocument(DB_ID, ACADEMIES_COL, doc.$id, payload);

  const savedDoc = {
    ...freshDoc,
    financeConfig: built.financeConfig,
    settings: built.settings ?? freshDoc.settings,
    onboardingChecklist: built.onboardingChecklist ?? freshDoc.onboardingChecklist,
  };
  return labelList(mergeFinanceConfigFromAcademyDoc(savedDoc).bankAccounts);
}

async function main() {
  if (!API_KEY) fail('Defina APPWRITE_API_KEY no .env');
  if (!DB_ID) fail('Defina VITE_APPWRITE_DATABASE_ID no .env');
  if (!ACADEMIES_COL) fail('Defina VITE_APPWRITE_ACADEMIES_COLLECTION_ID no .env');

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  const academies = await listAllAcademies(databases);
  if (!academies.length) {
    console.log(ACADEMY_FILTER ? `Nenhuma academia com id ${ACADEMY_FILTER}.` : 'Nenhuma academia encontrada.');
    return;
  }

  const reports = [];
  let needsRecoveryCount = 0;
  let fixedCount = 0;

  for (const doc of academies) {
    const report = await auditAcademy(databases, doc);
    reports.push(report);
    if (report.audit.needsRecovery) needsRecoveryCount += 1;

    if (FIX && report.audit.needsRecovery) {
      const after = await fixAcademy(databases, doc);
      report.fixed = true;
      report.mergedLabelsAfterFix = after;
      fixedCount += 1;
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ fix: FIX, reports }, null, 2));
    return;
  }

  console.log(FIX ? 'Recuperação de contas bancárias (--fix)\n' : 'Auditoria de contas bancárias (dry-run)\n');
  if (!FIX) {
    console.log('Nenhum dado será alterado. Use --fix para gravar o merge no Appwrite.\n');
  }

  for (const r of reports) {
    const { sources, merged, needsRecovery } = r.audit;
    console.log(`— ${r.name} (${r.academyId})`);
    console.log(`  financeConfig: ${sources.financeConfig.length} | settings: ${sources.settings.length} | onboarding: ${sources.onboarding.length} | rootAttr: ${sources.rootAttribute.length}`);
    console.log(`  mesclado: ${merged.length} → ${r.mergedLabels.join(', ') || '(vazio)'}`);
    console.log(`  lançamentos com conta: ${r.txLabelCount} rótulos (Caixa) | pagamentos: ${r.paymentLabelCount} rótulos`);
    if (r.orphanLabels.length) {
      console.log(`  ⚠ rótulos em lançamentos sem conta cadastrada: ${r.orphanLabels.join(', ')}`);
    }
    if (needsRecovery) {
      console.log(`  → precisa recuperação${r.fixed ? ' (corrigido agora)' : ''}`);
      if (r.mergedLabelsAfterFix) {
        console.log(`  → após fix: ${r.mergedLabelsAfterFix.join(', ')}`);
      }
    } else {
      console.log('  → ok');
    }
    console.log('');
  }

  console.log(
    `Resumo: ${reports.length} academia(s), ${needsRecoveryCount} com contas só no overflow/legado, ${fixedCount} corrigida(s).`
  );
  if (needsRecoveryCount > 0 && !FIX) {
    console.log('\nPara gravar o merge: npm run recover:bank-accounts -- --fix');
    if (ACADEMY_FILTER) {
      console.log(`Ou só esta academia: npm run recover:bank-accounts -- --academy=${ACADEMY_FILTER} --fix`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

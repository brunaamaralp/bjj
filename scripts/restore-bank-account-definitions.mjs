/**
 * Recria contas bancárias no cadastro (financeConfig/settings) a partir de rótulos históricos.
 * Útil quando as contas existiam só como texto nos pagamentos e nunca foram gravadas em bankAccounts.
 *
 * Uso:
 *   npm run restore:bank-definitions -- --academy=ID --labels="Sicoob,Asaas,Pagbank"
 *   npm run restore:bank-definitions -- --academy=ID --labels="..." --fix
 *
 * GBLP (rótulos usados antes da unificação):
 *   npm run restore:bank-definitions -- --academy=699f21b70006985daa90 --labels="Sicoob,Asaas,Banco do Brasil,Caixinha,Pagbank" --fix
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Client, Databases } from 'node-appwrite';

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
const labelsArg = args.find((a) => a.startsWith('--labels='));

const ACADEMY_ID =
  (academyArg ? academyArg.split('=').slice(1).join('=') : '') ||
  String(process.env.RESTORE_BANK_ACADEMY_ID || '').trim();

const LABELS_RAW = labelsArg ? labelsArg.split('=').slice(1).join('=') : '';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const {
  mergeFinanceConfigFromAcademyDoc,
  buildAcademyFinanceConfigUpdate,
  academyDocSupportsSettings,
} = await import(pathToFileURL(path.resolve(__dirname, '../src/lib/financeConfigStorage.js')).href);

const { formatBankAccountLabel, normalizeBankAccountEntry } = await import(
  pathToFileURL(path.resolve(__dirname, '../src/lib/bankAccounts.js')).href
);

const { readCollectionSettingsFromAcademy, mergeCollectionIntoFinanceConfig } = await import(
  pathToFileURL(path.resolve(__dirname, '../src/lib/collectionRules.js')).href
);

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

function parseLabels(raw) {
  return [...new Set(String(raw || '').split(/[,;|]/).map((s) => s.trim()).filter(Boolean))];
}

function accountKey(acc) {
  return formatBankAccountLabel(acc).toLowerCase();
}

function buildEntryFromLabel(label) {
  return normalizeBankAccountEntry({
    bankName: String(label || '').trim(),
    branch: '',
    account: '',
    accountName: '',
    pixKey: '',
    openingBalance: 0,
    openingBalanceDate: '',
  });
}

async function main() {
  if (!API_KEY || !DB_ID || !ACADEMIES_COL) fail('Configure Appwrite no .env');
  if (!ACADEMY_ID) fail('Informe --academy=ID');
  const labels = parseLabels(LABELS_RAW);
  if (!labels.length) fail('Informe --labels="Sicoob,Asaas,..."');

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, ACADEMY_ID);
  const cfg = mergeFinanceConfigFromAcademyDoc(doc);
  const coll = readCollectionSettingsFromAcademy(doc);
  const existing = (cfg.bankAccounts || []).map(normalizeBankAccountEntry);
  const seen = new Set(existing.map(accountKey));

  const toAdd = [];
  for (const label of labels) {
    const entry = buildEntryFromLabel(label);
    const key = accountKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    toAdd.push(entry);
  }

  const nextAccounts = [...existing, ...toAdd];
  const mergedCfg = mergeCollectionIntoFinanceConfig({ ...cfg, bankAccounts: nextAccounts }, coll);

  console.log(FIX ? 'Restaurando definições de contas (--fix)\n' : 'Dry-run: restaurar contas no cadastro\n');
  console.log(`Academia: ${ACADEMY_ID} (${doc.name || ''})`);
  console.log(`Já cadastradas: ${existing.map(formatBankAccountLabel).join(', ') || '(nenhuma)'}`);
  console.log(`A adicionar: ${toAdd.map(formatBankAccountLabel).join(', ') || '(nenhuma)'}`);
  console.log(`Total após merge: ${nextAccounts.map(formatBankAccountLabel).join(', ')}`);

  if (!toAdd.length) {
    console.log('\nNada a adicionar.');
    return;
  }

  if (!FIX) {
    console.log('\nPara gravar:');
    console.log(
      `  npm run restore:bank-definitions -- --academy=${ACADEMY_ID} --labels="${labels.join(',')}" --fix`
    );
    return;
  }

  const freshDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, ACADEMY_ID);
  const built = buildAcademyFinanceConfigUpdate(freshDoc, mergedCfg, {
    hasSettingsAttribute: academyDocSupportsSettings(freshDoc),
  });
  const payload = { financeConfig: built.financeConfig };
  if (built.settings !== undefined) payload.settings = built.settings;
  if (built.onboardingChecklist !== undefined) payload.onboardingChecklist = built.onboardingChecklist;

  await databases.updateDocument(DB_ID, ACADEMIES_COL, ACADEMY_ID, payload);

  const savedDoc = {
    ...freshDoc,
    financeConfig: built.financeConfig,
    settings: built.settings ?? freshDoc.settings,
    onboardingChecklist: built.onboardingChecklist ?? freshDoc.onboardingChecklist,
  };
  const saved = mergeFinanceConfigFromAcademyDoc(savedDoc);
  console.log('\n✅ Gravado. Contas visíveis após merge:');
  console.log(`   ${(saved.bankAccounts || []).map(formatBankAccountLabel).join(', ')}`);
  if (built.bankAccountsOffloaded) {
    console.log('   (contas offloaded em settings/onboarding — o app mescla automaticamente)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Destrava / (re)cria o atributo students.plan_price no Appwrite.
 *
 * O atributo às vezes fica preso em status=processing e bloqueia o backfill
 * (`Unknown attribute: "plan_price"`).
 *
 * Uso:
 *   node --env-file=.env --env-file=.env.local scripts/fix-student-plan-price-attr.mjs
 *   node --env-file=.env --env-file=.env.local scripts/fix-student-plan-price-attr.mjs --force
 *   node --env-file=.env --env-file=.env.local scripts/fix-student-plan-price-attr.mjs --force --backfill
 *   node --env-file=.env --env-file=.env.local scripts/fix-student-plan-price-attr.mjs --force --backfill --apply
 *
 * Flags:
 *   --force     Se estiver processing/failed (ou disponível), deleta e recria
 *   --backfill  Após available, roda backfill-student-plan-price.mjs (dry-run)
 *   --apply     Com --backfill: grava o backfill
 *   --academy-id=xxx  Repassado ao backfill
 *
 * Importante: cria float OPCIONAL sem default (null). Default 0 faria todo aluno
 * sem snapshot parecer plan_price=0 e zerar cobrança.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
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

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

const ATTR_KEY = 'plan_price';
const POLL_MS = 10_000;
const DELETE_WAIT_ATTEMPTS = 60; // ~10 min
const CREATE_WAIT_ATTEMPTS = 90; // ~15 min

const args = process.argv.slice(2);
const force = args.includes('--force');
const runBackfill = args.includes('--backfill');
const applyBackfill = args.includes('--apply');
const academyArg = args.find((a) => a.startsWith('--academy-id=')) || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function getAttr(databases) {
  try {
    return await databases.getAttribute(DB_ID, STUDENTS_COL, ATTR_KEY);
  } catch (e) {
    if (e?.type === 'attribute_not_found' || e?.code === 404) return null;
    throw e;
  }
}

function printAttr(attr, label = 'status') {
  if (!attr) {
    console.log(`${label}: (ausente)`);
    return;
  }
  console.log(
    `${label}: key=${attr.key} type=${attr.type} status=${attr.status}` +
      (attr.error ? ` error=${attr.error}` : '') +
      (attr.default != null ? ` default=${attr.default}` : ' default=null')
  );
}

async function waitUntilGone(databases) {
  for (let i = 0; i < DELETE_WAIT_ATTEMPTS; i += 1) {
    const attr = await getAttr(databases);
    if (!attr) {
      console.log('✅ Atributo removido.');
      return;
    }
    console.log(
      `[${i + 1}/${DELETE_WAIT_ATTEMPTS}] ainda presente (${attr.status}) — aguardando delete…`
    );
    await sleep(POLL_MS);
  }
  fail(
    `Timeout: ${ATTR_KEY} ainda existe após delete. ` +
      `Abra o console Appwrite → students → Attributes e remova manualmente, depois rode de novo.`
  );
}

async function waitUntilAvailable(databases) {
  for (let i = 0; i < CREATE_WAIT_ATTEMPTS; i += 1) {
    const attr = await getAttr(databases);
    if (!attr) {
      console.log(`[${i + 1}/${CREATE_WAIT_ATTEMPTS}] ainda não listado — aguardando…`);
      await sleep(POLL_MS);
      continue;
    }
    printAttr(attr, `[${i + 1}/${CREATE_WAIT_ATTEMPTS}]`);
    if (attr.status === 'available') return attr;
    if (attr.status === 'failed') {
      fail(`Criação falhou: ${attr.error || 'sem detalhe'}. Tente --force de novo ou console Appwrite.`);
    }
    await sleep(POLL_MS);
  }
  fail(
    `Timeout: ${ATTR_KEY} não ficou available. ` +
      `Verifique no console Appwrite; se stuck em processing, rode com --force.`
  );
}

async function deleteAttr(databases) {
  console.log(`🗑️  Deletando ${ATTR_KEY}…`);
  try {
    await databases.deleteAttribute(DB_ID, STUDENTS_COL, ATTR_KEY);
  } catch (e) {
    if (e?.type === 'attribute_not_found' || e?.code === 404) {
      console.log('Já ausente.');
      return;
    }
    throw e;
  }
  await waitUntilGone(databases);
}

async function createAttr(databases) {
  console.log(`✨ Criando ${ATTR_KEY} (float, opcional, sem default)…`);
  try {
    await databases.createFloatAttribute({
      databaseId: DB_ID,
      collectionId: STUDENTS_COL,
      key: ATTR_KEY,
      required: false,
      // sem xdefault — evita plan_price=0 implícito em todos os docs
    });
  } catch (e) {
    if (e?.type === 'attribute_already_exists' || e?.code === 409) {
      console.log('Create retornou already_exists — aguardando available…');
    } else {
      throw e;
    }
  }
  return waitUntilAvailable(databases);
}

function runBackfillScript() {
  return new Promise((resolve, reject) => {
    const script = path.resolve(__dirname, 'backfill-student-plan-price.mjs');
    const childArgs = [script];
    if (applyBackfill) childArgs.push('--apply');
    if (academyArg) childArgs.push(academyArg);
    console.log(`\n▶️  Backfill: node ${childArgs.join(' ')}`);
    const child = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`backfill exit ${code}`));
    });
  });
}

async function main() {
  if (!API_KEY || !PROJECT_ID || !DB_ID || !STUDENTS_COL) {
    fail(
      'Env incompleto. Precisa APPWRITE_API_KEY, PROJECT, VITE_APPWRITE_DATABASE_ID, VITE_APPWRITE_STUDENTS_COLLECTION_ID.'
    );
  }

  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Project:  ${PROJECT_ID}`);
  console.log(`DB:       ${DB_ID}`);
  console.log(`Students: ${STUDENTS_COL}`);
  console.log(`force=${force} backfill=${runBackfill} apply=${applyBackfill}\n`);

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  let attr = await getAttr(databases);
  printAttr(attr, 'atual');

  if (!attr) {
    console.log('\nAtributo ausente — criando…');
    attr = await createAttr(databases);
  } else if (attr.status === 'available' && !force) {
    console.log('\n✅ Já available. Use --force para deletar/recriar.');
  } else if (attr.status === 'available' && force) {
    console.log('\n--force: recriando atributo available…');
    await deleteAttr(databases);
    attr = await createAttr(databases);
  } else if (attr.status === 'processing' || attr.status === 'failed' || force) {
    console.log(`\nAtributo em ${attr.status} — delete + recreate…`);
    await deleteAttr(databases);
    attr = await createAttr(databases);
  } else {
    fail(`Status inesperado: ${attr.status}`);
  }

  attr = await getAttr(databases);
  printAttr(attr, 'final');
  if (attr?.status !== 'available') {
    fail('Atributo não está available ao final.');
  }

  // Smoke write/read on a throwaway update is too risky; just confirm attribute metadata.
  if (attr.default != null && Number(attr.default) === 0) {
    console.warn(
      '\n⚠️  Atributo tem default=0. Docs sem snapshot podem ser lidos como 0 e zerar cobrança. ' +
        'Prefira recriar sem default (--force se necessário após ajuste do script).'
    );
  }

  console.log('\n✅ plan_price pronto para uso.');

  if (runBackfill) {
    await runBackfillScript();
    console.log(
      '\nNota: se muitos skipped_plan_not_in_catalog, o financeConfig.plans da academia está vazio — ' +
        'restaure os planos em Minha academia → Financeiro → Planos antes de reaplicar o backfill.'
    );
  } else {
    console.log(
      '\nPróximo:\n' +
        '  node --env-file=.env --env-file=.env.local scripts/backfill-student-plan-price.mjs\n' +
        '  node --env-file=.env --env-file=.env.local scripts/backfill-student-plan-price.mjs --apply --academy-id=ID'
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

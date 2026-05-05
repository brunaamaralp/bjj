/**
 * Migração one-off: `type === "Kids"` (ou "kids") → `"Criança"` em LEADS_COL.
 *
 * Uso:
 *   node scripts/migrateLeadTypeKidsToCrianca.js
 *   npm run migrate:kids-to-crianca
 *
 * Opcional:
 *   DRY_RUN=1 — apenas lista, não grava
 *   MIGRATE_LEADS_ACADEMY_ID=<id> — limita à academia
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
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMY_FILTER = String(process.env.MIGRATE_LEADS_ACADEMY_ID || '').trim();
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').trim().toLowerCase());
const PAGE_SIZE = 100;
const TARGET_TYPES = ['Kids', 'kids'];

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function migrateTypeValue(databases, fromType) {
  let updated = 0;
  let scanned = 0;
  let errors = 0;
  let lastId = '';

  for (;;) {
    const queries = [
      Query.equal('type', fromType),
      Query.orderAsc('$id'),
      Query.limit(PAGE_SIZE),
    ];
    if (ACADEMY_FILTER) queries.push(Query.equal('academyId', ACADEMY_FILTER));
    if (lastId) queries.push(Query.cursorAfter(lastId));

    const page = await databases.listDocuments(DB_ID, LEADS_COL, queries);
    const docs = Array.isArray(page?.documents) ? page.documents : [];
    if (docs.length === 0) break;

    for (const doc of docs) {
      scanned += 1;
      const id = doc.$id;
      if (DRY_RUN) {
        console.log(`[DRY_RUN] ${id} (${fromType} → Criança) academyId=${doc.academyId || ''}`);
        updated += 1;
        continue;
      }
      try {
        await databases.updateDocument(DB_ID, LEADS_COL, id, { type: 'Criança' });
        updated += 1;
        console.log(`[ok] ${id} type: ${fromType} → Criança`);
      } catch (e) {
        errors += 1;
        console.error(`❌ ${id}: ${e?.message || e}`);
      }
    }

    lastId = String(docs[docs.length - 1]?.$id || '').trim();
    if (docs.length < PAGE_SIZE) break;
  }

  return { scanned, updated, errors };
}

async function main() {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL) {
    fail(
      'Defina APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID e APPWRITE_LEADS_COLLECTION_ID no .env'
    );
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  console.log('\n🔎 Migração type Kids → Criança\n');
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Database: ${DB_ID}`);
  console.log(`Collection: ${LEADS_COL}`);
  if (ACADEMY_FILTER) console.log(`Academia (filtro): ${ACADEMY_FILTER}`);
  console.log(DRY_RUN ? 'Modo: DRY_RUN (sem gravação)\n' : 'Modo: gravação ativa\n');

  let totalScanned = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const fromType of TARGET_TYPES) {
    const { scanned, updated, errors } = await migrateTypeValue(databases, fromType);
    totalScanned += scanned;
    totalUpdated += updated;
    totalErrors += errors;
    if (scanned > 0) {
      console.log(`\n— Valor "${fromType}": encontrados ${scanned}, ${DRY_RUN ? 'simulados' : 'atualizados'} ${updated}, erros ${errors}`);
    }
  }

  console.log('\n📦 Resumo');
  console.log(`- Documentos com Kids/kids processados: ${totalScanned}`);
  console.log(`- ${DRY_RUN ? 'Simulações' : 'Atualizações'}: ${totalUpdated}`);
  console.log(`- Erros: ${totalErrors}`);

  if (totalErrors > 0) fail('Migração terminou com erros.');
  if (totalScanned === 0) console.log('\nNenhum documento com type Kids/kids — nada a fazer.\n');
  else console.log('\n✅ Concluído.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

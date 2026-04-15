/**
 * Corrige leads com pipeline_stage e status divergentes (alinhado a STAGE_TO_STATUS em src/lib/leadStageRules.js).
 *
 * Uso (após conferir contagens no Appwrite Console):
 *   npm run migrate:lead-stage-sync
 *   node scripts/fix-lead-stage-sync.js
 *
 * Requer: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY,
 * VITE_APPWRITE_DATABASE_ID (ou APPWRITE_DATABASE_ID),
 * VITE_APPWRITE_LEADS_COLLECTION_ID (ou APPWRITE_LEADS_COLLECTION_ID).
 *
 * Opcional:
 *   MIGRATE_LEADS_ACADEMY_ID — limita à academia indicada.
 *   DRY_RUN=1 — só lista o que seria atualizado, sem gravar no Appwrite.
 *
 * Variáveis são lidas de `.env` e depois `.env.local` (este sobrescreve).
 * Após rodar, você pode remover este arquivo.
 */

import { Client, Databases, Query } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || process.env.DB_ID || '';
const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMY_FILTER = String(process.env.MIGRATE_LEADS_ACADEMY_ID || '').trim();
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').trim().toLowerCase());

const { STAGE_TO_STATUS } = await import(path.resolve(__dirname, '../src/lib/leadStageRules.js'));

async function main() {
  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL) {
    console.error('Faltam variáveis de ambiente (endpoint, projeto, API key, DB, coleção de leads).');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('[DRY_RUN=1] Nenhum documento será alterado; apenas log do que seria corrigido.\n');
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  let fixed = 0;
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const queries = [Query.limit(pageSize), Query.offset(offset), Query.orderAsc('$id')];
    if (ACADEMY_FILTER) {
      queries.push(Query.equal('academyId', ACADEMY_FILTER));
    }

    const { documents } = await databases.listDocuments(DB_ID, LEADS_COL, queries);
    if (!documents.length) break;

    for (const doc of documents) {
      const stage = String(doc.pipeline_stage || '').trim();
      if (!stage) continue;
      const expectedStatus = STAGE_TO_STATUS[stage];
      if (!expectedStatus || doc.status === expectedStatus) continue;

      if (!DRY_RUN) {
        await databases.updateDocument(DB_ID, LEADS_COL, doc.$id, { status: expectedStatus });
      }
      console.log(
        `${DRY_RUN ? 'Would fix' : 'Fixed'}: ${doc.$id} | stage: ${stage} | status: ${doc.status} → ${expectedStatus}`
      );
      fixed++;
    }

    offset += documents.length;
    if (documents.length < pageSize) break;
  }

  console.log(`${DRY_RUN ? 'Total que seriam corrigidos' : 'Total corrigidos'}: ${fixed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

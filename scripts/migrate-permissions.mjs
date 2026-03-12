/**
 * Migração de permissões — liberar para qualquer usuário autenticado
 *
 * Uso:
 *   APPWRITE_API_KEY=xxxx node scripts/migrate-permissions.mjs
 *
 * Lê .env do projeto para obter ENDPOINT, PROJECT, DB_ID e IDs de coleções.
 * Atualiza permissões de todos os documentos em "academies" e "leads" para:
 *   read/update/delete: Role.users()
 */
import { Client, Databases, Permission, Role, Query } from 'node-appwrite';
import fs from 'fs';
import path from 'path';

// Carrega .env local (sem sobrescrever variáveis já definidas)
try {
  const p = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, 'utf-8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) {
        const k = m[1];
        let v = m[2];
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
        if (!(k in process.env)) process.env[k] = v;
      }
    });
  }
} catch {}

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || 'academies';

if (!API_KEY) {
  console.error('❌ Defina APPWRITE_API_KEY para executar a migração.');
  process.exit(1);
}
if (!PROJECT_ID || !DB_ID || !LEADS_COL || !ACADEMIES_COL) {
  console.error('❌ Verifique .env — faltam PROJECT/DB_ID/LEADS_COL/ACADEMIES_COL.');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

const NEW_PERMS = [
  Permission.read(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
];

async function migrateCollection(colId, label) {
  console.log(`\n🔄 Migrando permissões em "${label}" (${colId})...`);
  let total = 0;
  let lastId = null;
  // Paginação por cursor
  while (true) {
    const queries = [Query.limit(100), Query.orderAsc('$id')];
    if (lastId) queries.push(Query.cursorAfter(lastId));
    const res = await databases.listDocuments(DB_ID, colId, queries);
    if (!res.documents || res.documents.length === 0) break;
    for (const doc of res.documents) {
      try {
        await databases.updateDocument(DB_ID, colId, doc.$id, {}, NEW_PERMS);
        total++;
        if (total % 25 === 0) process.stdout.write('.');
      } catch (e) {
        console.warn(`   ⚠️  Falha ao atualizar ${label}/${doc.$id}: ${e.message}`);
      }
    }
    lastId = res.documents[res.documents.length - 1].$id;
    if (res.documents.length < 100) break;
  }
  console.log(`\n✅ ${label}: ${total} documentos atualizados.`);
}

async function main() {
  console.log('🔐 Migração de permissões → Role.users() (read/update/delete)');
  console.log(`   Endpoint: ${ENDPOINT}`);
  console.log(`   Project:  ${PROJECT_ID}`);
  console.log(`   DB:       ${DB_ID}`);
  console.log(`   Leads:    ${LEADS_COL}`);
  console.log(`   Academies:${ACADEMIES_COL}`);

  await migrateCollection(ACADEMIES_COL, 'academies');
  await migrateCollection(LEADS_COL, 'leads');

  console.log('\n🎉 Concluído.');
}

main().catch((e) => {
  console.error('\n❌ Erro fatal:', e.message);
  process.exit(1);
});


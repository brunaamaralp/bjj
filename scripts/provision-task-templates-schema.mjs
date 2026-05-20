/**
 * Provisiona coleção task_templates (templates de tarefas por academia).
 *
 * Uso: npm run provision:task-templates
 * Requer: APPWRITE_API_KEY, DB_ID
 * Opcional: VITE_APPWRITE_TASK_TEMPLATES_COLLECTION_ID — se vazio, cria coleção nova
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases, ID, Permission, Role } from 'node-appwrite';

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
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
let TEMPLATES_COL =
  process.env.VITE_APPWRITE_TASK_TEMPLATES_COLLECTION_ID ||
  process.env.APPWRITE_TASK_TEMPLATES_COLLECTION_ID ||
  '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureStringAttr(databases, colId, key, size, required = false) {
  try {
    await databases.createStringAttribute(DB_ID, colId, key, size, required);
    console.log(`  + string ${key} (${size})`);
    await sleep(1200);
  } catch (e) {
    if (String(e?.message || e).includes('already exists') || e.code === 409) {
      console.log(`  = string ${key} (exists)`);
    } else {
      throw e;
    }
  }
}

async function ensureBooleanAttr(databases, colId, key, required = false, defaultValue = true) {
  try {
    await databases.createBooleanAttribute(DB_ID, colId, key, required, defaultValue);
    console.log(`  + boolean ${key} (default ${defaultValue})`);
    await sleep(1200);
  } catch (e) {
    if (String(e?.message || e).includes('already exists') || e.code === 409) {
      console.log(`  = boolean ${key} (exists)`);
    } else {
      throw e;
    }
  }
}

async function ensureIndex(databases, colId, key, type, attributes) {
  try {
    await databases.createIndex(DB_ID, colId, key, type, attributes);
    console.log(`  + index ${key}`);
  } catch (e) {
    if (String(e?.message || e).includes('already exists') || e.code === 409) {
      console.log(`  = index ${key} (exists)`);
    } else {
      throw e;
    }
  }
}

async function main() {
  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
    console.error('Faltam variáveis Appwrite (endpoint, project, API key, DB).');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);

  if (!TEMPLATES_COL) {
    const col = await databases.createCollection(
      DB_ID,
      ID.unique(),
      'task_templates',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      false,
      true
    );
    TEMPLATES_COL = col.$id;
    console.log(`\nColeção criada: task_templates → ${TEMPLATES_COL}`);
    console.log(`Adicione ao .env:\nVITE_APPWRITE_TASK_TEMPLATES_COLLECTION_ID=${TEMPLATES_COL}\n`);
  } else {
    console.log(`Usando coleção existente: ${TEMPLATES_COL}`);
  }

  console.log('\nAtributos:');
  await ensureStringAttr(databases, TEMPLATES_COL, 'academy_id', 64, true);
  await ensureStringAttr(databases, TEMPLATES_COL, 'name', 128, true);
  await ensureStringAttr(databases, TEMPLATES_COL, 'trigger', 32, true);
  await ensureStringAttr(databases, TEMPLATES_COL, 'items_json', 8192, false);
  await ensureStringAttr(databases, TEMPLATES_COL, 'created_at', 64, false);
  await ensureStringAttr(databases, TEMPLATES_COL, 'updated_at', 64, false);
  await ensureBooleanAttr(databases, TEMPLATES_COL, 'enabled', false, true);

  console.log('\nÍndices:');
  await ensureIndex(databases, TEMPLATES_COL, 'idx_academy_trigger', 'key', ['academy_id', 'trigger']);
  await ensureIndex(databases, TEMPLATES_COL, 'idx_academy_id', 'key', ['academy_id']);

  console.log('\n✅ task_templates provisionado.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

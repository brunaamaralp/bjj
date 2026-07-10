/**
 * Provisiona coleção kimono_loans (empréstimo de kimono na recepção).
 *
 * Uso: npm run provision:kimono-loans
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases, Permission, Role } from 'node-appwrite';

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
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID =
  process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || process.env.DB_ID || '';
const KIMONO_LOANS_COL =
  process.env.KIMONO_LOANS_COL ||
  process.env.VITE_APPWRITE_KIMONO_LOANS_COLLECTION_ID ||
  'kimono_loans';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureCollection(databases, colId) {
  try {
    await databases.getCollection(DB_ID, colId);
    console.log(`Coleção existente: ${colId}`);
    return colId;
  } catch {
    const created = await databases.createCollection(
      DB_ID,
      colId,
      'kimono_loans',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      false,
      true
    );
    console.log(`Coleção criada: ${created.$id}`);
    return created.$id;
  }
}

async function ensureString(databases, colId, key, size, required = false) {
  try {
    await databases.createStringAttribute(DB_ID, colId, key, size, required);
    console.log(`  + string ${key}`);
    await sleep(1000);
  } catch (e) {
    if (e?.code === 409 || String(e?.message || '').includes('already exists')) {
      console.log(`  = string ${key} (exists)`);
    } else {
      throw e;
    }
  }
}

async function ensureIndex(databases, colId, key, attributes) {
  try {
    await databases.createIndex(DB_ID, colId, key, 'key', attributes);
    console.log(`  + index ${key}`);
    await sleep(1000);
  } catch (e) {
    if (e?.code === 409 || String(e?.message || '').includes('already exists')) {
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

  const colId = await ensureCollection(databases, KIMONO_LOANS_COL);

  console.log('\nAtributos:');
  await ensureString(databases, colId, 'academy_id', 64, true);
  await ensureString(databases, colId, 'variant_id', 64, true);
  await ensureString(databases, colId, 'product_id', 64);
  await ensureString(databases, colId, 'borrower_type', 16, true);
  await ensureString(databases, colId, 'borrower_id', 64, true);
  await ensureString(databases, colId, 'borrower_name', 128, true);
  await ensureString(databases, colId, 'size_label', 32);
  await ensureString(databases, colId, 'item_label', 160);
  await ensureString(databases, colId, 'status', 16, true);
  await ensureString(databases, colId, 'lent_at', 64, true);
  await ensureString(databases, colId, 'returned_at', 64);
  await ensureString(databases, colId, 'stock_move_out_id', 64);
  await ensureString(databases, colId, 'stock_move_in_id', 64);
  await ensureString(databases, colId, 'lent_by_user_id', 64);
  await ensureString(databases, colId, 'returned_by_user_id', 64);
  await ensureString(databases, colId, 'notes', 512);

  console.log('\nÍndices:');
  await ensureIndex(databases, colId, 'idx_kimono_loans_academy_status', ['academy_id', 'status']);
  await ensureIndex(databases, colId, 'idx_kimono_loans_borrower', ['borrower_id']);

  console.log('\n✅ kimono_loans provisionado.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

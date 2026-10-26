/**
 * Atualiza referências de fileId / bucket / URLs de Storage no banco
 * usando scripts/bucket-map.json (gerado por migrate-buckets.mjs).
 *
 * Uso:
 *   node --env-file=.env scripts/update-file-refs.mjs --dry-run
 *   node --env-file=.env scripts/update-file-refs.mjs
 *
 * NÃO rode a cópia real sem aprovação.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Databases, Query } from 'node-appwrite';
import { STORAGE_BUCKET_ID } from '../lib/storageBuckets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.join(__dirname, 'bucket-map.json');
const PLANNED_MAP_PATH = path.join(__dirname, 'bucket-map.planned.json');
const DEST_BUCKET = STORAGE_BUCKET_ID;
const PAGE = 100;

const OLD_BUCKETS = new Set([
  '6a2714a4001325623a03',
  'inbox_media',
  'product_images',
  'student_photos',
  'contract_templates',
]);

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID =
  process.env.VITE_APPWRITE_DATABASE_ID ||
  process.env.APPWRITE_DATABASE_ID ||
  process.env.DB_ID ||
  '';

const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID ||
  process.env.APPWRITE_STUDENTS_COLLECTION_ID ||
  '';
const PRODUCTS_COL =
  process.env.VITE_APPWRITE_PRODUCTS_COLLECTION_ID || process.env.PRODUCTS_COL || '';
const PRODUCT_VARIANTS_COL =
  process.env.VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID ||
  process.env.PRODUCT_VARIANTS_COL ||
  '';
const STOCK_ITEMS_COL =
  process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  '';
const CONTRACT_TEMPLATES_COL =
  process.env.APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID || 'contract_templates';

const dryRun = process.argv.includes('--dry-run');

if (!ENDPOINT || !PROJECT || !KEY || !DB_ID) {
  console.error('Defina APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY e DATABASE_ID no .env');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY);
const databases = new Databases(client);

function loadMap() {
  // Cópia real: bucket-map.json. Dry-run: planned se o map real ainda não existir.
  const real = loadJsonArray(MAP_PATH);
  const planned = loadJsonArray(PLANNED_MAP_PATH);
  const ordered = dryRun
    ? real?.length
      ? [MAP_PATH, PLANNED_MAP_PATH]
      : [PLANNED_MAP_PATH, MAP_PATH]
    : [MAP_PATH, PLANNED_MAP_PATH];

  for (const p of ordered) {
    const arr = loadJsonArray(p);
    if (arr?.length) {
      console.log(`Usando mapa: ${p} (${arr.length} entradas)`);
      return arr;
    }
  }
  console.error('Mapa não encontrado. Rode migrate-buckets.mjs (--dry-run gera bucket-map.planned.json).');
  process.exit(1);
}

function loadJsonArray(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** @param {Array<{oldBucket:string,oldId:string,newId:string}>} entries */
function buildIndexes(entries) {
  /** @type {Map<string, string>} oldId → newId (primeiro ganha; colisões raras entre buckets) */
  const byOldId = new Map();
  /** @type {Map<string, string>} `${oldBucket}::${oldId}` → newId */
  const byBucketAndId = new Map();
  for (const e of entries) {
    const key = `${e.oldBucket}::${e.oldId}`;
    byBucketAndId.set(key, e.newId);
    if (!byOldId.has(e.oldId)) byOldId.set(e.oldId, e.newId);
  }
  return { byOldId, byBucketAndId };
}

const STORAGE_URL_RE =
  /\/storage\/buckets\/([^/]+)\/files\/([^/]+)\/(view|download|preview)(\?[^"'\s]*)?/gi;

function rewriteStorageUrl(url, indexes) {
  const s = String(url || '').trim();
  if (!s || !/storage\/buckets\//i.test(s)) return { value: s, changed: false };

  let changed = false;
  const next = s.replace(STORAGE_URL_RE, (full, bucket, fileId, action, query) => {
    const b = String(bucket);
    const id = String(fileId);
    let newId = indexes.byBucketAndId.get(`${b}::${id}`);
    if (!newId && OLD_BUCKETS.has(b)) newId = indexes.byOldId.get(id);
    if (!newId && b === DEST_BUCKET) return full; // já no destino
    if (!newId) {
      // bucket legado sem map — só troca bucket se o id já for o novo? não
      if (OLD_BUCKETS.has(b)) {
        // tenta só pelo oldId
        newId = indexes.byOldId.get(id);
      }
    }
    if (!newId && !OLD_BUCKETS.has(b) && b !== DEST_BUCKET) return full;
    if (!newId) return full;
    changed = true;
    return `/storage/buckets/${DEST_BUCKET}/files/${newId}/${action}${query || ''}`;
  });
  return { value: next, changed };
}

function rewriteFileId(fileId, indexes) {
  const id = String(fileId || '').trim();
  if (!id) return { value: id, changed: false };
  const mapped = indexes.byOldId.get(id);
  if (mapped && mapped !== id) return { value: mapped, changed: true };
  return { value: id, changed: false };
}

async function listAllDocs(collectionId, queries = []) {
  const docs = [];
  let cursor = null;
  for (;;) {
    const q = [...queries, Query.limit(PAGE)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(DB_ID, collectionId, q);
    const batch = page.documents || [];
    if (!batch.length) break;
    docs.push(...batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return docs;
}

async function updateDoc(collectionId, docId, data) {
  if (dryRun) return;
  await databases.updateDocument(DB_ID, collectionId, docId, data);
}

/**
 * @param {string} name
 * @param {string} collectionId
 * @param {(doc: object) => { patch: object, changed: boolean } | null} mapper
 */
async function processCollection(name, collectionId, mapper) {
  const stats = { name, collectionId, scanned: 0, wouldUpdate: 0, updated: 0, errors: 0 };
  if (!collectionId) {
    console.log(`\n[${name}] coleção não configurada — pulando`);
    return stats;
  }
  console.log(`\n=== ${name} (${collectionId}) ===`);
  let docs;
  try {
    docs = await listAllDocs(collectionId);
  } catch (err) {
    console.error(`  [erro] listDocuments: ${err?.message || err}`);
    stats.errors += 1;
    return stats;
  }
  stats.scanned = docs.length;

  for (const doc of docs) {
    try {
      const result = mapper(doc);
      if (!result?.changed) continue;
      stats.wouldUpdate += 1;
      if (dryRun) {
        const keys = Object.keys(result.patch || {});
        console.log(`  [dry-run] ${doc.$id} → campos: ${keys.join(', ')}`);
        continue;
      }
      await updateDoc(collectionId, doc.$id, result.patch);
      stats.updated += 1;
      console.log(`  [ok] ${doc.$id}`);
    } catch (err) {
      stats.errors += 1;
      console.error(`  [erro] ${doc.$id}: ${err?.message || err}`);
    }
  }
  return stats;
}

function mapUrlAttr(attr, indexes) {
  return (doc) => {
    const raw = String(doc[attr] || '').trim();
    if (!raw) return null;
    const { value, changed } = rewriteStorageUrl(raw, indexes);
    if (!changed) return null;
    return { changed: true, patch: { [attr]: value.slice(0, 512) } };
  };
}

function mapContractTemplate(indexes) {
  return (doc) => {
    const patch = {};
    let changed = false;

    const fileId = String(doc.storage_file_id || '').trim();
    if (fileId) {
      const r = rewriteFileId(fileId, indexes);
      if (r.changed) {
        patch.storage_file_id = r.value;
        changed = true;
      }
    }

    const fileUrl = String(doc.file_url || '').trim();
    if (fileUrl) {
      const r = rewriteStorageUrl(fileUrl, indexes);
      if (r.changed) {
        patch.file_url = r.value.slice(0, 512);
        changed = true;
      } else if (fileId && patch.storage_file_id) {
        // reconstruir URL se só o id mudou
        const rebuilt = rewriteStorageUrl(
          fileUrl.includes('/storage/buckets/')
            ? fileUrl
            : `${ENDPOINT}/storage/buckets/contract_templates/files/${fileId}/view?project=${PROJECT}`,
          indexes
        );
        if (rebuilt.changed) {
          patch.file_url = rebuilt.value.slice(0, 512);
          changed = true;
        }
      }
    }

    return changed ? { changed: true, patch } : null;
  };
}

function rewriteMessagesArray(messages, indexes) {
  if (typeof messages === 'string') {
    try {
      messages = JSON.parse(messages);
    } catch {
      return { json: null, changed: false };
    }
  }
  if (!Array.isArray(messages) || !messages.length) return { json: null, changed: false };

  let changed = false;
  const next = messages.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const copy = { ...m };
    let local = false;

    const sid = String(copy.storageFileId || copy.storage_file_id || '').trim();
    if (sid) {
      const r = rewriteFileId(sid, indexes);
      if (r.changed) {
        if ('storageFileId' in copy || !('storage_file_id' in copy)) copy.storageFileId = r.value;
        if ('storage_file_id' in copy) copy.storage_file_id = r.value;
        local = true;
      }
    }

    for (const key of ['mediaUrl', 'media_url', 'url']) {
      if (!copy[key]) continue;
      const r = rewriteStorageUrl(copy[key], indexes);
      if (r.changed) {
        copy[key] = r.value;
        local = true;
      }
    }

    if (local) changed = true;
    return local ? copy : m;
  });

  return { json: changed ? JSON.stringify(next) : null, changed };
}

function mapConversationMessages(indexes) {
  return (doc) => {
    const patch = {};
    let changed = false;

    const full = rewriteMessagesArray(doc.messages, indexes);
    if (full.changed && full.json != null) {
      patch.messages = full.json;
      changed = true;
    }

    if (doc.messages_recent != null && doc.messages_recent !== '') {
      const recent = rewriteMessagesArray(doc.messages_recent, indexes);
      if (recent.changed && recent.json != null) {
        patch.messages_recent = recent.json;
        changed = true;
      }
    }

    return changed ? { changed: true, patch } : null;
  };
}

async function main() {
  console.log(dryRun ? 'Modo: --dry-run (não grava)' : 'Modo: UPDATE REAL');
  console.log(`Destino bucket: ${DEST_BUCKET}`);
  console.log(`Mapa: ${MAP_PATH}`);

  const entries = loadMap();
  const indexes = buildIndexes(entries);
  console.log(`Entradas no map: ${entries.length}`);

  /** @type {Awaited<ReturnType<typeof processCollection>>[]} */
  const summaries = [];

  summaries.push(
    await processCollection('students.photo_url', STUDENTS_COL, mapUrlAttr('photo_url', indexes))
  );
  summaries.push(
    await processCollection('products.image_url', PRODUCTS_COL, mapUrlAttr('image_url', indexes))
  );
  if (PRODUCT_VARIANTS_COL) {
    summaries.push(
      await processCollection(
        'product_variants.image_url',
        PRODUCT_VARIANTS_COL,
        mapUrlAttr('image_url', indexes)
      )
    );
  }
  summaries.push(
    await processCollection('stock_items.image_url', STOCK_ITEMS_COL, mapUrlAttr('image_url', indexes))
  );
  summaries.push(
    await processCollection(
      'contract_templates',
      CONTRACT_TEMPLATES_COL,
      mapContractTemplate(indexes)
    )
  );
  summaries.push(
    await processCollection(
      'conversations.messages',
      CONVERSATIONS_COL,
      mapConversationMessages(indexes)
    )
  );

  console.log('\n========== RESUMO ==========');
  console.log(
    `${'collection'.padEnd(32)} ${'scanned'.padStart(8)} ${'toUpdate'.padStart(9)} ${'updated'.padStart(8)} ${'errors'.padStart(7)}`
  );
  for (const s of summaries) {
    console.log(
      `${s.name.slice(0, 32).padEnd(32)} ${String(s.scanned).padStart(8)} ${String(s.wouldUpdate).padStart(9)} ${String(s.updated).padStart(8)} ${String(s.errors).padStart(7)}`
    );
  }
  if (dryRun) {
    console.log('\nDry-run concluído. Nada foi alterado no banco. Aprove o update real para continuar.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

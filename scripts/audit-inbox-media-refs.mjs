/**
 * Auditoria: quais fileIds de inbox_media aparecem no banco (e quais são órfãos).
 * Somente leitura — não altera nada.
 *
 *   node --env-file=.env scripts/audit-inbox-media-refs.mjs
 */
import { Client, Storage, Databases, Query } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
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

const SOURCE_BUCKET = 'inbox_media';
const PAGE = 100;

const COLLECTIONS = [
  {
    name: 'conversations',
    id:
      process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID ||
      process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID ||
      '',
    attrs: ['messages', 'messages_recent'],
  },
  {
    name: 'students',
    id:
      process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID ||
      process.env.APPWRITE_STUDENTS_COLLECTION_ID ||
      '',
    attrs: ['photo_url'],
  },
  {
    name: 'stock_items',
    id: process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '',
    attrs: ['image_url', 'notes'],
  },
  {
    name: 'contract_templates',
    id: process.env.APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID || 'contract_templates',
    attrs: ['storage_file_id', 'file_url', 'body_html'],
  },
  {
    name: 'webhook_logs',
    id: process.env.APPWRITE_WEBHOOK_LOGS_COLLECTION_ID || '',
    attrs: ['raw_payload', 'error', 'event_type'],
  },
  {
    name: 'inbound_dead_letter',
    id: process.env.VITE_APPWRITE_INBOUND_DEAD_LETTER_COL_ID || process.env.APPWRITE_INBOUND_DEAD_LETTER_COL_ID || '',
    attrs: null, // dump all string attrs
  },
  {
    name: 'ai_usage_logs',
    id: process.env.APPWRITE_AI_USAGE_LOGS_COLLECTION_ID || '',
    attrs: null,
  },
  {
    name: 'academy_events',
    id:
      process.env.VITE_APPWRITE_ACADEMY_EVENTS_COLLECTION_ID ||
      process.env.APPWRITE_ACADEMY_EVENTS_COLLECTION_ID ||
      '',
    attrs: null,
  },
  {
    name: 'lead_events',
    id:
      process.env.VITE_APPWRITE_LEAD_EVENTS_COLLECTION_ID ||
      process.env.APPWRITE_LEAD_EVENTS_COLLECTION_ID ||
      '',
    attrs: null,
  },
];

if (!ENDPOINT || !PROJECT || !KEY || !DB_ID) {
  console.error('Env Appwrite incompleto');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY);
const storage = new Storage(client);
const databases = new Databases(client);

async function listAllFiles(bucketId) {
  const files = [];
  let cursor = null;
  for (;;) {
    const queries = [Query.limit(PAGE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await storage.listFiles(bucketId, queries);
    const batch = page.files || [];
    if (!batch.length) break;
    files.push(...batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return files;
}

async function listAllDocs(collectionId) {
  const docs = [];
  let cursor = null;
  for (;;) {
    const q = [Query.limit(PAGE)];
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

function collectStringBlobs(value, out) {
  if (value == null) return;
  if (typeof value === 'string') {
    if (value.length) out.push(value);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    for (const item of value) collectStringBlobs(item, out);
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$')) continue;
      collectStringBlobs(v, out);
    }
  }
}

/** Extrai fileIds do bucket inbox_media (URL) + storageFileId crus presentes no texto. */
function findHits(text, fileIdSet) {
  const hits = new Set();
  const s = String(text || '');
  if (!s) return hits;

  const urlRe =
    /\/storage\/buckets\/(?:inbox_media|files|6a2714a4001325623a03)\/files\/([a-zA-Z0-9._-]+)\//gi;
  let m;
  while ((m = urlRe.exec(s))) {
    const id = m[1];
    if (fileIdSet.has(id)) hits.add(id);
  }

  // storageFileId JSON fields
  const jsonIdRe = /"(?:storageFileId|storage_file_id)"\s*:\s*"([^"]+)"/gi;
  while ((m = jsonIdRe.exec(s))) {
    const id = m[1];
    if (fileIdSet.has(id)) hits.add(id);
  }

  // bare id mention (só se o id for longo o bastante p/ evitar falso positivo)
  for (const id of fileIdSet) {
    if (id.length >= 16 && s.includes(id)) hits.add(id);
  }

  return hits;
}

async function main() {
  console.log(`Listando arquivos em ${SOURCE_BUCKET}...`);
  const files = await listAllFiles(SOURCE_BUCKET);
  const fileIdSet = new Set(files.map((f) => f.$id));
  console.log(`Arquivos no bucket: ${files.length}`);

  /** @type {Map<string, Set<string>>} fileId → locations */
  const refs = new Map();
  for (const id of fileIdSet) refs.set(id, new Set());

  const locationCounts = {};

  for (const col of COLLECTIONS) {
    if (!col.id) {
      console.log(`\n[${col.name}] pulado (env sem collection id)`);
      continue;
    }
    let docs;
    try {
      docs = await listAllDocs(col.id);
    } catch (e) {
      console.log(`\n[${col.name}] erro: ${e.message || e}`);
      continue;
    }
    console.log(`\n[${col.name}] docs=${docs.length}`);
    let docsWithHit = 0;
    const attrHits = {};

    for (const doc of docs) {
      const attrs =
        col.attrs ||
        Object.keys(doc).filter((k) => !k.startsWith('$') && typeof doc[k] === 'string');
      let docHit = false;
      for (const attr of attrs) {
        if (!(attr in doc)) continue;
        const blobs = [];
        collectStringBlobs(doc[attr], blobs);
        for (const blob of blobs) {
          const hits = findHits(blob, fileIdSet);
          if (!hits.size) continue;
          docHit = true;
          attrHits[attr] = (attrHits[attr] || 0) + hits.size;
          for (const id of hits) {
            refs.get(id)?.add(`${col.name}.${attr}:${doc.$id}`);
          }
        }
      }
      if (docHit) docsWithHit += 1;
    }
    locationCounts[col.name] = { docs: docs.length, docsWithHit, attrHits };
    console.log(`  docs com ref: ${docsWithHit}`, attrHits);
  }

  let referenced = 0;
  let orphan = 0;
  const byLocationKind = {
    conversations_only: 0,
    other_only: 0,
    both: 0,
    orphan: 0,
  };
  const orphanSamples = [];

  for (const [id, locs] of refs) {
    if (!locs.size) {
      orphan += 1;
      byLocationKind.orphan += 1;
      if (orphanSamples.length < 15) {
        const f = files.find((x) => x.$id === id);
        orphanSamples.push({ id, name: f?.name, created: f?.$createdAt });
      }
      continue;
    }
    referenced += 1;
    const hasConv = [...locs].some((l) => l.startsWith('conversations.'));
    const hasOther = [...locs].some((l) => !l.startsWith('conversations.'));
    if (hasConv && hasOther) byLocationKind.both += 1;
    else if (hasConv) byLocationKind.conversations_only += 1;
    else byLocationKind.other_only += 1;
  }

  // Quantos fileIds únicos nas conversas (via storageFileId/URL)
  let uniqueInConversations = 0;
  for (const [, locs] of refs) {
    if ([...locs].some((l) => l.startsWith('conversations.'))) uniqueInConversations += 1;
  }

  console.log('\n========== RESUMO ==========');
  console.log(`Total arquivos inbox_media: ${files.length}`);
  console.log(`Referenciados em alguma collection: ${referenced}`);
  console.log(`Órfãos (zero referência no DB): ${orphan}`);
  console.log(`Únicos em conversations: ${uniqueInConversations}`);
  console.log('Distribuição:', byLocationKind);
  console.log('\nPor collection:', JSON.stringify(locationCounts, null, 2));
  console.log('\nAmostra de órfãos (até 15):');
  for (const o of orphanSamples) {
    console.log(`  ${o.id}  ${o.created || ''}  ${o.name || ''}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

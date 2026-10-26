/**
 * Copia arquivos dos buckets legados para o bucket único `files`.
 * NÃO apaga buckets nem arquivos de origem.
 *
 * Uso:
 *   node --env-file=.env scripts/migrate-buckets.mjs --dry-run
 *   node --env-file=.env scripts/migrate-buckets.mjs
 *
 * Idempotente: pula se o newId já existe em `files` (ou já está no map).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Storage, Query, ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { STORAGE_BUCKET_ID, migrateStorageFileId } from '../lib/storageBuckets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.join(__dirname, 'bucket-map.json');
const PLANNED_MAP_PATH = path.join(__dirname, 'bucket-map.planned.json');
const DEST_BUCKET = STORAGE_BUCKET_ID;
const PAGE = 100;

/** @type {{ bucketId: string, prefix: string, label: string }[]} */
const SOURCE_BUCKETS = [
  { bucketId: '6a2714a4001325623a03', prefix: 'inb2', label: 'inbox_media (dup)' },
  { bucketId: 'inbox_media', prefix: 'inb', label: 'inbox_media' },
  { bucketId: 'product_images', prefix: 'prd', label: 'product_images' },
  { bucketId: 'student_photos', prefix: 'stu', label: 'student_photos' },
  { bucketId: 'contract_templates', prefix: 'ctr', label: 'contract_templates' },
];

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const KEY = process.env.APPWRITE_API_KEY || '';

const dryRun = process.argv.includes('--dry-run');

if (!ENDPOINT || !PROJECT || !KEY) {
  console.error('Defina APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID e APPWRITE_API_KEY no .env');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY);
const storage = new Storage(client);

function loadMap() {
  try {
    if (!fs.existsSync(MAP_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveMap(entries) {
  fs.writeFileSync(MAP_PATH, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

function mapKey(oldBucket, oldId) {
  return `${oldBucket}::${oldId}`;
}

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

async function fileExists(bucketId, fileId) {
  try {
    await storage.getFile(bucketId, fileId);
    return true;
  } catch (err) {
    const code = err?.code ?? err?.response?.code;
    if (code === 404) return false;
    throw err;
  }
}

function resolvePermissions(file, bucketPerms, stats) {
  const perms = Array.isArray(file.$permissions) ? file.$permissions.filter(Boolean) : [];
  if (perms.length) return perms;
  stats.emptyPermissions += 1;
  console.warn(
    `[warn] $permissions vazio — usando permissões do bucket origem | bucket=${file.$bucketId || '?'} id=${file.$id} name=${file.name}`
  );
  return Array.isArray(bucketPerms) ? bucketPerms.filter(Boolean) : [];
}

async function downloadToBuffer(bucketId, fileId) {
  const ab = await storage.getFileDownload(bucketId, fileId);
  return Buffer.from(ab);
}

async function migrateBucket(src, mapIndex, allMap, plannedMap) {
  const stats = {
    label: src.label,
    bucketId: src.bucketId,
    total: 0,
    copied: 0,
    skipped: 0,
    errors: 0,
    emptyPermissions: 0,
  };

  let bucketPerms = [];
  try {
    const bucket = await storage.getBucket(src.bucketId);
    bucketPerms = Array.isArray(bucket.$permissions) ? bucket.$permissions : [];
  } catch (err) {
    console.error(`[erro] getBucket ${src.bucketId}: ${err?.message || err}`);
    stats.errors += 1;
    return stats;
  }

  let files;
  try {
    files = await listAllFiles(src.bucketId);
  } catch (err) {
    console.error(`[erro] listFiles ${src.bucketId}: ${err?.message || err}`);
    stats.errors += 1;
    return stats;
  }

  stats.total = files.length;
  console.log(`\n=== ${src.label} (${src.bucketId}) → ${DEST_BUCKET} prefix=${src.prefix}_ | ${files.length} arquivo(s) ===`);

  for (const file of files) {
    const oldId = file.$id;
    const existing = mapIndex.get(mapKey(src.bucketId, oldId));
    let newId =
      existing?.newId ||
      migrateStorageFileId(src.prefix, oldId, () => ID.unique());

    try {
      if (existing?.newId) {
        const exists = dryRun ? true : await fileExists(DEST_BUCKET, existing.newId);
        if (exists || dryRun) {
          stats.skipped += 1;
          if (dryRun) {
            console.log(`  [skip/map] ${oldId} → ${existing.newId} (${file.name})`);
          }
          continue;
        }
      }

      const already = dryRun ? false : await fileExists(DEST_BUCKET, newId);
      if (already) {
        stats.skipped += 1;
        if (!existing) {
          const entry = { oldBucket: src.bucketId, oldId, newId, name: file.name };
          allMap.push(entry);
          mapIndex.set(mapKey(src.bucketId, oldId), entry);
          if (!dryRun) saveMap(allMap);
        }
        console.log(`  [skip] ${oldId} → ${newId} já existe`);
        continue;
      }

      if (dryRun) {
        const planned = migrateStorageFileId(src.prefix, oldId, () => ID.unique());
        plannedMap.push({ oldBucket: src.bucketId, oldId, newId: planned, name: file.name });
        console.log(`  [dry-run] ${oldId} → ${planned} (${file.name})`);
        stats.copied += 1;
        continue;
      }

      const permissions = resolvePermissions(file, bucketPerms, stats);
      const buffer = await downloadToBuffer(src.bucketId, oldId);
      const mime = String(file.mimeType || 'application/octet-stream').trim();
      const input = InputFile.fromBuffer(buffer, file.name || oldId, mime);

      // Se newId colidir e não era o candidato curto, regenera (raro).
      let created = null;
      let attempts = 0;
      while (!created && attempts < 3) {
        attempts += 1;
        try {
          created = await storage.createFile(DEST_BUCKET, newId, input, permissions);
        } catch (err) {
          const code = err?.code ?? err?.response?.code;
          if (code === 409) {
            newId = migrateStorageFileId(src.prefix, oldId, () => ID.unique());
            continue;
          }
          throw err;
        }
      }
      if (!created) throw new Error(`falha ao createFile após ${attempts} tentativas`);

      const entry = { oldBucket: src.bucketId, oldId, newId: created.$id, name: file.name };
      allMap.push(entry);
      mapIndex.set(mapKey(src.bucketId, oldId), entry);
      saveMap(allMap);
      stats.copied += 1;
      console.log(`  [ok] ${oldId} → ${created.$id} (${file.name})`);
    } catch (err) {
      stats.errors += 1;
      console.error(`  [erro] ${oldId} (${file.name}): ${err?.message || err}`);
    }
  }

  return stats;
}

async function main() {
  console.log(`Destino: bucket \`${DEST_BUCKET}\``);
  console.log(dryRun ? 'Modo: --dry-run (não cria arquivos)' : 'Modo: CÓPIA REAL');
  console.log(`Mapa: ${MAP_PATH}`);

  try {
    const dest = await storage.getBucket(DEST_BUCKET);
    console.log(`Destino OK: id=${dest.$id} name=${dest.name} fileSecurity=${dest.fileSecurity}`);
  } catch (err) {
    console.error(
      `\nERRO: bucket destino \`${DEST_BUCKET}\` não existe neste projeto.\n` +
        `No console Appwrite o bucket precisa ter ID customizado exatamente \`${DEST_BUCKET}\` (o nome sozinho não basta).\n` +
        `Detalhe: ${err?.message || err}`
    );
    process.exit(1);
  }

  const allMap = loadMap();
  const mapIndex = new Map(allMap.map((e) => [mapKey(e.oldBucket, e.oldId), e]));
  console.log(`Entradas já no map: ${allMap.length}`);
  /** @type {{ oldBucket: string, oldId: string, newId: string, name: string }[]} */
  const plannedMap = [];

  const summaries = [];
  for (const src of SOURCE_BUCKETS) {
    const s = await migrateBucket(src, mapIndex, allMap, plannedMap);
    summaries.push(s);
  }

  console.log('\n========== RESUMO ==========');
  console.log(
    `${'bucket'.padEnd(28)} ${'total'.padStart(6)} ${'copiados'.padStart(9)} ${'pulados'.padStart(8)} ${'erros'.padStart(6)}`
  );
  let tTotal = 0;
  let tCopied = 0;
  let tSkipped = 0;
  let tErrors = 0;
  for (const s of summaries) {
    const label = `${s.label}`.slice(0, 28).padEnd(28);
    console.log(
      `${label} ${String(s.total).padStart(6)} ${String(s.copied).padStart(9)} ${String(s.skipped).padStart(8)} ${String(s.errors).padStart(6)}`
    );
    tTotal += s.total;
    tCopied += s.copied;
    tSkipped += s.skipped;
    tErrors += s.errors;
  }
  console.log(
    `${'TOTAL'.padEnd(28)} ${String(tTotal).padStart(6)} ${String(tCopied).padStart(9)} ${String(tSkipped).padStart(8)} ${String(tErrors).padStart(6)}`
  );
  if (dryRun) {
    fs.writeFileSync(PLANNED_MAP_PATH, `${JSON.stringify(plannedMap, null, 2)}\n`, 'utf8');
    console.log(`\nMapa planejado: ${PLANNED_MAP_PATH} (${plannedMap.length} entradas).`);
    console.log('Dry-run concluído. Nada foi criado. Aprove a cópia real para continuar.');
  } else {
    console.log(`\nMapa salvo em ${MAP_PATH} (${allMap.length} entradas).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

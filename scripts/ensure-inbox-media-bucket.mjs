/**
 * Verifica se o bucket único Appwrite `files` existe.
 * NÃO cria nem altera buckets (plano Free / migração unificada).
 *
 * Uso: npm run provision:inbox-media-bucket
 *      node --env-file=.env scripts/ensure-inbox-media-bucket.mjs
 */
import { Client, Storage } from 'node-appwrite';
import { STORAGE_BUCKET_ID } from '../lib/storageBuckets.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const KEY = process.env.APPWRITE_API_KEY || '';
const BUCKET_ID = STORAGE_BUCKET_ID;

if (!ENDPOINT || !PROJECT || !KEY) {
  console.error('Defina APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID e APPWRITE_API_KEY no .env');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY);
const storage = new Storage(client);

try {
  const existing = await storage.getBucket(BUCKET_ID);
  console.log('OK: bucket existe:', existing.$id, `(name=${existing.name}, max ${existing.maximumFileSize} bytes)`);
  console.log('fileSecurity:', existing.fileSecurity);
} catch (err) {
  console.error(
    `ERRO: bucket \`${BUCKET_ID}\` não encontrado.\n` +
      `Crie no console Appwrite com ID customizado exatamente \`${BUCKET_ID}\` (não só o nome).\n` +
      `Detalhe: ${err?.message || err}`
  );
  process.exit(1);
}

console.log('\nVariáveis sugeridas (Vercel + Appwrite Functions) — todas = files:');
console.log(`APPWRITE_MEDIA_BUCKET_ID=${BUCKET_ID}`);
console.log(`APPWRITE_INBOX_MEDIA_BUCKET_ID=${BUCKET_ID}`);
console.log(`VITE_APPWRITE_INBOX_MEDIA_BUCKET_ID=${BUCKET_ID}`);
console.log(`APPWRITE_PRODUCT_IMAGES_BUCKET_ID=${BUCKET_ID}`);
console.log(`VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID=${BUCKET_ID}`);
console.log(`VITE_APPWRITE_STUDENT_PHOTOS_BUCKET_ID=${BUCKET_ID}`);
console.log(`APPWRITE_CONTRACT_TEMPLATES_BUCKET_ID=${BUCKET_ID}`);

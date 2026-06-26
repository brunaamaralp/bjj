import { Client, Storage, ID, Permission, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { API_KEY, ENDPOINT, PROJECT_ID } from './appwriteCollections.js';

export const MAX_PRODUCT_IMAGE_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function getProductImagesBucketId() {
  return String(
    process.env.APPWRITE_PRODUCT_IMAGES_BUCKET_ID ||
      process.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID ||
      'product_images'
  ).trim();
}

let storageClient = null;

function getStorage() {
  const bucketId = getProductImagesBucketId();
  if (!PROJECT_ID || !API_KEY || !bucketId) return null;
  if (!storageClient) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    storageClient = new Storage(client);
  }
  return storageClient;
}

export function isProductImageStorageConfigured() {
  return Boolean(getStorage());
}

export function isAllowedProductImageMime(mimeType) {
  return ALLOWED_MIME.has(String(mimeType || '').trim().toLowerCase());
}

export function buildProductImageViewUrl(fileId) {
  const bucket = getProductImagesBucketId();
  if (!bucket || !fileId) return '';
  return `${String(ENDPOINT).replace(/\/+$/, '')}/storage/buckets/${bucket}/files/${fileId}/view?project=${PROJECT_ID}`;
}

/**
 * @param {Buffer} buffer
 * @param {{ mimeType: string, filename?: string }} opts
 * @returns {Promise<{ fileId: string, url: string }>}
 */
export async function storeProductImageBuffer(buffer, { mimeType, filename = 'produto.jpg' } = {}) {
  const storage = getStorage();
  if (!storage) {
    throw new Error('product_image_storage_not_configured');
  }

  const mime = String(mimeType || '').trim().toLowerCase();
  if (!isAllowedProductImageMime(mime)) {
    throw new Error('unsupported_mime');
  }

  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!bytes.length) throw new Error('empty_file');
  if (bytes.length > MAX_PRODUCT_IMAGE_BYTES) throw new Error('too_large');

  const ext = MIME_TO_EXT[mime] || 'jpg';
  const safeName = String(filename || `produto.${ext}`)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128);
  const finalName = safeName.includes('.') ? safeName : `${safeName}.${ext}`;

  const input = InputFile.fromBuffer(bytes, finalName, mime);
  const created = await storage.createFile(
    getProductImagesBucketId(),
    ID.unique(),
    input,
    [Permission.read(Role.any())]
  );

  return {
    fileId: created.$id,
    url: buildProductImageViewUrl(created.$id),
  };
}

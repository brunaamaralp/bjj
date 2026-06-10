import { ID, Storage } from 'appwrite';
import { client, APPWRITE_PROJECT, ENDPOINT } from './appwrite';

const BUCKET_ID = String(import.meta.env.VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID || '').trim();
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class ProductImageUploadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'ProductImageUploadError';
  }
}

export function isProductImageUploadConfigured() {
  return Boolean(BUCKET_ID);
}

function normalizeMime(file) {
  const type = String(file?.type || '').trim().toLowerCase();
  if (type) return type;
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return '';
}

/**
 * @param {File} file
 * @returns {Promise<string>} URL pública da imagem no Appwrite Storage
 */
export async function uploadProductImage(file) {
  if (!file) throw new ProductImageUploadError('invalid', 'Arquivo inválido.');
  if (!BUCKET_ID) {
    throw new ProductImageUploadError(
      'not_configured',
      'Upload de imagem não configurado. Defina VITE_APPWRITE_PRODUCT_IMAGES_BUCKET_ID.'
    );
  }
  if (file.size > MAX_BYTES) {
    throw new ProductImageUploadError('too_large', 'Imagem muito grande. Máximo: 5 MB.');
  }

  const mimeType = normalizeMime(file);
  if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
    throw new ProductImageUploadError('unsupported', 'Use JPG, PNG ou WebP.');
  }

  const storage = new Storage(client);
  const created = await storage.createFile(BUCKET_ID, ID.unique(), file);
  const base = String(ENDPOINT).replace(/\/+$/, '');
  return `${base}/storage/buckets/${BUCKET_ID}/files/${created.$id}/view?project=${APPWRITE_PROJECT}`;
}

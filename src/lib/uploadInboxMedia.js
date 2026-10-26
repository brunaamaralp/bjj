import { ID, Storage } from 'appwrite';
import { client, APPWRITE_PROJECT, ENDPOINT } from './appwrite';
import {
  STORAGE_BUCKET_ID,
  STORAGE_FILE_PREFIX,
  makeStorageFileId,
} from '../../lib/storageBuckets.js';

const BUCKET_ID = STORAGE_BUCKET_ID;
const MAX_BYTES = 16 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'application/pdf'
]);

export class InboxMediaUploadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'InboxMediaUploadError';
  }
}

export function isInboxMediaUploadConfigured() {
  return Boolean(BUCKET_ID);
}

function normalizeMime(file) {
  const t = String(file?.type || '').trim().toLowerCase();
  if (t === 'audio/x-m4a') return 'audio/mp4';
  if (t) return t;
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return '';
}

/**
 * @param {File} file
 * @returns {Promise<{ mediaUrl: string, mimeType: string, fileName: string }>}
 */
export async function uploadInboxMedia(file) {
  if (!file) throw new InboxMediaUploadError('invalid', 'Arquivo inválido.');
  if (!BUCKET_ID) {
    throw new InboxMediaUploadError('not_configured', 'Bucket de mídia do Inbox não configurado.');
  }
  if (file.size > MAX_BYTES) {
    throw new InboxMediaUploadError('too_large', 'Arquivo muito grande. Máximo: 16MB.');
  }

  const mimeType = normalizeMime(file);
  if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
    throw new InboxMediaUploadError('unsupported', 'Tipo de arquivo não suportado.');
  }

  const storage = new Storage(client);
  const fileId = makeStorageFileId(STORAGE_FILE_PREFIX.inbox, () => ID.unique());
  const created = await storage.createFile(BUCKET_ID, fileId, file);
  const mediaUrl = `${String(ENDPOINT).replace(/\/+$/, '')}/storage/buckets/${BUCKET_ID}/files/${created.$id}/view?project=${APPWRITE_PROJECT}`;
  return {
    mediaUrl,
    mimeType,
    fileName: String(file.name || '').trim() || 'arquivo'
  };
}

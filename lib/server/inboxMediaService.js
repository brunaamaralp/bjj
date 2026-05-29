import { Client, Storage, ID, Permission, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { API_KEY, ENDPOINT, PROJECT_ID } from './appwriteCollections.js';

const BUCKET_ID = () => String(process.env.APPWRITE_INBOX_MEDIA_BUCKET_ID || '').trim();
const MAX_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;

let storageClient = null;

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'video/mp4': 'mp4'
};

function getStorage() {
  if (!PROJECT_ID || !API_KEY || !BUCKET_ID()) return null;
  if (!storageClient) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    storageClient = new Storage(client);
  }
  return storageClient;
}

export function isInboxMediaStorageConfigured() {
  return Boolean(PROJECT_ID && API_KEY && BUCKET_ID());
}

export function buildInboxMediaViewUrl(fileId) {
  const bucket = BUCKET_ID();
  if (!bucket || !fileId) return '';
  return `${String(ENDPOINT).replace(/\/+$/, '')}/storage/buckets/${bucket}/files/${fileId}/view?project=${PROJECT_ID}`;
}

function safeFilePart(value) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
}

function extensionFromMime(mimeType) {
  const mime = String(mimeType || '')
    .trim()
    .toLowerCase()
    .split(';')[0];
  if (MIME_TO_EXT[mime]) return MIME_TO_EXT[mime];
  if (mime.startsWith('image/')) return mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'img';
  if (mime.startsWith('audio/')) return mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'audio';
  if (mime.startsWith('video/')) return mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'mp4';
  return 'bin';
}

function parseContentLength(headers) {
  const raw = headers?.get?.('content-length') ?? headers?.['content-length'];
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Baixa mídia efêmera (Zapster) e persiste no Appwrite Storage.
 * @returns {Promise<{ storageFileId: string, permanentUrl: string, mimeType: string } | null>}
 */
export async function downloadAndStoreMedia({ mediaUrl, mimeType, messageId, academyId }) {
  const url = String(mediaUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const storage = getStorage();
  if (!storage) {
    console.warn('[inboxMedia] bucket não configurado — usando URL original', {
      academyId: safeFilePart(academyId),
      messageId: safeFilePart(messageId)
    });
    return null;
  }

  const mime = String(mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const mid = safeFilePart(messageId || ID.unique());
  const aid = safeFilePart(academyId || 'academy');
  const ext = extensionFromMime(mime);
  const filename = `${aid}_${mid}_${Date.now()}.${ext}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!resp.ok) {
      console.error('[inboxMedia] download HTTP falhou', {
        status: resp.status,
        academyId: aid,
        messageId: mid
      });
      return null;
    }

    const contentLength = parseContentLength(resp.headers);
    if (contentLength != null && contentLength > MAX_BYTES) {
      console.warn('[inboxMedia] arquivo excede 20MB — ignorando storage', {
        contentLength,
        academyId: aid,
        messageId: mid
      });
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_BYTES) {
      console.warn('[inboxMedia] buffer excede 20MB — ignorando storage', {
        bytes: buffer.length,
        academyId: aid,
        messageId: mid
      });
      return null;
    }

    if (!buffer.length) {
      console.error('[inboxMedia] download vazio', { academyId: aid, messageId: mid });
      return null;
    }

    const input = InputFile.fromBuffer(buffer, filename, mime);
    const created = await storage.createFile(BUCKET_ID(), ID.unique(), input, [Permission.read(Role.any())]);
    const permanentUrl = buildInboxMediaViewUrl(created.$id);
    console.log('[inboxMedia] stored', {
      academyId: aid,
      messageId: mid,
      mimeType: mime,
      bytes: buffer.length,
      fileId: created.$id
    });
    return {
      storageFileId: created.$id,
      permanentUrl,
      mimeType: mime
    };
  } catch (error) {
    console.error('[inboxMedia]', error?.message || error, { academyId: aid, messageId: mid });
    return null;
  }
}

/**
 * Enriquece URL Zapster com storage permanente (fallback: URL original).
 */
export async function enrichInboundMedia({ mediaUrl, mimeType, messageId, academyId }) {
  const originalUrl = String(mediaUrl || '').trim();
  const mime = String(mimeType || '').trim() || 'application/octet-stream';
  if (!originalUrl) {
    return {
      mediaUrl: null,
      storageFileId: null,
      media_stored: false,
      mimeType: mime
    };
  }

  const stored = await downloadAndStoreMedia({
    mediaUrl: originalUrl,
    mimeType: mime,
    messageId,
    academyId
  });

  if (stored) {
    return {
      mediaUrl: stored.permanentUrl,
      storageFileId: stored.storageFileId,
      media_stored: true,
      mimeType: stored.mimeType || mime
    };
  }

  return {
    mediaUrl: originalUrl,
    storageFileId: null,
    media_stored: false,
    mimeType: mime
  };
}

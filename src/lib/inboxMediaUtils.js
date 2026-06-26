const INBOX_MEDIA_BUCKET = String(import.meta.env.VITE_APPWRITE_INBOX_MEDIA_BUCKET_ID || '').trim();
const APPWRITE_ENDPOINT = String(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1').replace(
  /\/+$/,
  ''
);
const APPWRITE_PROJECT = String(
  import.meta.env.VITE_APPWRITE_PROJECT_ID || import.meta.env.VITE_APPWRITE_PROJECT || ''
).trim();

export function buildInboxMediaViewUrl(fileId) {
  const id = String(fileId || '').trim();
  if (!INBOX_MEDIA_BUCKET || !id) return '';
  if (!APPWRITE_PROJECT) return '';
  return `${APPWRITE_ENDPOINT}/storage/buckets/${INBOX_MEDIA_BUCKET}/files/${id}/view?project=${APPWRITE_PROJECT}`;
}

/** @param {unknown} m */
export function inboxMessageMediaUrl(m) {
  if (!m || typeof m !== 'object') return '';
  const fileId = String(m.storageFileId || m.storage_file_id || '').trim();
  if (fileId) {
    const stored = buildInboxMediaViewUrl(fileId);
    if (stored) return stored;
  }
  const nested = m.media && typeof m.media === 'object' ? String(m.media.url || '').trim() : '';
  const u = String(m.mediaUrl || m.media_url || m.url || nested || '').trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return '';
}

/** @param {unknown} m */
export function inboxMessageMimeType(m) {
  if (!m || typeof m !== 'object') return '';
  return String(m.mimeType || m.mime_type || '').trim();
}

/** @param {unknown} m */
export function inboxMessageMediaStored(m) {
  if (!m || typeof m !== 'object') return null;
  if (m.media_stored === true) return true;
  if (m.media_stored === false) return false;
  return null;
}

export function canPlayOgg() {
  if (typeof document === 'undefined') return true;
  try {
    const a = document.createElement('audio');
    return a.canPlayType('audio/ogg; codecs="opus"') !== '';
  } catch {
    return false;
  }
}

export function isOutboundImagePlaceholder(content) {
  return /\[Imagem enviada pelo celular\]/i.test(String(content || ''));
}

export function isOutboundAudioPlaceholder(content) {
  return /\[Áudio enviado pelo celular\]/i.test(String(content || ''));
}

export function isAudioPlaceholderContent(content) {
  const s = String(content || '').trim();
  return /🎵\s*\[Áudio recebido\]|\[Áudio recebido\]/i.test(s);
}

/** @returns {'video'|'document'|'sticker'|null} */
export function inboxOtherMediaPlaceholderKind(m, content) {
  const type = String(m?.type || '').toLowerCase();
  const c = String(content || '').trim();
  if (type === 'video' || c.startsWith('🎥')) return 'video';
  if (type === 'document' || c.startsWith('📄')) return 'document';
  if (type === 'sticker' || /🖼️\s*\[Sticker/i.test(c)) return 'sticker';
  return null;
}

export function inboxImageCaption(content) {
  return inboxMediaCaption(content);
}

export function inboxMediaCaption(content) {
  const c = String(content || '').trim();
  if (!c || c === '[imagem]') return '';
  if (isOutboundImagePlaceholder(c)) return '';
  if (isOutboundAudioPlaceholder(c)) return '';
  if (isAudioPlaceholderContent(c)) return '';
  if (/^\[Vídeo recebido\]|^\[Documento recebido\]|^\[Sticker recebido\]/i.test(c)) return '';
  if (c.startsWith('🎥') || c.startsWith('📄') || c.startsWith('🖼️')) return '';
  return c;
}

import { buildWaMeUrl } from './whatsappLinks.js';

export function buildWhatsAppChatUrl(phone) {
  return buildWaMeUrl(phone);
}

export function openExternalUrl(url) {
  const u = String(url || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return;
  try {
    window.open(u, '_blank', 'noopener,noreferrer');
  } catch {
    void 0;
  }
}

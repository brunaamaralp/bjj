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

export function buildWhatsAppChatUrl(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const n = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${n}`;
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

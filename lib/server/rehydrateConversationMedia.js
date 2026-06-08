import { enrichInboundMedia } from './inboxMediaService.js';

function messageMediaType(m) {
  const type = String(m?.type || '').trim().toLowerCase();
  if (type === 'image') return 'image';
  if (type === 'audio' || type === 'ptt') return 'audio';
  return '';
}

function messageMediaUrl(m) {
  return String(m?.mediaUrl || m?.media_url || '').trim();
}

function messageAlreadyStored(m) {
  return m?.media_stored === true && Boolean(String(m?.storageFileId || m?.storage_file_id || '').trim());
}

/**
 * Tenta persistir no Appwrite mídias que ainda têm URL temporária na conversa.
 * @param {unknown[]} messages
 * @param {{ academyId: string }} opts
 */
export async function rehydrateConversationMediaMessages(messages, { academyId } = {}) {
  const arr = Array.isArray(messages) ? messages : [];
  const aid = String(academyId || '').trim();
  let attempted = 0;
  let updated = 0;
  const out = [];

  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') {
      out.push(raw);
      continue;
    }
    const mediaType = messageMediaType(raw);
    const mediaUrl = messageMediaUrl(raw);
    if (!mediaType || !mediaUrl || messageAlreadyStored(raw)) {
      out.push(raw);
      continue;
    }

    attempted += 1;
    const stored = await enrichInboundMedia({
      mediaUrl,
      mimeType:
        String(raw.mimeType || raw.mime_type || '').trim() ||
        (mediaType === 'image' ? 'image/jpeg' : 'audio/ogg'),
      messageId: String(raw.message_id || '').trim(),
      academyId: aid,
    });

    if (stored.media_stored) {
      updated += 1;
      out.push({
        ...raw,
        type: mediaType,
        mediaUrl: stored.mediaUrl,
        storageFileId: stored.storageFileId,
        media_stored: true,
        mimeType: stored.mimeType || raw.mimeType || raw.mime_type || null,
      });
    } else {
      out.push(raw);
    }
  }

  return { messages: out, attempted, updated };
}

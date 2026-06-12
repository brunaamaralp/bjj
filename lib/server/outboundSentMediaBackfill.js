import { enrichInboundMedia } from './inboxMediaService.js';
import { patchAssistantMessageMedia } from './conversationsStore.js';
import {
  pickZapsterMessageCaption,
  pickZapsterMessageMediaUrl,
  pickZapsterMessageMime,
  resolveZapsterMessageForBackfill,
} from './zapsterMessagesApi.js';

const BACKFILL_RETRY_MS = [1500, 4000, 10_000];

export const OUTBOUND_PHONE_IMAGE_PLACEHOLDER = '[Imagem enviada pelo celular]';
export const OUTBOUND_PHONE_AUDIO_PLACEHOLDER = '[Áudio enviado pelo celular]';

export function isOutboundPhoneMediaPlaceholder(content) {
  const s = String(content || '');
  return (
    s.includes(OUTBOUND_PHONE_IMAGE_PLACEHOLDER) ||
    s.includes(OUTBOUND_PHONE_AUDIO_PLACEHOLDER)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultContentForType(messageType, caption) {
  const cap = String(caption || '').trim();
  if (cap && !isOutboundPhoneMediaPlaceholder(cap)) return cap;
  if (messageType === 'image') return '[imagem]';
  return '🎵 [Áudio enviado]';
}

/**
 * Após message.sent sem URL, busca mídia na Zapster e atualiza a mensagem na conversa.
 */
export async function backfillOutboundSentMedia({
  academyId,
  docId,
  messageId,
  messageType,
  instanceId,
}) {
  const aid = String(academyId || '').trim();
  const convId = String(docId || '').trim();
  const mid = String(messageId || '').trim();
  const inst = String(instanceId || '').trim();
  const mt = String(messageType || '').trim().toLowerCase() === 'image' ? 'image' : 'audio';

  if (!aid || !convId || !mid || !inst) {
    return { ok: false, reason: 'missing_params' };
  }

  const mimeDefault = mt === 'image' ? 'image/jpeg' : 'audio/ogg';

  for (let attempt = 0; attempt <= BACKFILL_RETRY_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(BACKFILL_RETRY_MS[attempt - 1]);

    const zapMsg = await resolveZapsterMessageForBackfill(inst, mid);
    const mediaUrl = pickZapsterMessageMediaUrl(zapMsg);
    if (!mediaUrl) continue;

    const mimeType = pickZapsterMessageMime(zapMsg, mimeDefault);
    const stored = await enrichInboundMedia({
      mediaUrl,
      mimeType,
      messageId: mid,
      academyId: aid,
    });

    const caption = pickZapsterMessageCaption(zapMsg);
    const content = defaultContentForType(mt, caption);

    const patch = {
      content,
      type: mt,
      mediaUrl: stored.mediaUrl,
      storageFileId: stored.storageFileId,
      media_stored: stored.media_stored,
      mimeType: stored.mimeType,
    };

    const up = await patchAssistantMessageMedia(convId, mid, patch, {
      onlyIfPlaceholder: true,
    });
    if (up.ok) {
      return {
        ok: true,
        attempt,
        media_stored: stored.media_stored === true,
        skipped: Boolean(up.skipped),
      };
    }
  }

  return { ok: false, reason: 'media_not_available' };
}

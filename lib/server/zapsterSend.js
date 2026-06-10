import { apiErro, logApiError } from './friendlyError.js';
const ZAPSTER_API_BASE_URL = process.env.ZAPSTER_API_BASE_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_TOKEN || process.env.ZAPSTER_API_TOKEN || '';

function pickMessageId(v) {
  if (!v || typeof v !== 'object') return '';
  const candidates = [v.id, v.message_id, v.wamid, v.whatsapp_message_id];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return '';
}

function safeParseJson(raw) {
  try {
    return JSON.parse(String(raw || ''));
  } catch {
    return null;
  }
}

/** @param {string} mimeType */
export function detectMediaTypeFromMime(mimeType) {
  const m = String(mimeType || '').trim().toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  return 'document';
}

/** @param {{ mediaUrl: string, mimeType?: string, caption?: string, fileName?: string }} */
export function buildZapsterMediaPayload({ mediaUrl, mimeType, caption = '', fileName = '' }) {
  const url = String(mediaUrl || '').trim();
  const mime = String(mimeType || 'image/jpeg').trim().toLowerCase();
  const media = { url };
  if (mime.startsWith('image/')) {
    const cap = String(caption || '').trim();
    if (cap) media.caption = cap;
  } else if (mime.startsWith('audio/')) {
    media.ptt = true;
  } else {
    media.fileName = String(fileName || '').trim() || 'documento.pdf';
  }
  return media;
}

async function postZapsterMessage(body) {
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const url = `${urlBase}/v1/wa/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ZAPSTER_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const raw = await resp.text();
  return { resp, raw };
}

export async function sendZapsterText({ recipient, text, instanceId }) {
  const inst = String(instanceId || '').trim();
  if (!ZAPSTER_TOKEN || !inst) {
    return { ok: false, erro: 'ZAPSTER_TOKEN/instance_id ausentes' };
  }
  const body = { recipient, text, instance_id: inst };

  try {
    const { resp, raw } = await postZapsterMessage(body);
    if (resp.ok) return { ok: true, raw };
    console.error('Zapster send failed', { status: resp.status, body: raw.slice(0, 500) });
    return { ok: false, erro: raw || `HTTP ${resp.status}` };
  } catch (e) {
    console.error('Zapster send error', { erro: apiErro(e, 'send') });
    return { ok: false, erro: apiErro(e, 'send') };
  }
}

/**
 * Envia mídia via Zapster (imagem, áudio PTT ou documento).
 * @returns {Promise<{ message_id: string|null, raw: string, data: object|null }>}
 */
export async function sendZapsterMedia({
  recipient,
  instanceId,
  mediaUrl,
  mimeType,
  caption = '',
  fileName = ''
}) {
  const inst = String(instanceId || '').trim();
  if (!ZAPSTER_TOKEN || !inst) {
    const err = new Error('ZAPSTER_TOKEN/instance_id ausentes');
    err.zapsterHttpStatus = 0;
    throw err;
  }
  const url = String(mediaUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    const err = new Error('mediaUrl inválida');
    err.zapsterHttpStatus = 0;
    throw err;
  }

  const mime = String(mimeType || 'image/jpeg').trim().toLowerCase();
  const media = buildZapsterMediaPayload({ mediaUrl: url, mimeType: mime, caption, fileName });
  const body = {
    recipient: String(recipient || '').trim(),
    instance_id: inst,
    media
  };
  const cap = String(caption || '').trim();
  if (!mime.startsWith('image/') && cap) body.text = cap;

  try {
    const { resp, raw } = await postZapsterMessage(body);
    if (!resp.ok) {
      const err = new Error(raw || `HTTP ${resp.status}`);
      err.zapsterRaw = raw;
      err.zapsterHttpStatus = resp.status;
      throw err;
    }
    const data = safeParseJson(raw);
    return { message_id: pickMessageId(data) || null, raw, data };
  } catch (e) {
    if (e?.zapsterRaw != null) throw e;
    const err = new Error(e?.message || 'Erro ao enviar mídia');
    err.zapsterHttpStatus = 0;
    throw err;
  }
}

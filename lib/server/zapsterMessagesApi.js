const ZAPSTER_API_BASE_URL =
  process.env.ZAPSTER_API_BASE_URL || process.env.ZAPSTER_API_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_API_TOKEN || process.env.ZAPSTER_TOKEN || '';

function baseUrl() {
  return String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
}

function zapsterAuthHeaders(instanceId) {
  const headers = { authorization: `Bearer ${ZAPSTER_TOKEN}` };
  const inst = String(instanceId || '').trim();
  if (inst) headers['X-Instance-ID'] = inst;
  return headers;
}

/** URL de mídia no payload Zapster (webhook ou listagem). */
export function pickZapsterMessageMediaUrl(msg) {
  if (!msg || typeof msg !== 'object') return '';
  const c = msg.content && typeof msg.content === 'object' ? msg.content : {};
  const u = String(c?.media?.url || msg?.media?.url || msg?.url || '').trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return '';
}

export function pickZapsterMessageId(msg) {
  if (!msg || typeof msg !== 'object') return '';
  const candidates = [msg.message_id, msg.wamid, msg.whatsapp_message_id, msg.id];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return '';
}

export function pickZapsterMessageMime(msg, fallback = '') {
  if (!msg || typeof msg !== 'object') return String(fallback || '').trim();
  const c = msg.content && typeof msg.content === 'object' ? msg.content : {};
  return (
    String(c?.media?.mimetype || c?.media?.mime_type || msg?.mime_type || msg?.mimeType || fallback || '').trim() ||
    String(fallback || '').trim()
  );
}

export function pickZapsterMessageCaption(msg) {
  if (!msg || typeof msg !== 'object') return '';
  const candidates = [
    msg?.content?.text,
    msg?.text,
    msg?.message?.text,
    msg?.message?.content?.text,
    msg?.caption,
    msg?.content?.caption,
  ];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return '';
}

function extractZapsterListItems(page) {
  if (!page || typeof page !== 'object') return [];
  if (Array.isArray(page.data)) return page.data;
  if (page.data && typeof page.data === 'object') {
    if (Array.isArray(page.data.messages)) return page.data.messages;
    if (Array.isArray(page.data.items)) return page.data.items;
  }
  if (Array.isArray(page.messages)) return page.messages;
  if (Array.isArray(page.items)) return page.items;
  return [];
}

function unwrapZapsterMessagePayload(data) {
  if (!data || typeof data !== 'object') return null;
  if (pickZapsterMessageId(data) || pickZapsterMessageMediaUrl(data)) return data;
  const nested = data.data ?? data.message ?? data.item;
  if (nested && typeof nested === 'object') return nested;
  return data;
}

/** GET /v1/wa/messages/{id} */
export async function fetchZapsterMessageById(instanceId, messageId) {
  const id = String(messageId || '').trim();
  const inst = String(instanceId || '').trim();
  if (!ZAPSTER_TOKEN || !id) return null;

  const url = `${baseUrl()}/v1/wa/messages/${encodeURIComponent(id)}`;
  try {
    const resp = await fetch(url, {
      headers: zapsterAuthHeaders(inst),
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    return unwrapZapsterMessagePayload(data);
  } catch {
    return null;
  }
}

async function listZapsterMessagesPage({ instanceId, fromIso, toIso, after, limit = 50 }) {
  const inst = String(instanceId || '').trim();
  if (!ZAPSTER_TOKEN || !inst) return null;
  const qs = new URLSearchParams();
  qs.set('from', fromIso);
  qs.set('to', toIso);
  qs.set('limit', String(limit));
  qs.set('instance_id', inst);
  if (after) qs.set('after', after);
  const url = `${baseUrl()}/v1/wa/messages?${qs.toString()}`;
  try {
    const resp = await fetch(url, {
      headers: zapsterAuthHeaders(inst),
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) return null;
    return await resp.json().catch(() => null);
  } catch {
    return null;
  }
}

/** Busca mensagem recente na listagem quando GET por id não está disponível. */
export async function fetchZapsterMessageFromRecentList(instanceId, messageId, { minutes = 45, maxPages = 4 } = {}) {
  const targetId = String(messageId || '').trim();
  const inst = String(instanceId || '').trim();
  if (!targetId || !inst) return null;

  const toIso = new Date().toISOString();
  const fromIso = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  let after = '';

  for (let page = 0; page < maxPages; page += 1) {
    const raw = await listZapsterMessagesPage({ instanceId: inst, fromIso, toIso, after, limit: 100 });
    if (!raw) break;
    const items = extractZapsterListItems(raw);
    for (const it of items) {
      if (pickZapsterMessageId(it) === targetId) return it;
    }
    const hasMore = Boolean(raw?.meta?.has_more);
    const nextCursor = typeof raw?.meta?.next_cursor === 'string' ? raw.meta.next_cursor : '';
    if (!hasMore || !nextCursor) break;
    after = nextCursor;
  }
  return null;
}

/** GET por id, depois listagem recente. */
export async function resolveZapsterMessageForBackfill(instanceId, messageId) {
  const id = String(messageId || '').trim();
  const inst = String(instanceId || '').trim();
  if (!id || !inst) return null;
  const direct = await fetchZapsterMessageById(inst, id);
  if (direct && pickZapsterMessageMediaUrl(direct)) return direct;
  const listed = await fetchZapsterMessageFromRecentList(inst, id);
  if (listed) return listed;
  return direct;
}

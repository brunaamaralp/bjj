import { primaryInboxPhone } from '../../src/lib/normalizeInboxPhone.js';
import { findConversationDoc } from './conversationsStore.js';
import { fetchZapsterRecipientProfile } from './zapsterRecipientProfile.js';

const AVATAR_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BATCH = 12;
const FETCH_CONCURRENCY = 4;

function avatarFresh(doc) {
  const url = String(doc?.whatsapp_profile_image_url || '').trim();
  if (!url) return false;
  const updatedAt = String(doc?.whatsapp_profile_image_updated_at || '').trim();
  if (!updatedAt) return true;
  const ms = Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms < AVATAR_FRESH_MS;
}

async function mapPool(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Resolve fotos de perfil WhatsApp para telefones da lista (cache DB + Zapster).
 * @returns {Promise<{ avatars: Record<string, string>, persists: Array<{ docId: string, payload: object }> }>}
 */
export async function resolveInboxProfileAvatars({ academyId, academyDoc, phones }) {
  const aid = String(academyId || '').trim();
  const instanceId = String(academyDoc?.zapster_instance_id || academyDoc?.zapsterInstanceId || '').trim();
  const avatars = {};
  const persists = [];

  if (!aid || !instanceId) return { avatars, persists };

  const unique = [];
  const seen = new Set();
  for (const raw of phones || []) {
    const canonical = primaryInboxPhone(raw) || String(raw || '').trim();
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    unique.push(canonical);
    if (unique.length >= MAX_BATCH) break;
  }

  const pending = [];
  for (const phone of unique) {
    const doc = await findConversationDoc(phone, aid);
    if (doc && avatarFresh(doc)) {
      avatars[phone] = String(doc.whatsapp_profile_image_url || '').trim();
      continue;
    }
    pending.push({ phone, docId: String(doc?.$id || '').trim() });
  }

  const fetched = await mapPool(pending, FETCH_CONCURRENCY, async ({ phone, docId }) => {
    const { profilePicture, name } = await fetchZapsterRecipientProfile(instanceId, phone);
    if (!profilePicture) return null;
    return { phone, docId, profilePicture, name: String(name || '').trim() };
  });

  const nowIso = new Date().toISOString();
  for (const row of fetched) {
    if (!row) continue;
    avatars[row.phone] = row.profilePicture;
    if (!row.docId) continue;
    const payload = {
      whatsapp_profile_image_url: row.profilePicture,
      whatsapp_profile_image_updated_at: nowIso,
    };
    if (row.name) {
      payload.whatsapp_profile_name = row.name;
      payload.whatsapp_profile_name_updated_at = nowIso;
    }
    persists.push({ docId: row.docId, payload });
  }

  return { avatars, persists };
}

const CACHE_TTL_MS = 60 * 1000;

/** @type {Map<string, { payload: object; fetchedAt: number }>} */
const cache = new Map();

function cacheKey(academyId, phone) {
    return `${String(academyId || '').trim()}:${String(phone || '').trim()}`;
}

export function getInboxThreadCache(academyId, phone) {
    const key = cacheKey(academyId, phone);
    if (!key.endsWith(':')) {
        const entry = cache.get(key);
        if (entry && Date.now() - entry.fetchedAt <= CACHE_TTL_MS) {
            return entry.payload;
        }
    }
    return null;
}

export function setInboxThreadCache(academyId, phone, payload) {
    const key = cacheKey(academyId, phone);
    if (!payload || key.endsWith(':')) return;
    cache.set(key, { payload, fetchedAt: Date.now() });
}

export function invalidateInboxThreadCache(academyId, phone) {
    const key = cacheKey(academyId, phone);
    if (key.endsWith(':')) return;
    cache.delete(key);
}

/**
 * Monta o estado `selected` a partir de um item da lista + entrada de cache (se houver).
 * @param {object} listItem
 * @param {object|null|undefined} prevSelected
 * @param {{ messages: unknown[], nextCursor?: string|null, summary?: object }|null} [cached]
 */
export function buildSelectedFromListItem(listItem, prevSelected, cached = null) {
    const phone = String(listItem?._phone || listItem?.phone_number || '').trim();
    const prevPhone = String(prevSelected?.phone || '').trim();
    const isSamePhone = prevPhone === phone;
    const cs = cached?.summary && typeof cached.summary === 'object' ? cached.summary : null;
    const convId =
        String(listItem?.id || '').trim() ||
        String(cs?.conversation_id || '').trim() ||
        (isSamePhone ? String(prevSelected?.conversation_id || '').trim() : '');

    const base = {
        phone,
        conversation_id: convId || null,
        summary: cs?.summary ?? (isSamePhone ? prevSelected?.summary ?? null : null),
        lead_id: cs?.lead_id ?? String(listItem?.lead_id || '').trim() || null,
        lead_name: cs?.lead_name ?? String(listItem?._leadName || listItem?.lead_name || '').trim(),
        contact_name: cs?.contact_name ?? String(listItem?._manualContactName || listItem?.contact_name || '').trim(),
        contact_name_source:
            cs?.contact_name_source ?? String(listItem?.contact_name_source || '').trim(),
        whatsapp_profile_name:
            cs?.whatsapp_profile_name ??
            String(listItem?._waProfileName || listItem?.whatsapp_profile_name || '').trim(),
        whatsapp_profile_image_url:
            cs?.whatsapp_profile_image_url ??
            String(listItem?._profileImageUrl || listItem?.whatsapp_profile_image_url || '').trim(),
        need_human: cs?.need_human ?? Boolean(listItem?._handoffActive || listItem?.need_human),
        human_handoff_until: cs?.human_handoff_until ?? (isSamePhone ? prevSelected?.human_handoff_until ?? null : null),
        ticket_status: cs?.ticket_status ?? String(listItem?._ticketStatus || listItem?.ticket_status || 'open'),
        transfer_to:
            cs?.transfer_to ?? String(listItem?._transferTo || listItem?.transfer_to || '').trim() || null,
        archived: cs?.archived ?? Boolean(listItem?._archived ?? listItem?.archived),
    };

    if (Array.isArray(cached?.messages) && cached.messages.length > 0) {
        return { ...base, messages: cached.messages };
    }

    return {
        ...base,
        messages: isSamePhone && Array.isArray(prevSelected?.messages) ? prevSelected.messages : [],
    };
}

/** Cursor/paginação derivados do cache de thread. */
export function threadPaginationFromCache(cached) {
    if (!cached) return { cursor: null, hasMore: false };
    const cursor = cached.nextCursor || null;
    return { cursor, hasMore: Boolean(cursor) };
}

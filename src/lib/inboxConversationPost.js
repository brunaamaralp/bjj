import { fetchWithBillingGuard } from './billingBlockedFetch';
import { getInboxJwt, normalizeInboxApiError, safeParseInboxJson } from './inboxApiUtils.js';

/**
 * POST /api/conversations/:phone com action no body.
 * @returns {{ blocked: boolean, ok: boolean, data: object, status: number }}
 */
export async function postInboxConversation({ phone, academyId, body, fallbackError = 'Falha na operação' }) {
  const p = String(phone || '').trim();
  const aid = String(academyId || '').trim();
  if (!p || !aid) {
    return { blocked: false, ok: false, data: {}, status: 0 };
  }
  const jwt = await getInboxJwt();
  const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations/${encodeURIComponent(p)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (blocked) return { blocked: true, ok: false, data: {}, status: 0 };
  const raw = await resp.text();
  if (!resp.ok) {
    throw new Error(normalizeInboxApiError(raw, fallbackError));
  }
  return { blocked: false, ok: true, data: safeParseInboxJson(raw) || {}, status: resp.status, raw };
}

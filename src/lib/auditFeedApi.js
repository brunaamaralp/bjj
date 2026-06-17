import { createSessionJwt } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { authedFetch } from './authInterceptor.js';

/**
 * @param {{
 *   academyId?: string,
 *   from?: string,
 *   to?: string,
 *   actor_id?: string,
 *   domain?: string,
 *   event_type?: string,
 *   lead_id?: string,
 *   cursor?: string,
 *   limit?: number,
 * }} params
 */
export async function fetchAuditFeed(params = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const aid = params.academyId || useLeadStore.getState().academyId;
  if (!aid) throw new Error('academy_required');

  const qs = new URLSearchParams({ route: 'audit-feed' });
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.actor_id) qs.set('actor_id', params.actor_id);
  if (params.domain) qs.set('domain', params.domain);
  if (params.event_type) qs.set('event_type', params.event_type);
  if (params.lead_id) qs.set('lead_id', params.lead_id);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));

  const res = await authedFetch(`/api/reports/audit-feed?${qs}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || data.error || `error_${res.status}`);
  return data;
}

import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';
import { useLeadStore } from '../store/useLeadStore.js';

/**
 * Cria nota no histórico (lead_events) e opcionalmente notifica a equipe.
 * @param {{ academyId?: string, personId: string, text: string, notifyTeam?: boolean }} opts
 */
export async function createProfileNoteApi({ academyId, personId, text, notifyTeam = false } = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const aid = String(academyId || useLeadStore.getState().academyId || '').trim();
  const pid = String(personId || '').trim();
  const note = String(text || '').trim();
  if (!aid) throw new Error('academy_required');
  if (!pid) throw new Error('person_required');
  if (!note) throw new Error('text_required');

  const res = await authedFetch('/api/leads?route=profile-note', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': aid,
    },
    body: JSON.stringify({
      lead_id: pid,
      text: note,
      notify_team: Boolean(notifyTeam),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}

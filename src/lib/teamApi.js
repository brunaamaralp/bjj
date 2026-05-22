import { createSessionJwt } from './appwrite.js';

async function teamFetch(path, options = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.erro || data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function createTeamMember(payload) {
  return teamFetch('/api/team/members', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateTeamMember(payload) {
  return teamFetch('/api/team/members', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function removeTeamMember(payload) {
  return teamFetch('/api/team/members', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export function resetTeamMemberPassword(payload) {
  return teamFetch('/api/team/members', {
    method: 'POST',
    body: JSON.stringify({ ...payload, action: 'password_reset' }),
  });
}

export function fetchTeamMemberships(academyId) {
  const q = new URLSearchParams({
    academyId: String(academyId || ''),
    list: '1',
  });
  return teamFetch(`/api/team/members?${q.toString()}`);
}

export function fetchTeamAuditEvents(academyId, { limit = 10, offset = 0 } = {}) {
  const q = new URLSearchParams({
    academyId: String(academyId || ''),
    events: '1',
    limit: String(limit),
    offset: String(offset),
  });
  return teamFetch(`/api/team/members?${q.toString()}`);
}

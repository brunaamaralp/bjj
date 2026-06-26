import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';

export class PortalApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'PortalApiError';
    this.status = status;
    this.code = code;
  }
}

async function portalFetch(route, { method = 'GET', body, query = {}, academyId } = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new PortalApiError('session_required', { status: 401, code: 'session_required' });

  const params = new URLSearchParams({ route, ...query });
  const headers = {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };
  const aid = String(academyId || '').trim();
  if (aid) headers['x-academy-id'] = aid;

  const res = await authedFetch(`/api/leads?${params.toString()}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    throw new PortalApiError(data.erro || `HTTP ${res.status}`, {
      status: res.status,
      code: data.erro,
    });
  }
  return data;
}

/** Público — ativação por token. */
export async function portalActivate(token) {
  const res = await fetch('/api/leads?route=portal-activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    throw new PortalApiError(data.erro || `HTTP ${res.status}`, { status: res.status, code: data.erro });
  }
  return data;
}

export function fetchPortalContext(opts = {}) {
  const query = {};
  if (opts.academyId) query.academy_id = opts.academyId;
  if (opts.studentId) query.student_id = opts.studentId;
  return portalFetch('portal-context', { query });
}

export function fetchPortalProfile(studentId) {
  return portalFetch('portal-profile', { query: { student_id: studentId } });
}

export function fetchPortalFinance(studentId) {
  return portalFetch('portal-finance', { query: { student_id: studentId } });
}

export function fetchPortalAttendance(studentId) {
  return portalFetch('portal-attendance', { query: { student_id: studentId } });
}

export function fetchPortalGuides({ studentId, academyId, slug } = {}) {
  const query = {};
  if (studentId) query.student_id = studentId;
  if (academyId) query.academy_id = academyId;
  if (slug) query.slug = slug;
  return portalFetch('portal-guides', { query });
}

/** Staff — convite portal */
export async function fetchPortalInviteStatus(studentId, academyId) {
  return portalFetch('portal-invite', { query: { student_id: studentId }, academyId });
}

export async function sendPortalInvite({ studentId, academyId, inviteType = 'link' }) {
  return portalFetch('portal-invite', {
    method: 'POST',
    body: { student_id: studentId, invite_type: inviteType },
    academyId,
  });
}

export async function revokePortalInvite(studentId, academyId) {
  return portalFetch('portal-invite', {
    method: 'DELETE',
    body: { student_id: studentId },
    academyId,
  });
}

export async function linkPortalSibling(studentId, academyId) {
  return portalFetch('portal-link-sibling', {
    method: 'POST',
    body: { student_id: studentId },
    academyId,
  });
}

/** Staff — CRUD guias */
export function fetchPortalGuidesManage(academyId) {
  return portalFetch('portal-guides-manage', { academyId });
}

export function createPortalGuide(academyId, payload) {
  return portalFetch('portal-guides-manage', { method: 'POST', body: payload, academyId });
}

export function updatePortalGuide(academyId, payload) {
  return portalFetch('portal-guides-manage', { method: 'PATCH', body: payload, academyId });
}

export function deletePortalGuide(academyId, id) {
  return portalFetch('portal-guides-manage', { method: 'DELETE', body: { id }, academyId });
}

export function fetchPortalContracts(studentId) {
  return portalFetch('portal-contracts', { query: { student_id: studentId } });
}

export function completePortalPasswordChange(studentId) {
  return portalFetch('portal-password', { method: 'POST', body: { student_id: studentId } });
}

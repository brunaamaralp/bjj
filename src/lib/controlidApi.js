import { createSessionJwt } from './appwrite';
import { authedFetch } from './authInterceptor.js';

const LOCAL_BASE = String(import.meta.env.VITE_CONTROLID_API_BASE || '').trim().replace(/\/+$/, '');

const ROUTE_PATH = {
  controlid_test: 'test',
  controlid_save_config: 'save-config',
  controlid_sync: 'sync',
  controlid_revoke: 'revoke',
  controlid_release: 'release',
  controlid_monitor: 'monitor',
  controlid_test_image: 'test-image',
};

function routeUrl(route) {
  if (LOCAL_BASE) {
    const path = ROUTE_PATH[route] || route.replace(/^controlid_/, '').replace(/_/g, '-');
    return `${LOCAL_BASE}/controlid/${path}`;
  }
  return `/api/leads?route=${encodeURIComponent(route)}`;
}

async function controlIdFetch(route, { method = 'POST', academyId, body } = {}) {
  const jwt = await createSessionJwt();
  const headers = {
    Authorization: `Bearer ${jwt}`,
    'x-academy-id': academyId,
  };
  if (body != null) headers['Content-Type'] = 'application/json';

  const res = await authedFetch(routeUrl(route), {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data?.sucesso !== true && data?.sucesso !== false) {
    throw new Error(data?.erro || `HTTP ${res.status}`);
  }
  return data;
}

export function testControlIdConnection(academyId, payload) {
  return controlIdFetch('controlid_test', { academyId, body: payload });
}

export function saveControlIdConfig(academyId, payload) {
  return controlIdFetch('controlid_save_config', { academyId, body: payload });
}

export function syncControlIdStudent(academyId, { leadId, photoUrl } = {}) {
  return controlIdFetch('controlid_sync', {
    academyId,
    body: { lead_id: leadId, photo_url: photoUrl },
  });
}

export function revokeControlIdStudent(academyId, { leadId } = {}) {
  return controlIdFetch('controlid_revoke', { academyId, body: { lead_id: leadId } });
}

export function releaseControlIdGate(academyId, body = {}) {
  return controlIdFetch('controlid_release', { academyId, body });
}

export function pollControlIdMonitor(academyId) {
  return controlIdFetch('controlid_monitor', { method: 'GET', academyId });
}

/** Dispara sync em background; não propaga erro. */
export function syncControlIdStudentBackground(academyId, leadId, { photoUrl } = {}) {
  void syncControlIdStudent(academyId, { leadId, photoUrl }).catch((e) => {
    console.warn('[controlid] sync background:', e?.message || e);
  });
}

import { controlIdDeviceRequest } from './controlidDevice.js';
import { decryptControlIdPassword } from './controlidCrypto.js';
import { readControlIdConfig, CONTROLID_GROUP_NAME, buildControlIdUserId } from '../controlidSettings.js';

const SESSION_TTL_MS = 5 * 60 * 1000;
const sessionCache = new Map();

function cacheKey(config) {
  return `${config.ip}:${config.port}:${config.username}`;
}

export function configWithPlainPassword(academyDoc) {
  const cfg = readControlIdConfig(academyDoc?.settings);
  if (!cfg.enabled || !cfg.ip) {
    return { ...cfg, password: '', configured: false };
  }
  let password = '';
  try {
    password = cfg.passwordEncrypted ? decryptControlIdPassword(cfg.passwordEncrypted) : '';
  } catch (e) {
    throw new Error(e?.message || 'Falha ao descriptografar senha da catraca');
  }
  return { ...cfg, password, configured: true };
}

export async function getSession(config) {
  const key = cacheKey(config);
  const hit = sessionCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.session;

  const data = await controlIdDeviceRequest(config, 'login.fcgi', {
    body: { login: config.username, password: config.password },
  });
  const session = data?.session;
  if (!session) throw new Error(data?.erro || 'Login na catraca falhou');
  sessionCache.set(key, { session, expiresAt: Date.now() + SESSION_TTL_MS });
  return session;
}

function invalidateSession(config) {
  sessionCache.delete(cacheKey(config));
}

async function authedRequest(config, endpoint, opts = {}) {
  try {
    const session = await getSession(config);
    return controlIdDeviceRequest(config, endpoint, { ...opts, session });
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('session') || msg.includes('sessão')) {
      invalidateSession(config);
      const session = await getSession(config);
      return controlIdDeviceRequest(config, endpoint, { ...opts, session });
    }
    throw e;
  }
}

export async function testConnection(config) {
  invalidateSession(config);
  const session = await getSession(config);
  const portals = await loadPortals(config, session);
  return { ok: true, session, portals };
}

export async function loadPortals(config, session) {
  const data = await controlIdDeviceRequest(config, 'load_objects.fcgi', {
    session,
    body: { object: 'portals', limit: 100 },
  });
  const list = data?.portals || [];
  return list.map((p) => ({
    id: Number(p.id),
    name: String(p.name || `Portal ${p.id}`),
  }));
}

export async function createUser(config, { userId, name }) {
  const session = await getSession(config);
  return controlIdDeviceRequest(config, 'create_objects.fcgi', {
    session,
    body: {
      object: 'users',
      values: [{
        id: userId,
        name: String(name || '').slice(0, 128),
        password: '',
        registration: String(userId),
      }],
    },
  });
}

export async function destroyUser(config, userId) {
  const session = await getSession(config);
  return controlIdDeviceRequest(config, 'destroy_objects.fcgi', {
    session,
    body: { object: 'users', ids: [userId] },
  });
}

export async function setUserPhoto(config, { userId, photoBytes }) {
  const session = await getSession(config);
  const ts = Math.floor(Date.now() / 1000);
  return controlIdDeviceRequest(config, 'user_set_image.fcgi', {
    session,
    query: { user_id: userId, timestamp: ts, match: 0 },
    contentType: 'application/octet-stream',
    rawBody: photoBytes,
  });
}

export async function testUserImage(config, { userId, photoBytes }) {
  const session = await getSession(config);
  const ts = Math.floor(Date.now() / 1000);
  return controlIdDeviceRequest(config, 'user_test_image.fcgi', {
    session,
    query: { user_id: userId, timestamp: ts },
    contentType: 'application/octet-stream',
    rawBody: photoBytes,
  });
}

async function loadOrCreateGroup(config, session) {
  const loaded = await controlIdDeviceRequest(config, 'load_objects.fcgi', {
    session,
    body: { object: 'groups', where: `name = "${CONTROLID_GROUP_NAME}"`, limit: 1 },
  });
  const existing = loaded?.groups?.[0];
  if (existing?.id != null) return Number(existing.id);

  const groupId = 9001;
  await controlIdDeviceRequest(config, 'create_objects.fcgi', {
    session,
    body: {
      object: 'groups',
      values: [{ id: groupId, name: CONTROLID_GROUP_NAME }],
    },
  });
  return groupId;
}

async function ensureUserInGroup(config, session, userId, groupId) {
  const links = await controlIdDeviceRequest(config, 'load_objects.fcgi', {
    session,
    body: {
      object: 'user_groups',
      where: `user_id = ${userId} AND group_id = ${groupId}`,
      limit: 1,
    },
  });
  if (links?.user_groups?.length) return;
  await controlIdDeviceRequest(config, 'create_objects.fcgi', {
    session,
    body: {
      object: 'user_groups',
      values: [{ user_id: userId, group_id: groupId }],
    },
  });
}

async function ensurePortalAccess(config, session, groupId) {
  const portalId = Number(config.portal_id) || 1;
  const ruleName = `Nave portal ${portalId}`;

  const rules = await controlIdDeviceRequest(config, 'load_objects.fcgi', {
    session,
    body: { object: 'access_rules', where: `name = "${ruleName}"`, limit: 1 },
  });
  let ruleId = rules?.access_rules?.[0]?.id;
  if (ruleId == null) {
    ruleId = 8000 + portalId;
    await controlIdDeviceRequest(config, 'create_objects.fcgi', {
      session,
      body: {
        object: 'access_rules',
        values: [{ id: ruleId, name: ruleName, type: 1 }],
      },
    });
  }

  const gar = await controlIdDeviceRequest(config, 'load_objects.fcgi', {
    session,
    body: {
      object: 'group_access_rules',
      where: `group_id = ${groupId} AND access_rule_id = ${ruleId}`,
      limit: 1,
    },
  });
  if (!gar?.group_access_rules?.length) {
    await controlIdDeviceRequest(config, 'create_objects.fcgi', {
      session,
      body: {
        object: 'group_access_rules',
        values: [{ group_id: groupId, access_rule_id: ruleId }],
      },
    });
  }

  const par = await controlIdDeviceRequest(config, 'load_objects.fcgi', {
    session,
    body: {
      object: 'portal_access_rules',
      where: `portal_id = ${portalId} AND access_rule_id = ${ruleId}`,
      limit: 1,
    },
  });
  if (!par?.portal_access_rules?.length) {
    await controlIdDeviceRequest(config, 'create_objects.fcgi', {
      session,
      body: {
        object: 'portal_access_rules',
        values: [{ portal_id: portalId, access_rule_id: ruleId }],
      },
    });
  }
}

export async function grantAccess(config, { userId }) {
  const session = await getSession(config);
  const groupId = await loadOrCreateGroup(config, session);
  await ensureUserInGroup(config, session, userId, groupId);
  await ensurePortalAccess(config, session, groupId);
}

export async function releaseGate(config, { reason } = {}) {
  const session = await getSession(config);
  const releaseReason = String(reason || '').trim().slice(0, 500) || 'Liberação manual — recepção';
  return controlIdDeviceRequest(config, 'access_release.fcgi', {
    session,
    body: {
      reason: releaseReason,
      send_to_all: false,
      portal_id: Number(config.portal_id) || 1,
    },
  });
}

/**
 * Long-poll monitor (até ~30s no relay).
 * @returns {Array<object>}
 */
export async function pollAccessEvents(config, { timeoutMs = 28000 } = {}) {
  const session = await getSession(config);
  const data = await controlIdDeviceRequest(config, 'monitor.fcgi', {
    session,
    body: { monitor_types: ['access'] },
    timeoutMs: Math.min(timeoutMs + 2000, 35000),
  });
  const events = data?.events || data?.access_events || [];
  return Array.isArray(events) ? events : [];
}

export async function downloadPhoto(photoUrl) {
  const url = String(photoUrl || '').trim();
  if (!url) throw new Error('photo_url ausente');
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Falha ao baixar foto (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function syncStudentOnDevice(config, { leadDoc, photoUrl }) {
  const userId =
    Number(leadDoc?.controlid_user_id) > 0
      ? Math.trunc(Number(leadDoc.controlid_user_id))
      : buildControlIdUserId(leadDoc.$id);

  await createUser(config, { userId, name: leadDoc.name || `Aluno ${userId}` });

  const url = photoUrl || leadDoc.photo_url || leadDoc.photoUrl;
  if (url) {
    const bytes = await downloadPhoto(url);
    const photoResult = await setUserPhoto(config, { userId, photoBytes: bytes });
    if (photoResult?.success === false) {
      const errs = photoResult?.errors || photoResult?.erro;
      throw new Error(
        Array.isArray(errs) ? errs.join('; ') : String(errs || 'Foto rejeitada pela catraca')
      );
    }
  }

  await grantAccess(config, { userId });
  return { userId };
}

export { buildControlIdUserId };

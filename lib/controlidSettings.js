/**
 * Configuração Control iD em academy.settings (JSON).
 */

import { clampEntryCooldownMinutes } from './controlidCooldown.js';

export const CONTROLID_GROUP_NAME = 'Nave Alunos';

/** Remove barras finais; vazio se entrada inválida. */
export function normalizeRelayUrl(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  return s;
}

/** @returns {string|null} mensagem de erro ou null se válido (vazio é válido) */
export function validateRelayUrl(raw) {
  const n = normalizeRelayUrl(raw);
  if (!n) return null;
  try {
    const u = new URL(n);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return 'URL do servidor deve começar com http:// ou https://';
    }
    if (!u.hostname) return 'URL do servidor inválida';
    return null;
  } catch {
    return 'URL do servidor inválida';
  }
}

export function parseAcademySettings(raw) {
  if (!raw) return {};
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

export function readControlIdConfig(settings) {
  const s = parseAcademySettings(settings);
  const c = s?.controlid;
  if (!c || typeof c !== 'object') {
    return {
      enabled: false,
      ip: '',
      port: 80,
      username: 'admin',
      passwordEncrypted: '',
      portal_id: 1,
      relay_url: '',
      last_sync: '',
      entry_cooldown_minutes: 0,
      block_overdue_access: false,
    };
  }
  const port = Number(c.port);
  return {
    enabled: c.enabled === true,
    ip: String(c.ip || '').trim(),
    port: Number.isFinite(port) && port > 0 ? Math.trunc(port) : 80,
    username: String(c.username || 'admin').trim() || 'admin',
    passwordEncrypted: String(c.password || c.passwordEncrypted || '').trim(),
    portal_id: Number(c.portal_id) > 0 ? Math.trunc(Number(c.portal_id)) : 1,
    relay_url: normalizeRelayUrl(c.relay_url || ''),
    last_sync: String(c.last_sync || c.lastSync || '').trim(),
    entry_cooldown_minutes: clampEntryCooldownMinutes(c.entry_cooldown_minutes),
    block_overdue_access: c.block_overdue_access === true,
  };
}

export function mergeControlIdIntoSettings(settings, controlidPatch) {
  const base = parseAcademySettings(settings);
  const prev = readControlIdConfig(base);
  const next = { ...prev, ...controlidPatch };
  return {
    ...base,
    controlid: {
      enabled: next.enabled === true,
      ip: String(next.ip || '').trim(),
      port: next.port || 80,
      username: String(next.username || 'admin').trim() || 'admin',
      password: String(next.passwordEncrypted || next.password || '').trim(),
      portal_id: Number(next.portal_id) > 0 ? Math.trunc(Number(next.portal_id)) : 1,
      relay_url: normalizeRelayUrl(next.relay_url ?? prev.relay_url ?? ''),
      last_sync: String(next.last_sync ?? prev.last_sync ?? '').trim(),
      entry_cooldown_minutes: clampEntryCooldownMinutes(
        next.entry_cooldown_minutes ?? prev.entry_cooldown_minutes ?? 0
      ),
      block_overdue_access: next.block_overdue_access === true,
    },
  };
}

/** ID numérico estável para o usuário na catraca (a partir do $id Appwrite). */
export function buildControlIdUserId(appwriteId) {
  const hex = String(appwriteId || '').slice(-8);
  return Math.abs(parseInt(hex, 16)) % 99999 + 1;
}

export function resolveControlIdUserId(leadDoc) {
  const explicit = Number(leadDoc?.controlid_user_id ?? leadDoc?.controlidUserId);
  if (Number.isFinite(explicit) && explicit > 0) return Math.trunc(explicit);
  const legacy = Number(leadDoc?.device_id);
  if (Number.isFinite(legacy) && legacy > 0) return Math.trunc(legacy);
  if (leadDoc?.$id) return buildControlIdUserId(leadDoc.$id);
  return null;
}

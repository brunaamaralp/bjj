import { parseAcademySettings } from './stockSettings.js';
import { normalizeExperimentalAudienceRules } from './publicExperimentalAudience.js';

export const PUBLIC_EXPERIMENTAL_ORIGIN = 'Experimental online';

/** @typedef {{ enabled?: boolean, salt?: string, audienceRules?: Record<string, string[]> }} PublicExperimentalConfig */

export function generateExperimentalSalt() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '');
    }
  } catch {
    void 0;
  }
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}${s4()}${s4()}${s4()}${s4()}${s4()}${s4()}`;
}

/**
 * @param {unknown} settingsRaw
 * @returns {PublicExperimentalConfig}
 */
export function readPublicExperimental(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings?.publicExperimental;
  if (!raw || typeof raw !== 'object') {
    return { enabled: false, salt: '', audienceRules: normalizeExperimentalAudienceRules(null) };
  }
  return {
    enabled: raw.enabled === true,
    salt: String(raw.salt || '').trim(),
    audienceRules: normalizeExperimentalAudienceRules(raw.audienceRules),
  };
}

/**
 * @param {unknown} settingsRaw
 * @param {PublicExperimentalConfig} patch
 */
export function mergePublicExperimentalIntoSettings(settingsRaw, patch) {
  const base = parseAcademySettings(settingsRaw);
  const prev = readPublicExperimental(settingsRaw);
  return {
    ...base,
    publicExperimental: {
      enabled: patch.enabled !== undefined ? patch.enabled === true : prev.enabled,
      salt: patch.salt !== undefined ? String(patch.salt ?? '').trim() : prev.salt,
      audienceRules:
        patch.audienceRules !== undefined
          ? normalizeExperimentalAudienceRules(patch.audienceRules)
          : prev.audienceRules,
    },
  };
}

export function buildPublicExperimentalPath(token) {
  const t = encodeURIComponent(String(token || '').trim());
  return `/experimental/${t}`;
}

export function buildPublicExperimentalUrl(token, baseUrl) {
  const path = buildPublicExperimentalPath(token);
  const base = String(baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')).trim();
  if (!base) return path;
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * @param {{ name?: string, settings?: unknown }} academyDoc
 */
export function buildPublicExperimentalFormConfig(academyDoc) {
  const cfg = readPublicExperimental(academyDoc?.settings);
  return {
    enabled: cfg.enabled === true && Boolean(cfg.salt),
    academyName: String(academyDoc?.name || academyDoc?.academyName || 'Academia').trim() || 'Academia',
    audienceRules: cfg.audienceRules,
  };
}

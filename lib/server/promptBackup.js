import crypto from 'crypto';

/**
 * Snapshot imutável do prompt anterior ao save.
 * @typedef {{ savedAt: string; intro: string; body: string; suffix: string; hash: string }} PromptBackupSnapshot
 */

export function hashPromptSnapshot(intro, body, suffix = '') {
  const payload = `${String(intro || '')}\n---\n${String(body || '')}\n---\n${String(suffix || '')}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

/**
 * @param {string} intro
 * @param {string} body
 * @param {string} [suffix]
 * @returns {string} JSON
 */
export function buildPromptBackupSnapshot(intro, body, suffix = '') {
  const snap = {
    savedAt: new Date().toISOString(),
    intro: String(intro || ''),
    body: String(body || ''),
    suffix: String(suffix || ''),
    hash: hashPromptSnapshot(intro, body, suffix),
  };
  return JSON.stringify(snap);
}

/**
 * @param {unknown} rawSnapshot
 * @param {string} [legacyIntro]
 * @param {string} [legacyBody]
 * @param {string} [legacySuffix]
 * @returns {PromptBackupSnapshot | null}
 */
export function parsePromptBackupSnapshot(rawSnapshot, legacyIntro = '', legacyBody = '', legacySuffix = '') {
  if (rawSnapshot != null && String(rawSnapshot).trim()) {
    try {
      const p = typeof rawSnapshot === 'string' ? JSON.parse(rawSnapshot) : rawSnapshot;
      if (p && typeof p === 'object') {
        return {
          savedAt: String(p.savedAt || '').trim() || new Date(0).toISOString(),
          intro: String(p.intro || '').trim(),
          body: String(p.body || '').trim(),
          suffix: String(p.suffix ?? '').trim(),
          hash: String(p.hash || '').trim(),
        };
      }
    } catch {
      void 0;
    }
  }
  const intro = String(legacyIntro || '').trim();
  const body = String(legacyBody || '').trim();
  const suffix = String(legacySuffix || '').trim();
  if (!intro && !body && !suffix) return null;
  return {
    savedAt: new Date(0).toISOString(),
    intro,
    body,
    suffix,
    hash: hashPromptSnapshot(intro, body, suffix),
  };
}

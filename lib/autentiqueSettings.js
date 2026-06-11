/**
 * Configuração Autentique em academy.settings (JSON).
 */

export function parseAcademySettings(raw) {
  if (!raw) return {};
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

export function readAutentiqueConfig(settings) {
  const s = parseAcademySettings(settings);
  const c = s?.autentique;
  if (!c || typeof c !== 'object') {
    return {
      enabled: false,
      token_encrypted: '',
      account_email: '',
    };
  }
  return {
    enabled: c.enabled === true,
    token_encrypted: String(c.token_encrypted || c.tokenEncrypted || c.token || '').trim(),
    account_email: String(c.account_email || c.accountEmail || '').trim(),
  };
}

export function mergeAutentiqueIntoSettings(settings, autentiquePatch) {
  const base = parseAcademySettings(settings);
  const prev = readAutentiqueConfig(base);
  const next = { ...prev, ...autentiquePatch };
  return {
    ...base,
    autentique: {
      enabled: next.enabled === true,
      token_encrypted: String(next.token_encrypted || next.tokenEncrypted || '').trim(),
      account_email: String(next.account_email || '').trim(),
    },
  };
}

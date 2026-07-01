/**
 * Configuração PagBank em academy.settings (JSON) — credenciais criptografadas.
 * Campos operacionais (pagbank_enabled, pagbank_max_retries) permanecem top-level no schema.
 */

import { parseAcademySettings } from './autentiqueSettings.js';

export function readPagbankConfig(settings) {
  const s = parseAcademySettings(settings);
  const c = s?.pagbank;
  if (!c || typeof c !== 'object') {
    return {
      token_encrypted: '',
      webhook_secret_encrypted: '',
    };
  }
  return {
    token_encrypted: String(c.token_encrypted || c.tokenEncrypted || '').trim(),
    webhook_secret_encrypted: String(
      c.webhook_secret_encrypted || c.webhookSecretEncrypted || ''
    ).trim(),
  };
}

export function mergePagbankIntoSettings(settings, pagbankPatch) {
  const base = parseAcademySettings(settings);
  const prev = readPagbankConfig(base);
  const next = { ...prev, ...pagbankPatch };
  return {
    ...base,
    pagbank: {
      token_encrypted: String(next.token_encrypted || next.tokenEncrypted || '').trim(),
      webhook_secret_encrypted: String(
        next.webhook_secret_encrypted || next.webhookSecretEncrypted || ''
      ).trim(),
    },
  };
}

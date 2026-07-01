import { decryptPagbankToken, decryptPagbankWebhookSecret } from './pagbankCrypto.js';
import { readPagbankConfig } from '../pagbankSettings.js';

/**
 * Lê token e webhook secret descriptografados a partir do documento da academia.
 * Credenciais ficam em settings.pagbank (JSON); sem fallback para texto puro legado.
 */
export function readPagbankSecretsFromAcademyDoc(doc) {
  if (!doc || typeof doc !== 'object') {
    return { token: '', webhookSecret: '' };
  }

  const cfg = readPagbankConfig(doc.settings);
  let token = '';
  let webhookSecret = '';

  if (cfg.token_encrypted) {
    try {
      token = decryptPagbankToken(cfg.token_encrypted).trim();
    } catch {
      token = '';
    }
  }

  if (cfg.webhook_secret_encrypted) {
    try {
      webhookSecret = decryptPagbankWebhookSecret(cfg.webhook_secret_encrypted).trim();
    } catch {
      webhookSecret = '';
    }
  }

  return { token, webhookSecret };
}

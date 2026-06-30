import { databases, DB_ID, ACADEMIES_COL } from './academyAccess.js';

/**
 * Busca e valida credenciais PagBank de uma academia (multi-tenant).
 * @param {string} academyId
 * @returns {Promise<{ token: string, publicKey: string, webhookSecret: string }>}
 */
export async function getPagbankCredentials(academyId) {
  const id = String(academyId || '').trim();
  if (!id || !ACADEMIES_COL || !DB_ID) {
    throw new Error('pagbank_academy_not_found');
  }

  let doc;
  try {
    doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
  } catch {
    throw new Error('pagbank_academy_not_found');
  }

  if (doc.pagbank_enabled !== true) {
    throw new Error('pagbank_not_enabled');
  }

  const token = String(doc.pagbank_token || '').trim();
  if (!token) {
    throw new Error('pagbank_token_missing');
  }

  return {
    token,
    publicKey: String(doc.pagbank_public_key || '').trim(),
    webhookSecret: String(doc.pagbank_webhook_secret || '').trim(),
  };
}

/**
 * Secret de webhook por academia (sem exigir enabled/token — usado na validação inbound).
 * @param {string} academyId
 * @returns {Promise<string>}
 */
export async function getPagbankWebhookSecret(academyId) {
  const id = String(academyId || '').trim();
  if (!id || !ACADEMIES_COL || !DB_ID) return '';

  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
    return String(doc.pagbank_webhook_secret || '').trim();
  } catch {
    return '';
  }
}

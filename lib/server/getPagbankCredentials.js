import { databases, DB_ID, ACADEMIES_COL } from './academyAccess.js';
import { readPagbankSecretsFromAcademyDoc } from './pagbankCredentialsFromDoc.js';

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

  const { token, webhookSecret } = readPagbankSecretsFromAcademyDoc(doc);
  if (!token) {
    throw new Error('pagbank_token_missing');
  }

  return {
    token,
    publicKey: String(doc.pagbank_public_key || '').trim(),
    webhookSecret,
  };
}

/**
 * Secret de webhook por academia (sem exigir enabled/token — usado na validação inbound).
 * @param {string} academyId
 * @returns {Promise<string>}
 */
export async function getPagbankWebhookSecret(academyId) {
  const doc = await getPagbankAcademyDocument(academyId);
  if (!doc) return '';
  const { webhookSecret } = readPagbankSecretsFromAcademyDoc(doc);
  return webhookSecret;
}

/**
 * Documento completo da academia (webhook — lê pagbank_max_retries sem chamada PagBank).
 * @param {string} academyId
 * @returns {Promise<object|null>}
 */
export async function getPagbankAcademyDocument(academyId) {
  const id = String(academyId || '').trim();
  if (!id || !ACADEMIES_COL || !DB_ID) return null;

  try {
    return await databases.getDocument(DB_ID, ACADEMIES_COL, id);
  } catch {
    return null;
  }
}

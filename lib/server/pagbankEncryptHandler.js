import crypto from 'crypto';
import { getPagbankCredentials } from './getPagbankCredentials.js';
import { resolvePagbankRequestAuth } from './pagbankRequestAuth.js';

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { error: 'invalid_json' };
    }
  }
  if (!body || typeof body !== 'object') {
    return { error: 'invalid_json' };
  }
  return { body };
}

/**
 * PagBank retorna public_key como base64 SPKI (sem headers PEM).
 * Aceita também PEM já formatado armazenado na academia.
 */
export function normalizePagbankPublicKey(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/BEGIN PUBLIC KEY/.test(trimmed)) return trimmed;
  const b64 = trimmed.replace(/\s/g, '');
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

export function validateCardFields(body) {
  const missing = [];
  const number = String(body?.number ?? '').replace(/\D/g, '');
  const exp_month = String(body?.exp_month ?? '').trim();
  const exp_year = String(body?.exp_year ?? '').trim();
  const security_code = String(body?.security_code ?? '').replace(/\D/g, '');
  const holder_name = String(body?.holder_name ?? '').trim();

  if (!number) missing.push('number');
  if (!exp_month) missing.push('exp_month');
  if (!exp_year) missing.push('exp_year');
  if (!security_code) missing.push('security_code');
  if (!holder_name) missing.push('holder_name');

  if (missing.length) {
    return { error: 'missing_fields', fields: missing };
  }

  const monthNum = Number(exp_month);
  if (!/^\d{2}$/.test(exp_month) || monthNum < 1 || monthNum > 12) {
    return { error: 'missing_fields', fields: ['exp_month'] };
  }

  const yearNum = Number(exp_year);
  if (!/^\d{4}$/.test(exp_year) || yearNum < 2026 || yearNum > 2040) {
    return { error: 'missing_fields', fields: ['exp_year'] };
  }

  if (!/^\d{3,4}$/.test(security_code)) {
    return { error: 'missing_fields', fields: ['security_code'] };
  }

  return {
    number,
    exp_month,
    exp_year,
    security_code,
    holder_name,
  };
}

export function encryptCardWithPublicKey(publicKey, card) {
  const pem = normalizePagbankPublicKey(publicKey);
  const cardPayload = JSON.stringify({
    number: card.number,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    security_code: card.security_code,
    holder: { name: card.holder_name },
  });

  return crypto
    .publicEncrypt(
      {
        key: pem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(cardPayload)
    )
    .toString('base64');
}

export default async function pagbankEncryptHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const auth = await resolvePagbankRequestAuth(req, res);
  if (!auth) return;
  const { academyId } = auth;

  const parsed = parseJsonBody(req);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const validated = validateCardFields(parsed.body);
  if (validated.error) {
    return res.status(400).json({ error: validated.error, fields: validated.fields });
  }

  let publicKey;
  try {
    ({ publicKey } = await getPagbankCredentials(academyId));
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === 'pagbank_not_enabled') {
      return res.status(403).json({ error: 'pagbank_not_enabled' });
    }
    if (msg === 'pagbank_token_missing') {
      return res.status(503).json({ error: 'pagbank_not_configured' });
    }
    console.error('[pagbankEncryptHandler] credentials_error academy:', academyId, msg);
    return res.status(500).json({ error: 'credentials_error' });
  }

  if (!publicKey) {
    return res.status(503).json({ error: 'pagbank_not_configured' });
  }

  let encryptedCard;
  try {
    encryptedCard = encryptCardWithPublicKey(publicKey, validated);
  } catch (e) {
    console.error('[pagbankEncryptHandler] encryption failed academy:', academyId, e?.message || e);
    return res.status(422).json({ error: 'encryption_failed', detail: 'invalid_public_key' });
  }

  return res.status(200).json({ encrypted_card: encryptedCard });
}

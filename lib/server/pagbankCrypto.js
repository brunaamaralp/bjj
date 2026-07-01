import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function encryptionKey() {
  const raw = String(process.env.PAGBANK_ENCRYPTION_KEY || '').trim();
  if (raw.length < 32) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

function missingKeyError() {
  return new Error('PAGBANK_ENCRYPTION_KEY ausente ou curta (mín. 32 caracteres)');
}

export function encryptPagbankSecret(plain) {
  const text = String(plain || '');
  if (!text) return '';
  const key = encryptionKey();
  if (!key) throw missingKeyError();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptPagbankSecret(encrypted) {
  const blob = String(encrypted || '').trim();
  if (!blob) return '';
  const key = encryptionKey();
  if (!key) throw missingKeyError();
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_LEN + 16 + 1) throw new Error('Segredo PagBank criptografado inválido');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const data = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const encryptPagbankToken = encryptPagbankSecret;
export const decryptPagbankToken = decryptPagbankSecret;
export const encryptPagbankWebhookSecret = encryptPagbankSecret;
export const decryptPagbankWebhookSecret = decryptPagbankSecret;

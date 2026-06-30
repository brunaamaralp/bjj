import crypto from 'crypto';

const PORTAL_JWT_PURPOSE = 'pagbank_card_enrollment';

export function getPortalJwtSecret() {
  return String(
    process.env.PAGBANK_PORTAL_JWT_SECRET ||
      process.env.ENROLLMENT_LINK_SECRET ||
      process.env.PUBLIC_ENROLLMENT_SECRET ||
      process.env.JWT_SECRET ||
      ''
  ).trim();
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(String(str || ''), 'base64url');
}

function signSegment(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Assina JWT HS256 para portal do aluno (sem dependência externa).
 * @param {Record<string, unknown>} payload
 * @param {string} secret
 */
export function signPortalJwt(payload, secret) {
  const sec = String(secret || '').trim();
  if (!sec) throw new Error('portal_jwt_secret_missing');

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signature = signSegment(data, sec);
  return `${data}.${signature}`;
}

/**
 * @returns {Record<string, unknown>}
 */
export function verifyPortalJwt(token, secret) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3) throw new Error('invalid_portal_token');

  const sec = String(secret || '').trim();
  if (!sec) throw new Error('portal_jwt_secret_missing');

  const data = `${parts[0]}.${parts[1]}`;
  const expectedSig = signSegment(data, sec);
  const sigBuf = Buffer.from(parts[2]);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('invalid_portal_token');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  } catch {
    throw new Error('invalid_portal_token');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('invalid_portal_token');
  }

  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    throw new Error('token_expired');
  }

  if (payload.purpose !== PORTAL_JWT_PURPOSE) {
    throw new Error('invalid_token_purpose');
  }

  return payload;
}

export { PORTAL_JWT_PURPOSE };

const ENROLL_PREFIX = 'nave-enroll:v1:';

function bytesToBase64Url(bytes) {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i]);
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(arr).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  try {
    const binary =
      typeof atob === 'function'
        ? atob(b64 + pad)
        : Buffer.from(b64 + pad, 'base64').toString('binary');
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function timingSafeEqualBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(message, secret) {
  const enc = new TextEncoder();
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('crypto_unavailable');
  const key = await subtle.importKey(
    'raw',
    enc.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await subtle.sign('HMAC', key, enc.encode(String(message || '')));
  return new Uint8Array(sig);
}

/**
 * @param {string} academyId
 * @param {string} salt
 * @param {string} secret
 */
export async function createPublicEnrollmentToken(academyId, salt, secret) {
  const aid = String(academyId || '').trim();
  const s = String(salt || '').trim();
  if (!aid || !s || !secret) return '';
  const textEnc = new TextEncoder();
  const sig = await hmacSha256(`${ENROLL_PREFIX}${aid}:${s}`, secret);
  const sigShort = sig.slice(0, 18);
  return `${bytesToBase64Url(textEnc.encode(aid))}.${bytesToBase64Url(textEnc.encode(s))}.${bytesToBase64Url(sigShort)}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<{ academyId: string, salt: string } | null>}
 */
export async function verifyPublicEnrollmentToken(token, secret) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3 || !secret) return null;

  const academyBytes = base64UrlToBytes(parts[0]);
  const saltBytes = base64UrlToBytes(parts[1]);
  const sigBytes = base64UrlToBytes(parts[2]);
  if (!academyBytes || !saltBytes || !sigBytes) return null;

  const academyId = new TextDecoder().decode(academyBytes).trim();
  const salt = new TextDecoder().decode(saltBytes).trim();
  if (!academyId || !salt) return null;

  const expected = await hmacSha256(`${ENROLL_PREFIX}${academyId}:${salt}`, secret);
  const expectedShort = expected.slice(0, 18);
  if (!timingSafeEqualBytes(sigBytes, expectedShort)) return null;

  return { academyId, salt };
}

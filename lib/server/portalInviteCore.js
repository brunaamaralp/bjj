import { createHash, randomBytes, randomInt } from 'node:crypto';

export function generateInviteToken() {
  return randomBytes(32).toString('base64url');
}

export function hashInviteToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function buildActivationUrl(token) {
  const fromEnv =
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  const base = String(fromEnv || '').replace(/\/$/, '');
  if (!base) return `/portal/ativar/${encodeURIComponent(token)}`;
  return `${base}/portal/ativar/${encodeURIComponent(token)}`;
}

export function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}

export function inviteExpiresAt(days = 7) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

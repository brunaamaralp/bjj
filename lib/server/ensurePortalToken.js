import { getPortalJwtSecret, verifyPortalJwt } from './portalJwt.js';

function readPortalToken(req) {
  const header = String(req?.headers?.['x-portal-token'] || req?.headers?.['X-Portal-Token'] || '').trim();
  if (header) return header;

  let body = req?.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (body && typeof body === 'object') {
    return String(body.portal_token || '').trim();
  }
  return '';
}

/**
 * Verifica JWT do portal do aluno.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse | null} res — se null, não escreve na response
 * @returns {Promise<{ payload: object | null, error: string | null, hadToken: boolean }>}
 */
export async function ensurePortalToken(req, res) {
  const token = readPortalToken(req);
  if (!token) {
    if (res) {
      res.status(401).json({ error: 'portal_token_required' });
    }
    return { payload: null, error: 'portal_token_required', hadToken: false };
  }

  const secret = getPortalJwtSecret();
  if (!secret) {
    console.error('[ensurePortalToken] portal JWT secret not configured');
    if (res) {
      res.status(503).json({ error: 'server_misconfigured' });
    }
    return { payload: null, error: 'server_misconfigured', hadToken: true };
  }

  try {
    const payload = verifyPortalJwt(token, secret);
    return { payload, error: null, hadToken: true };
  } catch (e) {
    const msg = String(e?.message || e);
    let error = 'invalid_portal_token';
    if (msg === 'token_expired') error = 'token_expired';
    else if (msg === 'invalid_token_purpose') error = 'invalid_token_purpose';

    console.warn('[ensurePortalToken] invalid token');
    if (res) {
      res.status(401).json({ error });
    }
    return { payload: null, error, hadToken: true };
  }
}

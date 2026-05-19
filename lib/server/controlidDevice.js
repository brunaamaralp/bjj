/**
 * HTTP para o equipamento Control iD (direto ou via relay local).
 * Vercel não alcança a LAN — use CONTROLID_RELAY_URL apontando para server/index.js.
 */

const DEVICE_TIMEOUT_MS = 5000;

function deviceBaseUrl(config) {
  const ip = String(config?.ip || '').trim();
  const port = Number(config?.port) > 0 ? Math.trunc(Number(config.port)) : 80;
  if (!ip) throw new Error('IP da catraca não configurado');
  return { ip, port, base: `http://${ip}:${port}` };
}

function relayUrl() {
  return String(process.env.CONTROLID_RELAY_URL || '').trim().replace(/\/+$/, '');
}

function relaySecret() {
  return String(process.env.CONTROLID_RELAY_SECRET || process.env.INTERNAL_API_SECRET || '').trim();
}

/**
 * @param {object} config — ip, port, username, password (plain)
 * @param {string} endpoint — ex. login.fcgi
 * @param {object} [opts]
 * @param {object} [opts.body]
 * @param {string} [opts.session]
 * @param {Record<string,string>} [opts.query]
 * @param {string} [opts.contentType]
 * @param {ArrayBuffer|Buffer|Uint8Array} [opts.rawBody]
 * @param {number} [opts.timeoutMs]
 */
export async function controlIdDeviceRequest(config, endpoint, opts = {}) {
  const { ip, port, base } = deviceBaseUrl(config);
  const path = String(endpoint || '').replace(/^\//, '');
  const q = new URLSearchParams();
  if (opts.session) q.set('session', opts.session);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null && v !== '') q.set(k, String(v));
    }
  }
  const qs = q.toString();
  const targetPath = qs ? `${path}?${qs}` : path;

  const relay = relayUrl();
  const timeoutMs = opts.timeoutMs ?? DEVICE_TIMEOUT_MS;

  if (relay) {
    const secret = relaySecret();
    const headers = { 'Content-Type': 'application/json' };
    if (secret) headers['x-controlid-relay-secret'] = secret;

    const relayBody = {
      ip,
      port,
      endpoint: targetPath,
      body: opts.rawBody ? null : (opts.body ?? {}),
      session: null,
      contentType: opts.contentType || 'application/json',
      rawBodyBase64: opts.rawBody
        ? Buffer.from(opts.rawBody).toString('base64')
        : undefined,
    };

    const res = await fetch(`${relay}/controlid-proxy`, {
      method: 'POST',
      headers,
      body: JSON.stringify(relayBody),
      signal: AbortSignal.timeout(timeoutMs + 2000),
    });

    if (res.status === 502) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.erro || 'Catraca inacessível via relay');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.erro || `Relay HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    const buf = await res.arrayBuffer();
    try {
      return JSON.parse(Buffer.from(buf).toString('utf8'));
    } catch {
      return { raw: Buffer.from(buf) };
    }
  }

  const url = `${base}/${targetPath}`;
  const headers = {};
  let body;
  if (opts.rawBody) {
    headers['Content-Type'] = opts.contentType || 'application/octet-stream';
    body = opts.rawBody;
  } else {
    headers['Content-Type'] = opts.contentType || 'application/json';
    body = JSON.stringify(opts.body ?? {});
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
    return { raw: text };
  }
}

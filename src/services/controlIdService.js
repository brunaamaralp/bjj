// Em dev, o Vite proxy roteia /controlid-proxy → localhost:4000 (server/index.js).
// Em produção, defina VITE_CONTROLID_PROXY_BASE=http://localhost:4000/controlid-proxy
// no .env — o browser do gerente acessa localhost:4000 localmente.
const PROXY = import.meta.env.VITE_CONTROLID_PROXY_BASE ?? '/controlid-proxy';

// Cache de session em memória (por aba). Re-login é rápido, não precisa persistir.
let _session = null;
let _sessionExpiresAt = 0;
let _sessionIp = null;

const SESSION_TTL_MS = 25 * 60 * 1000; // 25 min (device expira ~30 min)

function isSessionValid(ip) {
  return _session && _sessionIp === ip && Date.now() < _sessionExpiresAt;
}

function cacheSession(ip, session) {
  _session = session;
  _sessionIp = ip;
  _sessionExpiresAt = Date.now() + SESSION_TTL_MS;
}

function invalidateSession() {
  _session = null;
  _sessionExpiresAt = 0;
  _sessionIp = null;
}

// Toda comunicação com o dispositivo passa pelo proxy local (server/index.js).
// Isso resolve CORS: o browser chama localhost:4000, que repassa ao IP do equipamento.
async function proxyRequest(ip, endpoint, body, session, { port = 80, contentType, rawBodyBase64 } = {}) {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ip,
      port,
      endpoint: session ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}session=${session}` : endpoint,
      body: rawBodyBase64 ? null : (body ?? {}),
      contentType: contentType || 'application/json',
      rawBodyBase64,
    }),
  });

  if (res.status === 502) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.erro || 'Equipamento inacessível (verifique o IP e se o proxy está rodando)');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.erro || `Proxy erro HTTP ${res.status}`);
  }
  return res.json();
}

export async function login(ip, username = 'admin', password = 'admin', port = 80) {
  const data = await proxyRequest(ip, 'login.fcgi', { login: username, password }, null, { port });
  if (!data.session) throw new Error('Equipamento não retornou session');
  cacheSession(ip, data.session);
  return data.session;
}

async function getSession(ip, username, password, port) {
  if (isSessionValid(ip)) return _session;
  return login(ip, username, password, port);
}

// Executa uma requisição autenticada; faz re-login automático se a session expirou.
async function request(ip, username, password, endpoint, body, opts = {}) {
  const port = opts.port ?? 80;
  const session = await getSession(ip, username, password, port);
  const data = await proxyRequest(ip, endpoint, body, session, { port, ...opts });

  // Control iD retorna { erro: ... } com HTTP 200 quando a session é inválida
  if (data?.erro && String(data.erro).toLowerCase().includes('session')) {
    invalidateSession();
    const newSession = await login(ip, username, password, port);
    return proxyRequest(ip, endpoint, body, newSession, { port, ...opts });
  }

  return data;
}

export async function testConnection(ip, username, password, port = 80) {
  try {
    await login(ip, username, password, port);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Cria usuário no equipamento. student.device_id deve ser um inteiro.
export async function pushUser(ip, username, password, student) {
  return request(ip, username, password, 'create_objects.fcgi', {
    object: 'users',
    values: [{
      id: student.device_id,
      name: student.name,
      registration: student.cpf || String(student.device_id),
    }],
  });
}

export async function removeDeviceUser(ip, username, password, deviceId) {
  return request(ip, username, password, 'destroy_objects.fcgi', {
    object: 'users',
    where: `id = ${deviceId}`,
  });
}

// Busca logs de acesso. since = timestamp JS em ms (ex: Date.now())
export async function getAccessLogs(ip, username, password, { since, limit = 500 } = {}) {
  const body = { object: 'access_logs', limit, order: 'time ASC' };
  if (since) {
    // Control iD usa unix timestamp em segundos
    body.where = `time >= ${Math.floor(since / 1000)}`;
  }
  return request(ip, username, password, 'load_objects.fcgi', body);
}

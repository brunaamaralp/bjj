import { Client, Databases, Account, Teams, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { assertBillingActive, sendBillingGateError } from './billingGate.js';
import { findZapsterInstanceForAcademy, normalizeWaInstancesList } from './zapsterInstanceLookup.js';
import { extractPhoneFromZapsterInstance, normalizeWaPhoneDigits } from '../zapsterInstancePhone.js';

const ZAPSTER_API_BASE_URL = process.env.ZAPSTER_API_BASE_URL || process.env.ZAPSTER_API_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_API_TOKEN || process.env.ZAPSTER_TOKEN || '';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configura\u00e7\u00e3o Appwrite ausente' });
    return false;
  }
  if (!ZAPSTER_TOKEN) {
    res.status(500).json({ sucesso: false, erro: 'ZAPSTER_API_TOKEN ausente' });
    return false;
  }
  return true;
}


async function getAcademyByInstanceId(instanceId) {
  const inst = String(instanceId || '').trim();
  if (!inst) return null;
  try {
    const list = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
      Query.equal('zapster_instance_id', [inst]),
      Query.limit(1)
    ]);
    const doc = list?.documents?.[0];
    if (doc) {
      if (String(doc.status || '').trim().toLowerCase() === 'inactive') return null;
      return doc;
    }

    const list2 = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
      Query.equal('zapsterInstanceId', [inst]),
      Query.limit(1)
    ]);
    const doc2 = list2?.documents?.[0] || null;
    if (doc2 && String(doc2.status || '').trim().toLowerCase() === 'inactive') return null;
    return doc2;
  } catch (e) {
    console.error('[zapsterInstances] getAcademyByInstanceId falhou:', inst, e?.message || e);
    return null;
  }
}

function baseUrl() {
  return String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
}

const ZAPSTER_TIMEOUT_FRIENDLY = 'Zapster não respondeu. Tente novamente em alguns instantes.';

function isZapsterTimeoutError(e) {
  const name = String(e?.name || '').trim();
  const msg = String(e?.message || '').trim().toLowerCase();
  return name === 'TimeoutError' || name === 'AbortError' || msg.includes('timeout') || msg === 'zapster_timeout';
}

/** @param {string} url @param {RequestInit} init @param {number} timeoutMs */
async function zapsterFetch(url, init = {}, timeoutMs = 10000) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (isZapsterTimeoutError(e)) {
      const err = new Error('zapster_timeout');
      err.cause = e;
      throw err;
    }
    throw e;
  }
}

function academyDocZapsterStatus(doc) {
  return String(doc?.zapster_status || '').trim();
}

function academyCachedWaPhone(doc) {
  return normalizeWaPhoneDigits(doc?.wa_phone || '');
}

async function fetchZapsterInstanceProfilePhone(instanceId) {
  const id = String(instanceId || '').trim();
  if (!id) return '';
  const suffixes = ['/profile', '/details'];
  for (const suffix of suffixes) {
    try {
      const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(id)}${suffix}`;
      const resp = await zapsterFetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } }, 8000);
      const raw = await resp.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!resp.ok) continue;
      const phone = extractPhoneFromZapsterInstance(data);
      if (phone) return phone;
    } catch {
      continue;
    }
  }
  return '';
}

async function resolveInstanceWaPhone(zapsterData, instanceId) {
  let phone = extractPhoneFromZapsterInstance(zapsterData);
  if (!phone && instanceId) {
    phone = await fetchZapsterInstanceProfilePhone(instanceId);
  }
  return phone;
}

async function persistAcademyWaPhone(academyId, phone, status) {
  const ph = normalizeWaPhoneDigits(phone);
  if (!ph || String(status || '').trim().toLowerCase() !== 'connected') return;
  try {
    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
      wa_phone: ph.slice(0, 32),
      wa_phone_updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[zapsterInstances] persist wa_phone:', e?.message || e);
  }
}

const ZAPSTER_ERROR_MESSAGES = {
  max_instances_reached:
    'Limite de dispositivos atingido nesta conta Zapster. Entre em contato com o suporte ou remova uma inst\u00e2ncia n\u00e3o usada.',
  unauthorized:
    'Token de acesso ao WhatsApp (Zapster) inv\u00e1lido ou expirado. Verifique ZAPSTER_API_TOKEN no servidor.',
  instance_already_exists:
    'Este dispositivo j\u00e1 est\u00e1 registrado na Zapster. Tente reconectar ou remova a inst\u00e2ncia antiga antes de criar outra.',
  invalid_webhook_url:
    'URL de webhook inv\u00e1lida ou inacess\u00edvel para a Zapster. Verifique o dom\u00ednio p\u00fablico do servidor e a rota /api/webhook/zapster.',
  default: 'N\u00e3o foi poss\u00edvel conectar o dispositivo. Tente novamente em instantes.'
};

function collectZapsterErrorText(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  const parts = [];
  if (Array.isArray(data.errors)) {
    for (const err of data.errors) {
      if (!err || typeof err !== 'object') continue;
      const code = String(err.code || err.type || '').trim();
      const msg = String(err.message || err.detail || '').trim();
      if (code) parts.push(code);
      if (msg) parts.push(msg);
    }
  }
  if (typeof data.message === 'string' && data.message.trim()) parts.push(data.message);
  if (typeof data.error === 'string' && data.error.trim()) parts.push(data.error);
  return parts.join(' ').trim();
}

function getZapsterErrorMessage(rawBody, parsedJson, status) {
  const rawStr = String(rawBody || '');
  const fromJson = collectZapsterErrorText(parsedJson).toLowerCase();
  const text = `${rawStr.toLowerCase()} ${fromJson}`.trim();

  console.error('[zapster] erro original (mapeamento):', {
    status,
    body: rawStr.slice(0, 500),
  });

  if (status === 429) {
    return 'Muitas tentativas. Aguarde alguns segundos e tente novamente.';
  }

  const instanceLimitPhrases = [
    'max_instances',
    'max instances',
    'max_instances_reached',
    'maximum instances',
    'instance limit exceeded',
    'too many instances',
    'instances_limit',
    'instance_limit',
    'quota of instances',
    'device limit',
    'limite de inst\u00e2ncia',
    'limite de inst\u00e2ncias',
  ];
  if (instanceLimitPhrases.some((p) => text.includes(p))) {
    return ZAPSTER_ERROR_MESSAGES.max_instances_reached;
  }

  if (status === 401 || status === 403) {
    return ZAPSTER_ERROR_MESSAGES.unauthorized;
  }

  if (
    text.includes('already_exists') ||
    text.includes('already exists') ||
    text.includes('duplicate') ||
    text.includes('unique constraint')
  ) {
    return ZAPSTER_ERROR_MESSAGES.instance_already_exists;
  }

  if (text.includes('webhook') || text.includes('callback_url') || text.includes('callback url')) {
    return ZAPSTER_ERROR_MESSAGES.invalid_webhook_url;
  }

  if (text.includes('rate_limit') || text.includes('rate limit') || text.includes('too many requests')) {
    return 'Muitas tentativas. Aguarde alguns segundos e tente novamente.';
  }

  if (text.includes('zapster_timeout')) {
    return ZAPSTER_TIMEOUT_FRIENDLY;
  }

  console.error('[zapster] erro n\u00e3o mapeado:', { status, body: rawStr.slice(0, 300) });
  return `N\u00e3o foi poss\u00edvel conectar o dispositivo (${status || '\u2014'}). Tente novamente.`;
}

/** @param {{ ok: boolean; status: number; data: unknown; raw: string }} z */
function getZapsterCreateFriendlyError(z) {
  return getZapsterErrorMessage(z.raw, z.data, z.status || 0);
}

async function zapsterCreateInstance({ name, metadata, webhooks, host }) {
  const url = `${baseUrl()}/v1/wa/instances`;
  const body = {
    connection_type: 'unofficial',
    ...(name ? { name } : {}),
    ...(metadata ? { metadata } : {})
  };
  void webhooks;
  let resp;
  let raw = '';
  try {
    resp = await zapsterFetch(
      url,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${ZAPSTER_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      },
      15000
    );
    raw = await resp.text();
  } catch (e) {
    console.error('[zapsterInstances] zapsterCreateInstance erro de rede/fetch', {
      zapsterUrl: url,
      erro: e?.message || e
    });
    if (isZapsterTimeoutError(e)) throw new Error('zapster_timeout');
    throw new Error('Falha de rede ao criar instância na Zapster');
  }
  if (!resp.ok) {
    let headerObj = {};
    try {
      headerObj = Object.fromEntries(resp.headers.entries());
    } catch {
      void 0;
    }
    console.error('[zapsterInstances] erro real do Zapster (POST /v1/wa/instances):', {
      status: resp.status,
      body: raw.slice(0, 500),
      headers: headerObj,
    });
  }
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  if (resp.ok) {
    const instanceId = String(data?.id || '').trim();
    let webhooksRegistered = false;
    if (instanceId && String(host || '').trim()) {
      try {
        await registerInstanceWebhooks(instanceId, host, metadata?.academy_id || metadata?.academyId || '');
        webhooksRegistered = true;
      } catch (e) {
        console.error('[zapsterInstances] create: falha ao registrar webhooks via endpoint dedicado', {
          instanceId,
          erro: e?.message || e
        });
      }
    } else if (instanceId) {
      console.error('[zapsterInstances] create: host ausente, não foi possível registrar webhooks após criação', {
        instanceId
      });
    }
    return { ok: true, status: resp.status, data, raw, webhooksRegistered };
  }

  return { ok: resp.ok, status: resp.status, data, raw };
}

async function zapsterGetInstance(id) {
  const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(String(id))}`;
  const resp = await zapsterFetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } }, 10000);
  const raw = await resp.text();
  try {
    const data = JSON.parse(raw);
    return { ok: resp.ok, status: resp.status, data, raw };
  } catch {
    return { ok: resp.ok, status: resp.status, data: null, raw };
  }
}

/**
 * Se a Zapster devolver o QR no JSON da inst\u00e2ncia (data URL ou base64 PNG), envia image/png.
 * @returns {boolean} true se respondeu 200 com imagem
 */
function tryRespondWithQrFromInstancePayload(res, data) {
  if (!data || typeof data !== 'object') return false;
  const qr = data.qrcode ?? data.qr_code ?? data.base64;
  if (qr == null || typeof qr !== 'string') return false;
  const s = qr.trim();
  if (!s) return false;
  const dataUrl = /^data:image\/\w+;base64,(.+)$/i.exec(s);
  if (dataUrl) {
    try {
      const buf = Buffer.from(dataUrl[1], 'base64');
      if (buf.length > 64) {
        res.setHeader('Content-Type', 'image/png');
        res.status(200).send(buf);
        return true;
      }
    } catch {
      return false;
    }
  }
  try {
    const buf = Buffer.from(s, 'base64');
    if (buf.length > 64 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      res.setHeader('Content-Type', 'image/png');
      res.status(200).send(buf);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function instanceStatusLower(data) {
  return String(data?.status || '').trim().toLowerCase();
}

async function zapsterFetchQrPngResponse(idParam) {
  const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(idParam)}/qrcode`;
  return zapsterFetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } }, 10000);
}

/**
 * Obt\u00e9m PNG do QR; se a inst\u00e2ncia estiver offline/desconectada, tenta power-on e restart antes de desistir.
 * @returns {Promise<{ ok: true, png: Buffer } | { ok: false, resp: import('node-fetch').Response, z: { ok: boolean, data: object|null } }>}
 */
export async function zapsterResolveQrPng(idParam) {
  const tryOnce = async () => {
    const resp = await zapsterFetchQrPngResponse(idParam);
    if (resp.status === 200) {
      return { ok: true, png: Buffer.from(await resp.arrayBuffer()) };
    }
    const z = await zapsterGetInstance(idParam);
    const st = z.ok ? instanceStatusLower(z.data) : '';
    return { ok: false, resp, st, z };
  };

  let attempt = await tryOnce();
  if (attempt.ok) return attempt;
  if (attempt.st === 'connected') return attempt;

  if (attempt.st === 'offline') {
    await zapsterPower(idParam, 'power-on');
    await delayMs(2500);
    attempt = await tryOnce();
    if (attempt.ok) return attempt;
    if (attempt.st === 'connected') return attempt;
  }

  const shouldRestart =
    attempt.st !== 'connected' &&
    (['offline', 'disconnected', 'unknown', 'error', 'failed', ''].includes(attempt.st) ||
      Number(attempt.resp?.status) === 406);

  if (shouldRestart) {
    await zapsterPower(idParam, 'restart');
    await delayMs(3500);
    for (let i = 0; i < 4; i++) {
      attempt = await tryOnce();
      if (attempt.ok) return attempt;
      if (attempt.st === 'connected') return attempt;
      await delayMs(2000);
    }
  }

  return attempt;
}

/** Lista inst\u00e2ncias da conta (usado em recover). Formato da API pode variar. */
async function zapsterListInstances() {
  const url = `${baseUrl()}/v1/wa/instances`;
  const resp = await zapsterFetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } }, 10000);
  const raw = await resp.text();
  try {
    const data = JSON.parse(raw);
    return { ok: resp.ok, status: resp.status, data, raw };
  } catch {
    return { ok: resp.ok, status: resp.status, data: null, raw };
  }
}

/** @param {unknown} data */
function normalizeWaInstancesListLegacy(data) {
  return normalizeWaInstancesList(data);
}

/**
 * @param {string} academyId
 * @param {string} instanceId
 * @param {number} [attempt]
 */
async function persistInstanceId(academyId, instanceId, attempt = 0) {
  const id = String(instanceId || '').trim();
  if (!id) return false;
  if (attempt === 0) persistInstanceId._lastPersistError = undefined;
  try {
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        zapster_instance_id: id
      });
    } catch (e1) {
      console.error('[zapsterInstances] primeiro updateDocument (zapster_instance_id) falhou:', e1);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { zapster_instance_id: id });
    }
    console.log('[zapsterInstances] id persistido com sucesso:', id);
    return true;
  } catch (err) {
    persistInstanceId._lastPersistError = err;
    console.error('[zapsterInstances] falha ao persistir id (tentativa', attempt + 1, '):', err);
    if (err && typeof err === 'object') {
      console.error('[zapsterInstances] detalhe Appwrite (persist):', {
        message: err.message,
        code: err.code,
        type: err.type,
        response: err.response
      });
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return persistInstanceId(academyId, id, attempt + 1);
    }
    return false;
  }
}

async function zapsterDeleteInstance(id) {
  const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(String(id))}`;
  const resp = await zapsterFetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } }, 15000);
  const raw = await resp.text();
  return { ok: resp.ok, status: resp.status, raw };
}

async function clearAcademyInstanceLink(academyId) {
  try {
    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { zapster_instance_id: '' });
    return true;
  } catch (errPrimary) {
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { zapsterInstanceId: '' });
      return true;
    } catch (errSecondary) {
      console.error('[zapsterInstances] falha ao limpar vínculo da instância:', {
        academyId,
        primary: errPrimary?.message || errPrimary,
        secondary: errSecondary?.message || errSecondary
      });
      return false;
    }
  }
}

async function zapsterPower(id, action) {
  const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(id)}/${action}`;
  const resp = await zapsterFetch(url, { method: 'POST', headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } }, 15000);
  const raw = await resp.text();
  return { ok: resp.status === 204, status: resp.status, raw };
}

/** Eventos ao criar/registrar webhook (doc Zapster; `instance.status` não é enum válido). */
export const ZAPSTER_INSTANCE_WEBHOOK_EVENTS = [
  'message.received',
  'instance.qrcode',
  'instance.connected',
  'instance.disconnected'
];

/**
 * Monta a URL pública do webhook Nave (/api/webhook/zapster) a partir do host/origin da app.
 * @param {string} host Ou hostname (prod.com) ou origin completo (https://prod.com)
 */
export function buildWebhookAbsoluteUrl(host, academyId = '') {
  let h = String(host || '').trim();
  if (!h) throw new Error('Host ausente para montar URL do webhook');
  h = h.split(',')[0].trim();
  let origin = h.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(origin)) {
    origin = `https://${origin.replace(/\/+$/, '')}`;
  }
  const token = String(process.env.ZAPSTER_WEBHOOK_TOKEN || '').trim();
  const path = `/api/webhook/zapster`;
  const aid = String(academyId || '').trim();
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (aid) params.set('academyId', aid);
  const query = params.toString();
  return query ? `${origin}${path}?${query}` : `${origin}${path}`;
}

/** Mesmo formato usado em `settings.webhooks` no POST /v1/wa/instances (criação). */
function buildSettingsWebhooksArray(webhookUrl) {
  return [{ url: webhookUrl, events: [...ZAPSTER_INSTANCE_WEBHOOK_EVENTS] }];
}

function getWebhookTarget(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'https';
  const host =
    String(req.headers.host || '').trim() ||
    String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (!host) {
    console.error('[zapsterInstances] host ausente — webhook URL não pode ser gerada');
    return '';
  }
  return buildWebhookAbsoluteUrl(`${proto}://${host}`);
}

function isLocalhostHost(v) {
  const h = String(v || '').trim().toLowerCase();
  return h.startsWith('localhost') || h.startsWith('127.0.0.1') || h.startsWith('[::1]');
}

function chooseWebhookHost(req, bodyHost) {
  const fwdHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  const hdrHost = String(req.headers.host || '').trim();
  const fromBody = String(bodyHost || '').trim();

  // Em produção, nunca priorizar host local vindo do browser (ex.: localhost:5174).
  if (fwdHost && !isLocalhostHost(fwdHost)) return fwdHost;
  if (hdrHost && !isLocalhostHost(hdrHost)) return hdrHost;
  if (fromBody && !isLocalhostHost(fromBody)) return fromBody;

  // Fallback para ambiente local/dev.
  return fromBody || fwdHost || hdrHost;
}

/**
 * Registra webhook na Zapster para uma instância já existente (POST /v1/wa/instances/:id/webhooks).
 * Equivalente ao registro incluído em `settings.webhooks` na criação, via endpoint dedicado à instância.
 * @returns {Promise<{ sucesso: true }>}
 */
export async function registerInstanceWebhooks(instanceId, host, academyId = '') {
  const id = String(instanceId || '').trim();
  if (!id) throw new Error('instanceId obrigat\u00f3rio');
  const webhookUrl = buildWebhookAbsoluteUrl(host, academyId);
  const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(id)}/webhooks`;
  const body = {
    url: webhookUrl,
    enabled: true,
    events: [...ZAPSTER_INSTANCE_WEBHOOK_EVENTS],
    name: 'Nave CRM webhook'
  };
  let resp;
  let raw = '';
  try {
    resp = await zapsterFetch(
      url,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${ZAPSTER_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      },
      10000
    );
    raw = await resp.text();
  } catch (e) {
    console.error('[zapsterInstances] registerInstanceWebhooks erro de rede/fetch', {
      instanceId: id,
      webhookUrl,
      zapsterUrl: url,
      erro: e?.message || e
    });
    if (isZapsterTimeoutError(e)) throw new Error('zapster_timeout');
    throw new Error('Falha de rede ao registrar webhook na Zapster');
  }
  if (resp.status === 201 || resp.status === 200 || resp.status === 204) {
    console.log('[zapsterInstances] webhooks registrados:', id, webhookUrl);
    return { sucesso: true };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    void 0;
  }
  const detail = collectZapsterErrorText(parsed) || raw.slice(0, 500);
  const msg = detail.trim() ? detail : `HTTP ${resp.status}`;
  if (String(detail || '').toLowerCase().includes('max_instance_webhooks')) {
    console.warn('[zapsterInstances] limite de webhooks por instância atingido; seguindo sem falha', {
      instanceId: id,
      webhookUrl
    });
    return { sucesso: true, alreadyAtLimit: true };
  }
  console.error('[zapsterInstances] registerInstanceWebhooks falhou', { status: resp.status, body: raw.slice(0, 400) });
  throw new Error(msg || 'Falha ao registrar webhooks na Zapster');
}

function academyLinkedInstanceId(doc) {
  return String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
}

/** @returns {boolean} false se j\u00e1 enviou resposta 403 */
function ensureInstanceBelongsToAcademy(doc, instanceIdParam, res) {
  const expected = academyLinkedInstanceId(doc);
  const got = String(instanceIdParam || '').trim();
  if (!expected || expected !== got) {
    res.status(403).json({ sucesso: false, erro: 'Sem permiss\u00e3o para acessar este dispositivo' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (!ensureConfigOk(res)) return;

  const action = String(req.query?.action || '').trim().toLowerCase();
  const idParam = String(req.query?.id || '').trim();

  const me = await ensureAuth(req, res);
  if (!me) return;
  const ctx = await ensureAcademyAccess(req, res, me);
  if (!ctx) return;
  const { academyId, doc } = ctx;

  /** Só Appwrite — vínculo órfão (Zapster sem instância). Não exige billing ativo. */
  if (req.method === 'POST' && action === 'clear-local-link') {
    const cleared = await clearAcademyInstanceLink(academyId);
    if (!cleared) {
      return res.status(500).json({ sucesso: false, erro: 'Falha ao limpar v\u00ednculo da inst\u00e2ncia' });
    }
    return res.status(200).json({ sucesso: true });
  }

  /** Registro dedicado de webhook; não exige billing ativo. */
  if (req.method === 'POST' && action === 'register-webhooks') {
    let parsedBody =
      req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof req.body === 'string') {
      try {
        parsedBody = JSON.parse(req.body);
      } catch {
        parsedBody = {};
      }
    }
    const instanceIdBody = String(
      parsedBody.instanceId || parsedBody.instance_id || idParam || ''
    ).trim();
    if (!instanceIdBody) {
      return res.status(400).json({
        sucesso: false,
        erro: 'instanceId ausente no body ou query'
      });
    }
    if (!ensureInstanceBelongsToAcademy(doc, instanceIdBody, res)) return;
    const hostForWebhook = chooseWebhookHost(req, parsedBody.host);
    if (!hostForWebhook) {
      return res.status(400).json({
        sucesso: false,
        erro: 'N\u00e3o foi poss\u00edvel determinar o host para a URL do webhook'
      });
    }
    try {
      await registerInstanceWebhooks(instanceIdBody, hostForWebhook, academyId);
      return res.status(200).json({ sucesso: true, instanceId: instanceIdBody });
    } catch (e) {
      console.error('[zapsterInstances] handler register-webhooks catch', {
        instanceId: instanceIdBody,
        hostForWebhook,
        erro: e?.message || e
      });
      const msg =
        typeof e?.message === 'string' && e.message.trim()
          ? e.message.trim()
          : 'Falha ao registrar webhooks';
      return res.status(502).json({
        sucesso: false,
        erro: msg
      });
    }
  }

  if (req.method === 'POST' || req.method === 'DELETE') {
    try {
      await assertBillingActive(academyId);
    } catch (e) {
      if (sendBillingGateError(res, e)) return;
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
    }
  }

  if (req.method === 'GET') {
    if (action === 'qrcode') {
      if (!idParam) return res.status(400).json({ sucesso: false, erro: 'id ausente' });

      const linkedOnSession = academyLinkedInstanceId(doc);
      const academyByInst = linkedOnSession === idParam ? doc : await getAcademyByInstanceId(idParam);
      if (!academyByInst) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Inst\u00e2ncia n\u00e3o vinculada a nenhuma academia',
          codigo: 'ZAPSTER_INSTANCE_NOT_LINKED',
          detalhe:
            'Nenhum documento de academia com este zapster_instance_id no Appwrite, ou o ID n\u00e3o confere com a academia selecionada. Confira o campo na academia, use \u201cRecuperar v\u00ednculo\u201d ou crie uma nova inst\u00e2ncia.'
        });
      }

      // Verifica se o usu\u00e1rio tem acesso \u00e0 academia dona da inst\u00e2ncia
      // Sobrescrevendo o academyId do header para validar o dono real
      req.headers['x-academy-id'] = academyByInst.$id;
      const authorized = await ensureAcademyAccess(req, res, me);
      if (!authorized) return; // ensureAcademyAccess j\u00e1 enviou 403

      try {
        const resolved = await zapsterResolveQrPng(idParam);
        if (resolved.ok) {
          res.setHeader('Content-Type', 'image/png');
          res.status(200).send(resolved.png);
          return;
        }

        // Instância já conectada — Zapster retorna 406 nesse cenário.
        // Respondemos com HTTP 200 + JSON específico para que o frontend
        // trate como "dispositivo conectado" em vez de exibir erro de rede.
        if (resolved.st === 'connected') {
          console.log('[zapsterInstances] qrcode: instância já conectada, retornando status=connected', { instanceId: idParam });
          return res.status(200).json({
            sucesso: false,
            codigo: 'INSTANCE_CONNECTED',
            status: 'connected',
            erro: 'O dispositivo já está conectado. Não há QR code disponível no momento.',
          });
        }

        const z = resolved.z;
        if (z?.ok && z.data && tryRespondWithQrFromInstancePayload(res, z.data)) {
          return;
        }
        const resp = resolved.resp;
        const rawStatus = Number(resp?.status) || 500;
        let text = '';
        try {
          text = await resp.text();
        } catch {
          void 0;
        }
        console.error('[zapsterInstances] qrcode: falha ao obter QR', {
          instanceId: idParam,
          httpStatus: rawStatus,
          instanceStatus: resolved.st,
          body: text.slice(0, 300),
        });
        const httpStatus = rawStatus;
        try {
          const jsonBody = JSON.parse(text);
          const errCode = String(jsonBody?.errors?.[0]?.code || '').trim();
          const errMsg = String(jsonBody?.errors?.[0]?.message || '').trim() || 'QR indisponível';
          return res.status(httpStatus).json({
            sucesso: false,
            erro: errMsg,
            codigo: errCode || (httpStatus === 406 ? 'qrcode_unavailable' : undefined),
            detalhe:
              resolved.st === 'offline'
                ? 'A instância está pausada. Aguarde alguns segundos e tente “Exibir código QR” ou “Reiniciar conexão” novamente.'
                : undefined
          });
        } catch {
          return res.status(httpStatus).json({ sucesso: false, erro: text || 'QR indisponível' });
        }
      } catch (e) {
        const msg = isZapsterTimeoutError(e) ? ZAPSTER_TIMEOUT_FRIENDLY : e?.message || 'Erro ao obter QR';
        console.error('[zapsterInstances] qrcode: exceção inesperada', { instanceId: idParam, erro: msg });
        return res.status(500).json({ sucesso: false, erro: msg, codigo: isZapsterTimeoutError(e) ? 'zapster_timeout' : undefined });
      }
    }
    if (action === 'get') {
      if (!idParam) return res.status(400).json({ sucesso: false, erro: 'id ausente' });

      const linkedGet = academyLinkedInstanceId(doc);
      const academyByInst = linkedGet === idParam ? doc : await getAcademyByInstanceId(idParam);
      if (!academyByInst) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Inst\u00e2ncia n\u00e3o vinculada a nenhuma academia',
          codigo: 'ZAPSTER_INSTANCE_NOT_LINKED'
        });
      }

      req.headers['x-academy-id'] = academyByInst.$id;
      const authorized = await ensureAcademyAccess(req, res, me);
      if (!authorized) return;

      try {
        const z = await zapsterGetInstance(idParam);
        if (!z.ok) return res.status(404).json({ sucesso: false, erro: 'Inst\u00e2ncia n\u00e3o encontrada' });
        const status = String(z.data?.status || '').trim() || 'unknown';
        const qrcode = z.data?.qrcode ?? null;
        let wa_phone = await resolveInstanceWaPhone(z.data, idParam);
        if (!wa_phone) wa_phone = academyCachedWaPhone(academyByInst);
        if (wa_phone && status === 'connected') {
          void persistAcademyWaPhone(academyByInst.$id, wa_phone, status);
        }
        return res.status(200).json({
          sucesso: true,
          instance_id: idParam,
          status,
          qrcode,
          wa_phone: wa_phone || null,
        });
      } catch (e) {
        return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao consultar inst\u00e2ncia' });
      }
    }
    if (action === 'recover') {
      try {
        const current = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
        if (current) {
          const live = await zapsterGetInstance(current);
          if (live.ok) {
            return res.status(200).json({ sucesso: true, recovered: false, already_linked: true, instance_id: current });
          }
          console.warn('[zapsterInstances] recover: id salvo inválido na Zapster, tentando listagem', {
            academyId,
            staleInstanceIdPrefix: current.slice(0, 8),
            httpStatus: live.status || null
          });
        }
        const listed = await zapsterListInstances();
        if (!listed.ok) {
          console.warn('[zapsterInstances] recover: listagem Zapster falhou', { status: listed.status, raw: String(listed.raw || '').slice(0, 200) });
          return res.status(200).json({
            sucesso: true,
            recovered: false,
            erro:
              'N\u00e3o foi poss\u00edvel listar inst\u00e2ncias na Zapster (endpoint pode n\u00e3o existir nesta vers\u00e3o da API). Verifique o ID no Appwrite ou crie de novo.'
          });
        }
        const items = normalizeWaInstancesList(listed.data);
        const match = items.find((it) => String(it.metadataAcademyId || '').trim() === academyId);
        if (!match?.id) {
          return res.status(200).json({
            sucesso: true,
            recovered: false,
            erro: 'Nenhuma inst\u00e2ncia com esta academia foi encontrada na Zapster.'
          });
        }
        const ok = await persistInstanceId(academyId, match.id);
        if (!ok) {
          return res.status(200).json({
            sucesso: true,
            recovered: false,
            erro: 'Inst\u00e2ncia encontrada na Zapster, mas falhou ao salvar no Appwrite ap\u00f3s novas tentativas.'
          });
        }
        return res.status(200).json({ sucesso: true, recovered: true, instance_id: match.id });
      } catch (e) {
        return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao recuperar inst\u00e2ncia' });
      }
    }
    try {
      const inst = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
      const docStatus = academyDocZapsterStatus(doc);
      if (!inst) {
        return res.status(200).json({
          sucesso: true,
          instance_id: null,
          status: 'disconnected',
          qrcode: null,
          zapster_status: docStatus || 'disconnected'
        });
      }
      const z = await zapsterGetInstance(inst);
      if (!z.ok) {
        return res.status(200).json({
          sucesso: true,
          instance_id: inst,
          status: 'unknown',
          qrcode: null,
          zapster_status: docStatus || 'unknown'
        });
      }
      const status = String(z.data?.status || '').trim() || 'unknown';
      const qrcode = z.data?.qrcode ?? null;
      let wa_phone = await resolveInstanceWaPhone(z.data, inst);
      if (!wa_phone) wa_phone = academyCachedWaPhone(doc);
      let zapsterStatus = docStatus || status;
      if (status === 'connected' && zapsterStatus !== 'connected') {
        try {
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
            zapster_status: 'connected',
            zapster_status_updated_at: new Date().toISOString(),
          });
          zapsterStatus = 'connected';
        } catch {
          void 0;
        }
      }
      if (wa_phone && status === 'connected') {
        void persistAcademyWaPhone(academyId, wa_phone, status);
      }
      return res.status(200).json({
        sucesso: true,
        instance_id: inst,
        status,
        qrcode,
        zapster_status: zapsterStatus,
        wa_phone: wa_phone || null,
      });
    } catch (e) {
      const msg = isZapsterTimeoutError(e) ? ZAPSTER_TIMEOUT_FRIENDLY : e?.message || 'Erro ao consultar inst\u00e2ncia';
      return res.status(500).json({ sucesso: false, erro: msg, codigo: isZapsterTimeoutError(e) ? 'zapster_timeout' : undefined });
    }
  }

  if (req.method === 'POST') {
    if (action === 'power-on' || action === 'power-off' || action === 'restart') {
      if (!idParam) return res.status(400).json({ sucesso: false, erro: 'id ausente' });
      const current = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
      if (current && current !== idParam) {
        return res.status(403).json({ sucesso: false, erro: 'Inst\u00e2ncia n\u00e3o pertence a esta academia' });
      }
      try {
        const z = await zapsterPower(idParam, action);
        if (!z.ok) return res.status(z.status || 500).json({ sucesso: false, erro: z.raw || 'Falha' });
        return res.status(204).end();
      } catch (e) {
        return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro' });
      }
    }
    try {
      const name = String(req.body?.name || '').trim() || `CRM-${academyId.slice(0, 6)}`;
      const metadata = { academy_id: academyId };
      const webhookUrl = getWebhookTarget(req);
      const hostFromBody = String(req.body?.host || '').trim();
      const z = await zapsterCreateInstance({
        name,
        metadata,
        webhooks: buildSettingsWebhooksArray(webhookUrl),
        host: chooseWebhookHost(req, hostFromBody)
      });
      if (!z.ok) {
        const upstream = Number(z.status) || 500;
        const isLimitOrConflict =
          upstream === 401 || upstream === 403 || upstream === 409 ||
          String(z.raw || '').toLowerCase().includes('max_instances') ||
          String(z.raw || '').toLowerCase().includes('instance') ||
          String(z.raw || '').toLowerCase().includes('limit') ||
          String(z.raw || '').toLowerCase().includes('already');
        if (isLimitOrConflict) {
          try {
            const listed = await zapsterListInstances();
            if (listed.ok) {
              const items = normalizeWaInstancesList(listed.data);
              const orphan = items.find((it) => String(it.metadataAcademyId || '').trim() === academyId);
              if (orphan?.id) {
                console.log('[zapsterInstances] inst\u00e2ncia \u00f3rf\u00e3 encontrada, vinculando:', orphan.id);
                await persistInstanceId(academyId, orphan.id);
                const zOrphan = await zapsterGetInstance(orphan.id);
                const status = String(zOrphan.data?.status || '').trim() || 'disconnected';
                const qrcode = zOrphan.data?.qrcode ?? null;
                return res.status(200).json({ sucesso: true, instance_id: orphan.id, status, qrcode, recovered: true });
              }
            }
          } catch (recoverErr) {
            console.error('[zapsterInstances] falha ao tentar recuperar inst\u00e2ncia \u00f3rf\u00e3:', recoverErr?.message);
          }
        }
        const friendlyMessage = getZapsterCreateFriendlyError(z);
        const httpStatus = upstream >= 500 ? 502 : 400;
        return res.status(httpStatus).json({
          sucesso: false,
          erro: friendlyMessage,
          codigo: upstream
        });
      }
      const instanceId = String(z.data?.id || '').trim();
      const status = String(z.data?.status || '').trim() || 'unknown';
      const qrcode = z.data?.qrcode ?? null;
      let wa_phone = await resolveInstanceWaPhone(z.data, instanceId);
      if (instanceId) {
        const persisted = await persistInstanceId(academyId, instanceId);
        if (!persisted) {
          console.error(
            '[zapsterInstances] erro completo Appwrite antes de persist_failed:',
            persistInstanceId._lastPersistError
          );
          console.error('[zapsterInstances] CR\u00cdTICO: inst\u00e2ncia criada no Zapster mas n\u00e3o persistida', {
            academyId,
            instanceId
          });
          return res.status(200).json({
            sucesso: true,
            instance_id: instanceId,
            status,
            qrcode,
            wa_phone: wa_phone || null,
            aviso:
              'Inst\u00e2ncia criada na Zapster, mas o salvamento na base falhou. Use "Verificar e corrigir" ou "Verificar status" ap\u00f3s corrigir; se o QR sumir ao atualizar, toque em Verificar e corrigir.',
            persist_failed: true
          });
        }
      }
      if (wa_phone && status === 'connected') {
        void persistAcademyWaPhone(academyId, wa_phone, status);
      }
      return res.status(200).json({
        sucesso: true,
        instance_id: instanceId || null,
        status,
        qrcode,
        wa_phone: wa_phone || null,
        webhooks_registered: z.webhooksRegistered === true
      });
    } catch (e) {
      const msg = isZapsterTimeoutError(e) ? ZAPSTER_TIMEOUT_FRIENDLY : e?.message || 'Erro ao criar inst\u00e2ncia';
      return res.status(500).json({ sucesso: false, erro: msg, codigo: isZapsterTimeoutError(e) ? 'zapster_timeout' : undefined });
    }
  }

  if (req.method === 'DELETE') {
    if (!idParam) return res.status(400).json({ sucesso: false, erro: 'id ausente' });
    const current = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
    if (current && current !== idParam) {
      return res.status(403).json({ sucesso: false, erro: 'Inst\u00e2ncia n\u00e3o pertence a esta academia' });
    }
    try {
      const z = await zapsterDeleteInstance(idParam);
      const unlinked = await clearAcademyInstanceLink(academyId);
      if (!z.ok) {
        return res.status(200).json({
          sucesso: true,
          removido: false,
          vinculo_limpo: unlinked
        });
      }
      return res.status(200).json({
        sucesso: true,
        removido: true,
        vinculo_limpo: unlinked
      });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao remover' });
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ sucesso: false, erro: 'M\u00e9todo n\u00e3o permitido' });
}

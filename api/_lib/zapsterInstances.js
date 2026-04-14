import { Client, Databases, Account, Teams, Query } from 'node-appwrite';
import { assertBillingActive, sendBillingGateError } from './billingGate.js';

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
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!ZAPSTER_TOKEN) {
    res.status(500).json({ sucesso: false, erro: 'ZAPSTER_API_TOKEN ausente' });
    return false;
  }
  return true;
}

async function ensureAuth(req, res) {
  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ sucesso: false, erro: 'JWT ausente' });
    return null;
  }
  const jwt = auth.slice(7).trim();
  if (!jwt) {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
  try {
    const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
    const account = new Account(userClient);
    const me = await account.get();
    return me;
  } catch {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
}

function resolveAcademyId(req) {
  const h = String(req.headers['x-academy-id'] || '').trim();
  if (h) return h;
  return '';
}

async function ensureAcademyAccess(req, res, me) {
  const academyId = resolveAcademyId(req);
  if (!academyId) {
    res.status(400).json({ sucesso: false, erro: 'x-academy-id ausente' });
    return null;
  }
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    const ownerId = String(doc?.ownerId || '').trim();
    const userId = String(me?.$id || '').trim();
    if (ownerId && userId && ownerId === userId) return { academyId, doc };

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const memberships = await teams.listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)]);
        const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
        if (list.length > 0) return { academyId, doc };
      } catch {
        void 0;
      }
    }
    res.status(403).json({ sucesso: false, erro: 'Acesso negado à academia' });
    return null;
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao validar academia' });
    return null;
  }
}

function baseUrl() {
  return String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
}

const ZAPSTER_ERROR_MESSAGES = {
  max_instances_reached:
    'Limite de dispositivos atingido nesta conta Zapster. Entre em contato com o suporte ou remova uma instância não usada.',
  unauthorized:
    'Token de acesso ao WhatsApp (Zapster) inválido ou expirado. Verifique ZAPSTER_API_TOKEN no servidor.',
  instance_already_exists:
    'Este dispositivo já está registrado na Zapster. Tente reconectar ou remova a instância antiga antes de criar outra.',
  invalid_webhook_url:
    'URL de webhook inválida ou inacessível para a Zapster. Verifique o domínio público do servidor e a rota /api/webhook/zapster.',
  default: 'Não foi possível conectar o dispositivo. Tente novamente em instantes.'
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

/**
 * Só trata como "limite de instâncias" mensagens explícitas da API.
 * Evita /\blimit\b/ genérico (ex.: "character limit", "rate_limit" em alguns formatos, validações).
 *
 * @param {string} rawBody
 * @param {unknown} parsedJson
 * @param {number} status
 */
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

  // Checar conteúdo do body ANTES do status genérico 401/403
  // (Zapster pode retornar 401/403 para limite de instâncias)
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
    'limite de instância',
    'limite de instâncias',
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

  console.error('[zapster] erro não mapeado:', { status, body: rawStr.slice(0, 300) });
  return `Não foi possível conectar o dispositivo (${status || '—'}). Tente novamente.`;
}

/** @param {{ ok: boolean; status: number; data: unknown; raw: string }} z */
function getZapsterCreateFriendlyError(z) {
  return getZapsterErrorMessage(z.raw, z.data, z.status || 0);
}

async function zapsterCreateInstance({ name, metadata, webhooks }) {
  const url = `${baseUrl()}/v1/wa/instances`;
  const body = {
    connection_type: 'unofficial',
    ...(name ? { name } : {}),
    ...(metadata ? { metadata } : {}),
    ...(webhooks ? { settings: { webhooks } } : {})
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${ZAPSTER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const raw = await resp.text();
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
  try {
    const data = JSON.parse(raw);
    return { ok: resp.ok, status: resp.status, data, raw };
  } catch {
    return { ok: resp.ok, status: resp.status, data: null, raw };
  }
}

async function zapsterGetInstance(id) {
  const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(String(id))}`;
  const resp = await fetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } });
  const raw = await resp.text();
  try {
    const data = JSON.parse(raw);
    return { ok: resp.ok, status: resp.status, data, raw };
  } catch {
    return { ok: resp.ok, status: resp.status, data: null, raw };
  }
}

/** Lista instâncias da conta (usado em recover). Formato da API pode variar. */
async function zapsterListInstances() {
  const url = `${baseUrl()}/v1/wa/instances`;
  const resp = await fetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } });
  const raw = await resp.text();
  try {
    const data = JSON.parse(raw);
    return { ok: resp.ok, status: resp.status, data, raw };
  } catch {
    return { ok: resp.ok, status: resp.status, data: null, raw };
  }
}

/** @param {unknown} data */
function normalizeWaInstancesList(data) {
  let arr = [];
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === 'object') {
    const o = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(o.instances)) arr = o.instances;
    else if (Array.isArray(o.data)) arr = o.data;
    else if (o.id) arr = [o];
  }
  return arr
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const r = /** @type {Record<string, unknown>} */ (row);
      const id = String(r.id || r.instance_id || '').trim();
      const meta = r.metadata && typeof r.metadata === 'object' ? /** @type {Record<string, unknown>} */ (r.metadata) : {};
      const academyFromMeta = String(meta.academy_id || meta.academyId || '').trim();
      return { id, metadataAcademyId: academyFromMeta };
    })
    .filter((x) => x.id);
}

/**
 * @param {string} academyId
 * @param {string} instanceId
 * @param {number} [attempt]
 */
async function persistInstanceId(academyId, instanceId, attempt = 0) {
  const id = String(instanceId || '').trim();
  if (!id) return false;
  try {
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        zapster_instance_id: id,
        zapsterInstanceId: id
      });
    } catch {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { zapsterInstanceId: id });
    }
    console.log('[zapsterInstances] id persistido com sucesso:', id);
    return true;
  } catch (err) {
    console.error('[zapsterInstances] falha ao persistir id (tentativa', attempt + 1, '):', err?.message || err);
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return persistInstanceId(academyId, id, attempt + 1);
    }
    return false;
  }
}

async function zapsterDeleteInstance(id) {
  const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(String(id))}`;
  const resp = await fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } });
  const raw = await resp.text();
  return { ok: resp.ok, status: resp.status, raw };
}

async function zapsterPower(id, action) {
  const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(id)}/${action}`;
  const resp = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } });
  const raw = await resp.text();
  return { ok: resp.status === 204, status: resp.status, raw };
}

function getWebhookTarget(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'https';
  const host = String(req.headers.host || '').trim();
  const src = `${proto}://${host}`;
  const token = String(process.env.ZAPSTER_WEBHOOK_TOKEN || '').trim();
  const url = token ? `${src}/api/webhook/zapster?token=${encodeURIComponent(token)}` : `${src}/api/webhook/zapster`;
  return url;
}

export default async function handler(req, res) {
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const ctx = await ensureAcademyAccess(req, res, me);
  if (!ctx) return;
  const { academyId, doc } = ctx;

  if (req.method === 'POST' || req.method === 'DELETE') {
    try {
      await assertBillingActive(academyId);
    } catch (e) {
      if (sendBillingGateError(res, e)) return;
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
    }
  }

  const action = String(req.query?.action || '').trim().toLowerCase();
  const idParam = String(req.query?.id || '').trim();

  if (req.method === 'GET') {
    if (action === 'qrcode') {
      if (!idParam) return res.status(400).json({ sucesso: false, erro: 'id ausente' });
      try {
        const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(idParam)}/qrcode`;
        const resp = await fetch(url, { headers: { authorization: `Bearer ${ZAPSTER_TOKEN}` } });
        if (resp.status === 200) {
          const buf = Buffer.from(await resp.arrayBuffer());
          res.setHeader('Content-Type', 'image/png');
          res.status(200).send(buf);
          return;
        }
        const text = await resp.text();
        try {
          const json = JSON.parse(text);
          return res.status(resp.status || 500).json({ sucesso: false, erro: json?.errors?.[0]?.message || 'QR indisponível' });
        } catch {
          return res.status(resp.status || 500).json({ sucesso: false, erro: text || 'QR indisponível' });
        }
      } catch (e) {
        return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao obter QR' });
      }
    }
    if (action === 'get') {
      if (!idParam) return res.status(400).json({ sucesso: false, erro: 'id ausente' });
      try {
        const z = await zapsterGetInstance(idParam);
        if (!z.ok) return res.status(404).json({ sucesso: false, erro: 'Instância não encontrada' });
        const status = String(z.data?.status || '').trim() || 'unknown';
        const qrcode = z.data?.qrcode ?? null;
        return res.status(200).json({ sucesso: true, instance_id: idParam, status, qrcode });
      } catch (e) {
        return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao consultar instância' });
      }
    }
    if (action === 'recover') {
      try {
        const current = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
        if (current) {
          return res.status(200).json({ sucesso: true, recovered: false, already_linked: true, instance_id: current });
        }
        const listed = await zapsterListInstances();
        if (!listed.ok) {
          console.warn('[zapsterInstances] recover: listagem Zapster falhou', { status: listed.status, raw: String(listed.raw || '').slice(0, 200) });
          return res.status(200).json({
            sucesso: true,
            recovered: false,
            erro:
              'Não foi possível listar instâncias na Zapster (endpoint pode não existir nesta versão da API). Verifique o ID no Appwrite ou crie de novo.'
          });
        }
        const items = normalizeWaInstancesList(listed.data);
        const match = items.find((it) => String(it.metadataAcademyId || '').trim() === academyId);
        if (!match?.id) {
          return res.status(200).json({
            sucesso: true,
            recovered: false,
            erro: 'Nenhuma instância com esta academia foi encontrada na Zapster.'
          });
        }
        const ok = await persistInstanceId(academyId, match.id);
        if (!ok) {
          return res.status(200).json({
            sucesso: true,
            recovered: false,
            erro: 'Instância encontrada na Zapster, mas falhou ao salvar no Appwrite após novas tentativas.'
          });
        }
        return res.status(200).json({ sucesso: true, recovered: true, instance_id: match.id });
      } catch (e) {
        return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao recuperar instância' });
      }
    }
    try {
      const inst = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
      if (!inst) return res.status(200).json({ sucesso: true, instance_id: null, status: 'disconnected', qrcode: null });
      const z = await zapsterGetInstance(inst);
      if (!z.ok) return res.status(200).json({ sucesso: true, instance_id: inst, status: 'unknown', qrcode: null });
      const status = String(z.data?.status || '').trim() || 'unknown';
      const qrcode = z.data?.qrcode ?? null;
      return res.status(200).json({ sucesso: true, instance_id: inst, status, qrcode });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao consultar instância' });
    }
  }

  if (req.method === 'POST') {
    if (action === 'power-on' || action === 'power-off' || action === 'restart') {
      if (!idParam) return res.status(400).json({ sucesso: false, erro: 'id ausente' });
      const current = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
      if (current && current !== idParam) {
        return res.status(403).json({ sucesso: false, erro: 'Instância não pertence a esta academia' });
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
      const z = await zapsterCreateInstance({
        name,
        metadata,
        webhooks: [{ url: webhookUrl, events: ['message.received', 'instance.qrcode', 'instance.status'] }]
      });
      if (!z.ok) {
        const upstream = Number(z.status) || 500;
        // Se o erro for 401/403/409 ou limite de instâncias, tenta recuperar instância órfã
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
                console.log('[zapsterInstances] instância órfã encontrada, vinculando:', orphan.id);
                await persistInstanceId(academyId, orphan.id);
                const zOrphan = await zapsterGetInstance(orphan.id);
                const status = String(zOrphan.data?.status || '').trim() || 'disconnected';
                const qrcode = zOrphan.data?.qrcode ?? null;
                return res.status(200).json({ sucesso: true, instance_id: orphan.id, status, qrcode, recovered: true });
              }
            }
          } catch (recoverErr) {
            console.error('[zapsterInstances] falha ao tentar recuperar instância órfã:', recoverErr?.message);
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
      if (instanceId) {
        const persisted = await persistInstanceId(academyId, instanceId);
        if (!persisted) {
          console.error('[zapsterInstances] CRÍTICO: instância criada no Zapster mas não persistida', {
            academyId,
            instanceId
          });
          return res.status(200).json({
            sucesso: true,
            instance_id: instanceId,
            status,
            qrcode,
            aviso:
              'Instância criada na Zapster, mas o salvamento na base falhou. Use "Verificar e corrigir" ou "Verificar status" após corrigir; se o QR sumir ao atualizar, toque em Verificar e corrigir.',
            persist_failed: true
          });
        }
      }
      return res.status(200).json({ sucesso: true, instance_id: instanceId || null, status, qrcode });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao criar instância' });
    }
  }

  if (req.method === 'DELETE') {
    if (!idParam) return res.status(400).json({ sucesso: false, erro: 'id ausente' });
    const current = String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
    if (current && current !== idParam) {
      return res.status(403).json({ sucesso: false, erro: 'Instância não pertence a esta academia' });
    }
    try {
      const z = await zapsterDeleteInstance(idParam);
      try {
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { zapster_instance_id: '', zapsterInstanceId: '' });
      } catch {
        void 0;
      }
      if (!z.ok) return res.status(200).json({ sucesso: true, removido: false });
      return res.status(200).json({ sucesso: true, removido: true });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao remover' });
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
}



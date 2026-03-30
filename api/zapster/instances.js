import { Client, Databases, Account, Teams, Query } from 'node-appwrite';

const ZAPSTER_API_BASE_URL = process.env.ZAPSTER_API_BASE_URL || process.env.ZAPSTER_API_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_API_TOKEN || process.env.ZAPSTER_TOKEN || '';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
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
        const msg = z?.raw?.slice?.(0, 300) || 'Falha ao criar instância';
        return res.status(z.status || 500).json({ sucesso: false, erro: msg });
      }
      const instanceId = String(z.data?.id || '').trim();
      const status = String(z.data?.status || '').trim() || 'unknown';
      const qrcode = z.data?.qrcode ?? null;
      if (instanceId) {
        try {
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { zapster_instance_id: instanceId, zapsterInstanceId: instanceId });
        } catch {
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { zapsterInstanceId: instanceId });
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


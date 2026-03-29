import { Client, Databases, Query } from 'node-appwrite';

const ZAPSTER_API_BASE_URL = process.env.ZAPSTER_API_BASE_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_TOKEN || process.env.ZAPSTER_API_TOKEN || '';
const ZAPSTER_INSTANCE_ID = process.env.ZAPSTER_INSTANCE_ID || '';
const ZAPSTER_WEBHOOK_TOKEN = process.env.ZAPSTER_WEBHOOK_TOKEN || '';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const appwriteClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = appwriteClient ? new Databases(appwriteClient) : null;

function ensureJson(req, res) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) {
    res.status(400).json({ sucesso: false, erro: 'Content-Type inválido' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ sucesso: false, erro: 'Body ausente' });
    return false;
  }
  return true;
}

function checkWebhookToken(req, res) {
  if (!ZAPSTER_WEBHOOK_TOKEN) return true;
  const q = String(req.query?.token || '').trim();
  const h = String(req.headers['x-webhook-token'] || '').trim();
  const a = String(req.headers.authorization || '').trim().replace(/^Bearer\s+/i, '');
  const provided = q || h || a;
  if (provided !== ZAPSTER_WEBHOOK_TOKEN) {
    res.status(401).json({ sucesso: false, erro: 'Não autorizado' });
    return false;
  }
  return true;
}

function extractEventName(body) {
  const v = body?.event || body?.type || body?.name || body?.topic || '';
  return String(v || '').trim();
}

function pickMessageObject(body) {
  if (body?.message && typeof body.message === 'object') return body.message;
  if (body?.data && typeof body.data === 'object') {
    if (body.data.message && typeof body.data.message === 'object') return body.data.message;
    return body.data;
  }
  if (body?.payload && typeof body.payload === 'object') {
    if (body.payload.message && typeof body.payload.message === 'object') return body.payload.message;
    return body.payload;
  }
  return null;
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function isGroupId(v) {
  const s = String(v || '').toLowerCase();
  return s.startsWith('group:') || s.includes('@g.us');
}

function extractIncomingText(msg) {
  const type = String(msg?.type || msg?.message?.type || msg?.content?.type || '').toLowerCase();
  const text =
    msg?.content?.text ??
    msg?.text ??
    msg?.message?.text ??
    msg?.message?.content?.text ??
    msg?.data?.text ??
    '';
  const t = String(text || '').trim();
  if (!t) return { type, text: '' };
  return { type, text: t };
}

function extractMessageId(body, msg) {
  const v = msg?.id || msg?.message?.id || body?.id || body?.message?.id || body?.data?.id || body?.payload?.id || '';
  const id = String(v || '').trim();
  return id || '';
}

function getBaseUrl(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = xfProto || 'https';
  const host = String(req.headers.host || '').trim();
  return `${proto}://${host}`;
}

async function isHumanHandoffActive(phone) {
  if (!databases || !DB_ID || !CONVERSATIONS_COL || !DEFAULT_ACADEMY_ID) return false;
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('academy_id', [DEFAULT_ACADEMY_ID]),
    Query.equal('phone_number', [phone]),
    Query.limit(1)
  ]);
  const doc = list.documents && list.documents[0] ? list.documents[0] : null;
  const until = doc && typeof doc.human_handoff_until === 'string' ? doc.human_handoff_until : '';
  if (!until) return false;
  const ms = new Date(until).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

async function sendZapsterText({ recipient, text }) {
  if (!ZAPSTER_TOKEN || !ZAPSTER_INSTANCE_ID) {
    return { ok: false, erro: 'ZAPSTER_TOKEN/ZAPSTER_INSTANCE_ID ausentes' };
  }
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const url = `${urlBase}/v1/wa/messages`;
  const body = { recipient, text, instance_id: ZAPSTER_INSTANCE_ID };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ZAPSTER_TOKEN}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const raw = await resp.text();
    if (resp.ok) return { ok: true, raw };
    console.error('Zapster send failed', { status: resp.status, body: raw.slice(0, 500) });
    return { ok: false, erro: raw || `HTTP ${resp.status}` };
  } catch (e) {
    console.error('Zapster send error', { erro: e?.message || 'Erro ao enviar' });
    return { ok: false, erro: e?.message || 'Erro ao enviar' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!checkWebhookToken(req, res)) return;
  if (!ensureJson(req, res)) return;

  try {
    const body = req.body || {};
    const event = extractEventName(body);
    const msg = pickMessageObject(body);

    if (!msg) return res.status(200).json({ sucesso: true, ignorado: true });
    if (event && event !== 'message.received' && event !== 'message:received' && event !== 'message_received') {
      return res.status(200).json({ sucesso: true, ignorado: true });
    }

    const senderId = msg?.sender?.id || msg?.from || body?.sender?.id || body?.from || '';
    const recipientId = msg?.recipient?.id || msg?.to || body?.recipient?.id || body?.to || '';
    if (isGroupId(senderId) || isGroupId(recipientId)) {
      return res.status(200).json({ sucesso: true, ignorado: true });
    }

    const phone = normalizePhone(senderId);
    if (!phone) return res.status(200).json({ sucesso: true, ignorado: true });

    const { type, text } = extractIncomingText(msg);
    if (!text) return res.status(200).json({ sucesso: true, ignorado: true });
    if (type && type !== 'text') return res.status(200).json({ sucesso: true, ignorado: true });

    try {
      const active = await isHumanHandoffActive(phone);
      if (active) return res.status(200).json({ sucesso: true, ignorado: true, modo_humano: true });
    } catch {}

    const name = String(msg?.sender?.name || body?.sender?.name || '').trim();
    const messageId = extractMessageId(body, msg);

    const baseUrl = getBaseUrl(req);
    const payload = { phone, name, message: text, ...(messageId ? { message_id: messageId } : {}) };

    let agentData = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const agentResp = await fetch(`${baseUrl}/api/agent/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const agentRaw = await agentResp.text();
      if (!agentResp.ok) {
        return res.status(500).json({ sucesso: false, erro: agentRaw.slice(0, 500) || 'Falha no agente' });
      }
      agentData = JSON.parse(agentRaw);
      if (!agentData?.em_processamento) break;
      await new Promise((r) => setTimeout(r, 750));
    }
    if (agentData?.em_processamento) {
      return res.status(503).json({ sucesso: false, erro: 'Em processamento' });
    }

    const resposta = String(agentData?.resposta || '').trim();
    if (!resposta) {
      return res.status(200).json({ sucesso: true, ignorado: true });
    }

    const sent = await sendZapsterText({ recipient: phone, text: resposta });
    if (!sent.ok) {
      return res.status(200).json({
        sucesso: true,
        enviado: false,
        resposta,
        classificacao: agentData?.classificacao || null,
        erro_envio: sent.erro || 'Falha ao enviar'
      });
    }

    return res.status(200).json({
      sucesso: true,
      enviado: true,
      resposta,
      classificacao: agentData?.classificacao || null
    });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}

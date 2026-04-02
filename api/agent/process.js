import { sendZapsterText } from '../lib/zapsterSend.js';
import {
  getAcademyDocument,
  getOrCreateConversationDoc,
  updateConversationWithMerge
} from '../lib/conversationsStore.js';

function ensureJson(req, res) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) {
    res.status(400).json({ error: 'invalid_content_type' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ error: 'body_required' });
    return false;
  }
  return true;
}

function getBaseUrl(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = xfProto || 'https';
  const host = String(req.headers.host || '').trim();
  return `${proto}://${host}`;
}

function resolvePublicBaseUrl(req) {
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (envBase) return envBase;
  const vu = String(process.env.VERCEL_URL || '').trim().replace(/^https?:\/\//, '');
  if (vu) return `https://${vu}`;
  return getBaseUrl(req);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const expected = String(process.env.INTERNAL_API_SECRET || '').trim();
  if (!expected) {
    console.error('[agent/process] INTERNAL_API_SECRET não configurado');
    return res.status(503).json({ error: 'misconfigured' });
  }

  const secret = String(req.headers['x-internal-secret'] || '').trim();
  if (secret !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!ensureJson(req, res)) return;

  const body = req.body || {};
  const phone = String(body.phone || '').trim();
  const name = String(body.name || '').trim();
  const academyId = String(body.academyId || '').trim();
  const message = String(body.message || '').trim();
  const messageId = String(body.messageId || '').trim();
  const requestId = String(body.requestId || '').trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outInstanceId = String(body.outInstanceId || '').trim();
  const inboundDocId = body.inboundDocId != null ? String(body.inboundDocId).trim() : '';

  if (!phone || !academyId || !message) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const baseUrl = resolvePublicBaseUrl(req);
  const agentPayload = {
    phone,
    name,
    academy_id: academyId,
    message,
    ...(messageId ? { message_id: messageId } : {})
  };

  console.log('[agent/process] start', { requestId, phone, messageId, academyId });

  try {
    let agentData = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      console.log('[agent/process] attempt', { attempt, requestId });

      const agentResp = await fetch(`${baseUrl}/api/agent/respond`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-academy-id': academyId
        },
        body: JSON.stringify(agentPayload)
      });

      const agentRaw = await agentResp.text();
      if (!agentResp.ok) {
        console.error('[agent/process] agent HTTP error', { attempt, status: agentResp.status, requestId });
        return res.status(200).json({ sent: false, error: 'agent_http_error' });
      }

      try {
        agentData = JSON.parse(agentRaw);
      } catch {
        console.error('[agent/process] agent JSON inválido', { requestId });
        return res.status(200).json({ sent: false, error: 'agent_invalid_json' });
      }

      console.log('[agent/process] agent response', {
        attempt,
        em_processamento: agentData?.em_processamento ?? null,
        hasResposta: Boolean(agentData?.resposta),
        respostaLen: agentData?.resposta?.length ?? 0,
        requestId
      });

      if (!agentData?.em_processamento) break;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 2000));
    }

    if (agentData?.em_processamento) {
      console.error('[agent/process] esgotou tentativas sem resposta', { requestId, phone, academyId });
      return res.status(200).json({ sent: false, processing: true });
    }

    const resposta = String(agentData?.resposta || '').trim();
    if (!resposta) {
      console.error('[agent/process] resposta vazia', {
        requestId,
        phone,
        academyId,
        agentDataKeys: Object.keys(agentData || {})
      });
      return res.status(200).json({ sent: false, empty: true });
    }

    if (!outInstanceId) {
      console.error('[agent/process] outInstanceId vazio', { requestId, phone, academyId });
    }

    const sent = await sendZapsterText({ recipient: phone, text: resposta, instanceId: outInstanceId });
    if (!sent?.ok) {
      console.error('[agent/process] sendZapsterText falhou', {
        requestId,
        phone,
        academyId,
        outInstanceId,
        erro: sent?.erro
      });
      return res.status(200).json({ sent: false, error: String(sent?.erro || 'zapster_send_failed') });
    }

    const nowIso = new Date().toISOString();
    const academyDoc = await getAcademyDocument(academyId);
    const conv = inboundDocId
      ? { $id: inboundDocId }
      : await getOrCreateConversationDoc(phone, academyId, academyDoc).catch(() => null);
    const convId = String(conv?.$id || '').trim();
    if (convId) {
      const mid = messageId;
      const assistantMsg = {
        role: 'assistant',
        content: resposta,
        timestamp: nowIso,
        sender: 'ai',
        ...(mid ? { in_reply_to: mid } : {})
      };
      await updateConversationWithMerge(convId, [assistantMsg]);
    }

    console.log('[agent/process] sent', { requestId, phone, respostaLen: resposta.length });
    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error('[agent/process] error', { error: e?.message, requestId, phone });
    return res.status(200).json({ sent: false, error: e?.message || 'internal' });
  }
}

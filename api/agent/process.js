import { timingSafeEqual } from 'crypto';
import { sendZapsterText } from '../../lib/server/zapsterSend.js';
import {
  getAcademyDocument,
  getOrCreateConversationDoc,
  updateConversationWithMerge
} from '../../lib/server/conversationsStore.js';

function resolveBaseUrl(req) {
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (envBase) return envBase;
  const vu = String(process.env.VERCEL_URL || '').trim().replace(/^https?:\/\//, '');
  if (vu) return `https://${vu}`;
  const host = String(req.headers.host || '').trim();
  return host ? `https://${host}` : '';
}

function buildAgentPayload({ phone, name, academyId, message, messageId }) {
  return {
    phone,
    name,
    academy_id: academyId,
    message,
    ...(String(messageId || '').trim() ? { message_id: String(messageId).trim() } : {})
  };
}

function safeCompare(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function parseAgentJson(resp, requestId, label) {
  const raw = await resp.text();
  try {
    return JSON.parse(raw);
  } catch {
    console.error(`[agent/process] ${label} JSON inválido`, { requestId });
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const expected = String(process.env.INTERNAL_API_SECRET || '').trim();
  if (!expected) {
    console.error('[agent/process] INTERNAL_API_SECRET não configurado');
    return res.status(503).json({ error: 'misconfigured' });
  }

  const secret = String(req.headers['x-internal-secret'] || '').trim();
  if (!secret || !safeCompare(secret, expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json') || !req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'invalid_body' });
  }

  const {
    phone: bodyPhone,
    name,
    academyId,
    messageId,
    requestId: bodyRequestId,
    outInstanceId,
    message: bodyMessage,
    inboundDocId
  } = req.body || {};

  const phone = String(bodyPhone || '').trim();
  const academy = String(academyId || '').trim();
  const message = String(bodyMessage || '').trim();
  const requestId =
    String(bodyRequestId || '').trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const instOut = String(outInstanceId || '').trim();
  const inboundId = inboundDocId != null && inboundDocId !== '' ? String(inboundDocId).trim() : '';

  if (!phone || !academy || !message) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  console.log('[agent/process] start', { requestId, phone, messageId, academyId: academy });

  const baseUrl = resolveBaseUrl(req);
  if (!baseUrl) {
    console.error('[agent/process] baseUrl vazio', { requestId });
    return res.status(500).json({ sent: false, error: 'no_base_url' });
  }

  const agentHeaders = {
    'content-type': 'application/json',
    'x-academy-id': academy,
    'x-internal-secret': expected
  };
  const agentBody = JSON.stringify(
    buildAgentPayload({ phone, name, academyId: academy, message, messageId })
  );

  try {
    const resp1 = await fetch(`${baseUrl}/api/agent/respond`, {
      method: 'POST',
      headers: agentHeaders,
      body: agentBody
    });

    if (resp1.status === 429) {
      console.warn('[agent/process] rate limit em respond', {
        requestId,
        academyId: academy
      });
      return res.status(200).json({ sent: false, motivo: 'rate_limit' });
    }

    if (!resp1.ok) {
      const errorBody = await resp1.text();
      console.error('[agent/process] agent HTTP error call 1', {
        status: resp1.status,
        requestId,
        body: errorBody.slice(0, 300)
      });
      return res.status(200).json({ sent: false, error: 'agent_http_error' });
    }

    let agentData = await parseAgentJson(resp1, requestId, 'call 1');
    if (!agentData) {
      return res.status(200).json({ sent: false, error: 'agent_invalid_json' });
    }

    if (agentData.sucesso === false && String(agentData.motivo || '') === 'prompt_nao_configurado') {
      console.log('[agent/process] prompt não configurado — sem poll nem envio', { requestId, academyId: academy });
      return res.status(200).json({ sent: false, motivo: 'prompt_nao_configurado' });
    }

    console.log('[agent/process] call 1', {
      requestId,
      em_processamento: agentData?.em_processamento ?? null,
      hasResposta: Boolean(agentData?.resposta)
    });

    if (agentData?.em_processamento) {
      await new Promise((r) => setTimeout(r, 4000));

      const resp2 = await fetch(`${baseUrl}/api/agent/respond`, {
        method: 'POST',
        headers: agentHeaders,
        body: agentBody
      });

      if (resp2.ok) {
        const parsed = await parseAgentJson(resp2, requestId, 'call 2');
        if (parsed) {
          agentData = parsed;
          console.log('[agent/process] call 2 (poll)', {
            requestId,
            em_processamento: agentData?.em_processamento ?? null,
            hasResposta: Boolean(agentData?.resposta)
          });
        }
      } else {
        console.error('[agent/process] agent HTTP error call 2', { status: resp2.status, requestId });
      }
    }

    if (agentData.sucesso === false && String(agentData.motivo || '') === 'prompt_nao_configurado') {
      console.log('[agent/process] prompt não configurado após poll — sem envio', { requestId, academyId: academy });
      return res.status(200).json({ sent: false, motivo: 'prompt_nao_configurado' });
    }

    if (agentData?.em_processamento) {
      console.error('[agent/process] ainda em processamento após poll', { requestId, phone });
      return res.status(200).json({ sent: false, processing: true });
    }

    const resposta = String(agentData?.resposta || '').trim();
    if (!resposta) {
      console.error('[agent/process] resposta vazia', {
        requestId,
        phone,
        keys: Object.keys(agentData || {})
      });
      return res.status(200).json({ sent: false, empty: true });
    }

    if (!instOut) {
      console.error('[agent/process] outInstanceId vazio', { requestId, phone, academyId: academy });
    }

    const sent = await sendZapsterText({ recipient: phone, text: resposta, instanceId: instOut });
    if (!sent?.ok) {
      console.error('[agent/process] sendZapsterText falhou', {
        requestId,
        phone,
        outInstanceId: instOut,
        erro: sent?.erro
      });
      return res.status(200).json({ sent: false, error: sent?.erro });
    }

    const nowIso = new Date().toISOString();
    const academyDoc = await getAcademyDocument(academy);
    const conv = inboundId
      ? { $id: inboundId }
      : await getOrCreateConversationDoc(phone, academy, academyDoc).catch(() => null);
    const convId = String(conv?.$id || '').trim();
    if (convId) {
      const mid = String(messageId || '').trim();
      const assistantMsg = {
        role: 'assistant',
        content: resposta,
        timestamp: nowIso,
        sender: 'ai',
        ...(mid ? { in_reply_to: mid } : {})
      };
      await updateConversationWithMerge(convId, [assistantMsg]);
    }

    console.log('[agent/process] sent ✓', { requestId, phone, respostaLen: resposta.length });
    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error('[agent/process] error', { error: e?.message, requestId, phone });
    return res.status(200).json({ sent: false, error: e?.message || 'internal' });
  }
}

import { timingSafeEqual } from 'crypto';
import { sendZapsterText } from '../../lib/server/zapsterSend.js';
import {
  getAcademyDocument,
  getOrCreateConversationDoc,
  getConversationDocById,
  findConversationDoc,
  updateConversationWithMerge,
  updateConversationAiThreadCycle
} from '../../lib/server/conversationsStore.js';
import { getCurrentBillingCycleId, checkAiQuota, incrementAiThreads } from '../../src/services/planService.js';
import { assertBillingActive, BillingGateError } from './billingGate.js';

const processingLocks = new Map();

function resolveBaseUrl(req) {
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (envBase) return envBase;
  const vu = String(process.env.VERCEL_URL || '').trim().replace(/^https?:\/\//, '');
  if (vu) return `https://${vu}`;
  const host = String(req.headers.host || '').trim();
  return host ? `https://${host}` : '';
}

function buildAgentPayload({ phone, name, academyId, message, messageId, outInstanceId }) {
  const mid = String(messageId || '').trim();
  const inst = String(outInstanceId || '').trim();
  return {
    phone,
    name,
    academy_id: academyId,
    message,
    /** Evita gravar a mensagem da assistente no Appwrite antes do envio WhatsApp confirmar. */
    defer_assistant_merge: true,
    ...(mid ? { message_id: mid } : {}),
    ...(inst ? { out_instance_id: inst } : {})
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

function quotaBlockMessage(academyDoc) {
  const custom = String(academyDoc?.quota_message || '').trim();
  if (custom) return custom;
  const name = String(academyDoc?.ai_name || '').trim();
  const base =
    'O atendimento automático está temporariamente indisponível. Em breve alguém da equipe entrará em contato.';
  return name ? `Olá! Sou ${name}. ${base}` : `Olá! ${base}`;
}

async function resolveConversationForThreadCheck(inboundId, phone, academy) {
  const a = String(academy || '').trim();
  const i = inboundId != null && inboundId !== '' ? String(inboundId).trim() : '';
  if (i) {
    const d = await getConversationDocById(i);
    if (d && String(d.academy_id || '') === a) return d;
  }
  return findConversationDoc(phone, a);
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

  const lockKey = `${academy}:${phone}`;
  if (processingLocks.get(lockKey)) {
    console.log(`[AgentProcess] Lock ativo para ${lockKey} — ignorando mensagem duplicada`, { requestId });
    return res.status(200).json({ sent: false, ignored: true, reason: 'lock_active' });
  }
  processingLocks.set(lockKey, true);

  try {
    console.log('[agent/process] start', { requestId, phone, messageId, academyId: academy });

    const academyDoc = await getAcademyDocument(academy);
    if (!academyDoc) {
      console.error('[agent/process] academia não encontrada', { requestId, academy });
      return res.status(200).json({ sent: false, error: 'academy_not_found' });
    }

    try {
      await assertBillingActive(academy);
    } catch (e) {
      if (e instanceof BillingGateError) {
        return res.status(e.status).json({
          sent: false,
          error: e.code,
          message: e.message,
          billing_blocked: true,
        });
      }
      throw e;
    }

    const cycleId = getCurrentBillingCycleId(new Date(), academyDoc.billing_cycle_day);
    const convForQuota = await resolveConversationForThreadCheck(inboundId, phone, academy);
    const isNewThread =
      !convForQuota || String(convForQuota.ai_thread_cycle_id || '').trim() !== String(cycleId).trim();

    let quotaCheck = { allowed: true, overage: false };
    if (isNewThread) {
      quotaCheck = checkAiQuota(academyDoc);
      if (!quotaCheck.allowed) {
        const fallbackMsg = quotaBlockMessage(academyDoc);
        const instQuota =
          instOut ||
          String(academyDoc?.zapster_instance_id || academyDoc?.zapsterInstanceId || '').trim() ||
          String(process.env.DEFAULT_INSTANCE_ID || '').trim();
        let qSent = null;
        if (instQuota && phone) {
          qSent = await sendZapsterText({ recipient: phone, text: fallbackMsg, instanceId: instQuota });
          if (!qSent?.ok) {
            console.error('[agent/process] quota block send falhou', { requestId, erro: qSent?.erro, instQuota });
          }
        } else {
          console.error('[agent/process] quota esgotada e sem instância Zapster para fallback', {
            requestId,
            phone,
            academyId: academy
          });
        }
        return res.status(200).json({
          sent: Boolean(qSent?.ok),
          quota_blocked: true,
          fallback_sent: Boolean(qSent?.ok)
        });
      }
    }

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
      buildAgentPayload({ phone, name, academyId: academy, message, messageId, outInstanceId: instOut })
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
        if (agentData.aviso_enviado) {
          console.log('[agent/process] prompt não configurado — aviso já enviado pelo respond', { requestId, academyId: academy });
          return res.status(200).json({ sent: true, motivo: 'prompt_nao_configurado' });
        }
        console.log('[agent/process] prompt não configurado — sem envio (sem instância ou falha Zapster)', { requestId, academyId: academy });
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
        if (agentData.aviso_enviado) {
          console.log('[agent/process] prompt não configurado após poll — aviso já enviado', { requestId, academyId: academy });
          return res.status(200).json({ sent: true, motivo: 'prompt_nao_configurado' });
        }
        console.log('[agent/process] prompt não configurado após poll — sem envio', { requestId, academyId: academy });
        return res.status(200).json({ sent: false, motivo: 'prompt_nao_configurado' });
      }

      console.log('[agent/process] resposta do respond', {
        hasData: !!agentData,
        resposta:
          agentData?.resposta != null && agentData.resposta !== ''
            ? String(agentData.resposta).slice(0, 50)
            : agentData?.resposta,
        hasDeferred: !!agentData?.deferred_merge,
        sent: agentData?.sent,
        motivo: agentData?.motivo,
        em_processamento: agentData?.em_processamento,
        sucesso: agentData?.sucesso
      });

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
        console.error('[agent/process] sendZapsterText falhou — histórico da assistente não será gravado', {
          requestId,
          phone,
          outInstanceId: instOut,
          erro: sent?.erro
        });
        return res.status(200).json({ sent: false, reason: 'zapster_send_failed', error: sent?.erro });
      }

      let convId = '';
      const dm = agentData?.deferred_merge;
      if (dm?.doc_id && Array.isArray(dm.additions) && dm.additions.length > 0) {
        convId = String(dm.doc_id).trim();
        const mergeUp = await updateConversationWithMerge(convId, dm.additions);
        if (!mergeUp.ok) {
          console.error('[agent/process] merge pós-Zapster falhou', { requestId, convId, erro: mergeUp.erro });
        }
      } else {
        const nowIso = new Date().toISOString();
        let conv = null;
        const inbound = inboundId != null && inboundId !== '' ? String(inboundId).trim() : '';
        if (inbound) {
          conv = await getConversationDocById(inbound);
          if (!conv || String(conv.academy_id || '') !== String(academy)) conv = null;
        }
        if (!conv) conv = await getOrCreateConversationDoc(phone, academy, academyDoc).catch(() => null);
        convId = String(conv?.$id || '').trim();
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
      }

      if (isNewThread && convId) {
        try {
          await incrementAiThreads(academy, Boolean(quotaCheck.overage), academyDoc.plan);
        } catch (e) {
          console.error('[agent/process] incrementAiThreads', { requestId, error: e?.message });
        }
        const cyc = await updateConversationAiThreadCycle(convId, cycleId);
        if (!cyc.ok) console.warn('[agent/process] updateConversationAiThreadCycle', { requestId, erro: cyc.erro });
      }

      console.log('[agent/process] sent ✓', { requestId, phone, respostaLen: resposta.length });
      return res.status(200).json({ sent: true });
    } catch (e) {
      console.error('[agent/process] error', { error: e?.message, requestId, phone });
      return res.status(200).json({ sent: false, error: e?.message || 'internal' });
    }
  } finally {
    processingLocks.delete(lockKey);
  }
}

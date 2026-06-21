import { toYmd } from '../planFreezeCore.js';
import { isLeadNamePlaceholder } from '../leadNamePlaceholder.js';
import { mergeAgentStatePatch, intakeMissingFieldsForTier } from './agentStateMerge.js';
import { logTokenUsage } from './agentRespondMetrics.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

function extractJsonObject(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const firstBrace = t.indexOf('{');
  const lastBrace = t.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(t.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function formatHistory(history, limit = 12) {
  const arr = Array.isArray(history) ? history.slice(-limit) : [];
  return arr
    .map((m) => {
      const role = m?.role === 'assistant' ? 'Assistente' : 'Cliente';
      return `${role}: ${String(m?.content || '').trim().slice(0, 400)}`;
    })
    .join('\n');
}

const CONFIRM_RE = /\b(confirmo|pode trancar|pode registrar|isso mesmo|correto|ok pode|sim confirmo)\b/i;
const CHILD_INFO_RE =
  /\b(?:minha filha|meu filho|minha filh[ao]|meu filh[ao])\s+([A-Za-zÀ-ú]{2,40}).*?(?:tem|com)\s+(\d{1,2})\s*anos?/i;

/**
 * Interpretação heurística (sem API) para casos óbvios.
 */
function interpretHeuristic({ message, agentState, contact, phone }) {
  const msg = String(message || '').trim();
  const lower = msg.toLowerCase();
  if (!msg) return null;

  const fp = agentState?.freeze_pending;
  if (fp && fp.awaiting_confirmation && CONFIRM_RE.test(lower)) {
    return {
      action: 'freeze_plan',
      confidence: 'high',
      data: {
        start_ymd: fp.start_ymd,
        end_ymd: fp.end_ymd,
        duration_days: fp.duration_days,
        reason: fp.reason,
        indefinite: fp.indefinite,
      },
      missing: [],
      summary: 'Trancamento confirmado pelo aluno',
      state_patch: { clear_freeze_pending: true, freeze_pending: { awaiting_confirmation: false } },
    };
  }

  if (/\b(trancar|trancamento|pausar (o )?plano|congelar)\b/i.test(lower) && contact?.kind === 'student') {
    const durationMatch = msg.match(/(\d+)\s*dias?/i);
    const duration = durationMatch ? Number(durationMatch[1]) : null;
    const reasonMatch = msg.match(/(?:motivo|porque|por|lesão|lesao|viagem)[:\s]+(.+)/i);
    return {
      action: 'freeze_plan',
      confidence: duration ? 'medium' : 'low',
      data: { duration_days: duration, reason: reasonMatch?.[1]?.trim() || '' },
      missing: duration ? ['confirmation'] : ['duration_days', 'reason', 'confirmation'],
      summary: 'Pedido de trancamento detectado',
      state_patch: {
        freeze_pending: {
          duration_days: duration,
          reason: reasonMatch?.[1]?.trim() || '',
          awaiting_confirmation: true,
          start_ymd: toYmd(new Date()),
        },
      },
    };
  }

  const childMatch = msg.match(CHILD_INFO_RE);
  if (childMatch && contact?.kind === 'lead') {
    const childName = childMatch[1].trim();
    const age = childMatch[2].trim();
    const parentName = String(contact.name || '').trim();
    const parentFromPhone = isLeadNamePlaceholder(parentName, phone) ? '' : parentName;
    const collected = {
      name: childName,
      age,
      type: 'Criança',
      ...(parentFromPhone ? { parentName: parentFromPhone, responsavel: parentFromPhone } : {}),
    };
    return {
      action: 'update_student',
      confidence: 'high',
      data: collected,
      missing: [],
      summary: `Dados da criança: ${childName}, ${age} anos`,
      state_patch: { intake: { collected } },
      timeline_highlight: {
        text: `Responsável informou: ${childName}, ${age} anos — interesse em aula`,
        confidence: 'high',
        categories: ['data_shared', 'interest'],
      },
    };
  }

  return null;
}

function buildSystemPrompt({ today, contact, agentState }) {
  const contactLine = contact?.kind === 'student'
    ? `Aluno matriculado: ${contact.name} (id: ${contact.id})`
    : contact?.kind === 'lead'
      ? `Lead: ${contact.name} (id: ${contact.id})`
      : 'Contato sem cadastro na academia';

  return `Você interpreta mensagens WhatsApp de academia e retorna ações estruturadas.

Data de hoje: ${today}
${contactLine}
Estado atual (agent_state): ${JSON.stringify(agentState || {})}

Ações suportadas:
- add_conversation_note — aviso operacional (viagem, lesão, mudança); note_text obrigatório
- add_lead_note — nota no histórico do lead/aluno; note_text obrigatório
- update_student — cliente envia dados de cadastro (nome, idade, tipo, cpf, nascimento, responsável, emergência); acumule em state_patch.intake.collected. Para lead: patch parcial (nome/idade/tipo) não exige cpf. Se responsável fala da criança: name=nome da criança, parentName=responsável, type=Criança
- create_lead — só se contato sem cadastro E nome+telefone completos
- freeze_plan — pedido de trancamento; exige start/duração/motivo; só execute após confirmação explícita (state_patch.freeze_pending.awaiting_confirmation=false)

Responda SOMENTE JSON:
{
  "action": "add_conversation_note" | "add_lead_note" | "update_student" | "create_lead" | "freeze_plan" | null,
  "confidence": "high" | "medium" | "low",
  "data": { "note_text", "name", "cpf", "birthDate", "duration_days", "reason", "start_ymd", ... },
  "missing": ["campo"],
  "summary": "frase curta",
  "state_patch": { "intake": { "collected": {}, "missing": [] }, "freeze_pending": {}, "clear_intake": false, "clear_freeze_pending": false },
  "timeline_highlight": { "text": "frase curta do momento importante", "confidence": "high|medium|low", "categories": ["data_shared","interest","scheduling","objection","operational_notice"] }
}

Regras:
- confidence high só com dados completos e intenção clara
- freeze_plan: missing deve incluir "confirmation" até o cliente confirmar explicitamente
- update_student lead: missing vazio se pelo menos um campo patchável (name, age, type, parentName). Aluno matriculado: exige name, cpf, birthDate
- timeline_highlight: registre momentos importantes (dados compartilhados, interesse, agendamento, objeção) com confidence high
- Se não houver ação, action: null
- Nunca invente IDs`;
}

/**
 * @param {object} params
 */
export async function interpretAgentAction({
  message,
  history,
  agentState,
  contact,
  phone,
  academyId = '',
}) {
  const heuristic = interpretHeuristic({ message, agentState, contact, phone });
  if (heuristic?.confidence === 'high' && (!heuristic.missing || heuristic.missing.length === 0)) {
    return heuristic;
  }

  if (!ANTHROPIC_API_KEY) {
    if (heuristic) return heuristic;
    const lower = String(message || '').toLowerCase();
    if (/\b(vou viajar|estou viajando|mudei de|lesão|lesao|aviso)\b/i.test(lower)) {
      return {
        action: 'add_conversation_note',
        confidence: 'high',
        data: { note_text: String(message).trim().slice(0, 500) },
        missing: [],
        summary: 'Aviso registrado na conversa',
        state_patch: {},
      };
    }
    return {
      action: null,
      confidence: 'low',
      data: {},
      missing: [],
      summary: '',
      state_patch: {},
      timeline_highlight: null,
    };
  }

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const system = buildSystemPrompt({ today, contact, agentState });
  const userContent = `Telefone: ${phone || 'n/a'}\n\nHistórico recente:\n${formatHistory(history)}\n\nMensagem atual do cliente:\n${String(message || '').trim()}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    const rawTextBody = await response.text();
    if (!response.ok) {
      if (heuristic) return heuristic;
      return {
        action: null,
        confidence: 'low',
        data: {},
        missing: [],
        summary: '',
        state_patch: {},
        timeline_highlight: null,
      };
    }

    let data;
    try {
      data = JSON.parse(rawTextBody);
    } catch {
      if (heuristic) return heuristic;
      return {
        action: null,
        confidence: 'low',
        data: {},
        missing: [],
        summary: '',
        state_patch: {},
        timeline_highlight: null,
      };
    }
    logTokenUsage({
      route: 'whatsapp_inbound',
      model: 'claude-haiku-4-5-20251001',
      input_tokens: data?.usage?.input_tokens,
      output_tokens: data?.usage?.output_tokens,
      academy_id: academyId,
    });

    const rawText = data.content?.[0]?.text || '';
    const parsed = extractJsonObject(rawText) || {};
    const action = parsed.action != null ? String(parsed.action).trim() : null;
    if (!action || action === 'null') {
      return {
        action: null,
        confidence: 'low',
        data: {},
        missing: [],
        summary: '',
        state_patch: {},
        timeline_highlight: null,
      };
    }

    const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low';
    const missing = Array.isArray(parsed.missing) ? parsed.missing.map(String) : [];

    let state_patch = parsed.state_patch && typeof parsed.state_patch === 'object' ? parsed.state_patch : {};
    if (action === 'update_student') {
      const collected = {
        ...(state_patch.intake?.collected || {}),
        ...(parsed.data && typeof parsed.data === 'object' ? parsed.data : {}),
      };
      const tier = contact?.kind === 'lead' ? 'partial' : 'full';
      const miss = intakeMissingFieldsForTier(collected, tier);
      missing.length = 0;
      missing.push(...miss);
    }

    const timeline_highlight =
      parsed.timeline_highlight && typeof parsed.timeline_highlight === 'object'
        ? parsed.timeline_highlight
        : null;

    return {
      action,
      confidence,
      data: parsed.data && typeof parsed.data === 'object' ? parsed.data : {},
      missing: [...new Set(missing)],
      summary: String(parsed.summary || '').trim(),
      state_patch,
      timeline_highlight,
    };
  } catch {
    if (heuristic) return heuristic;
    return {
      action: null,
      confidence: 'low',
      data: {},
      missing: [],
      summary: '',
      state_patch: {},
      timeline_highlight: null,
    };
  }
}

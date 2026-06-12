import { AGENT_HISTORY_WINDOW } from '../constants.js';
import { mapMessagesForCopilotContext } from './followupCopilotMessages.js';

export const LEAD_HISTORY_SUMMARY_VERSION = 1;
export const LEAD_HISTORY_SUMMARY_MAX_CHARS = 8192;

export const EVENT_TYPE_LABELS = {
  schedule: 'agendamento',
  note: 'nota',
  inbox_note: 'nota inbox',
  stage_change: 'mudança de etapa',
  conversation_highlight: 'destaque da conversa',
  whatsapp: 'whatsapp',
  whatsapp_template_sent: 'template whatsapp',
  lead_criado: 'cadastro',
  lead_updated: 'atualização cadastro',
  student_updated: 'atualização aluno',
  pipeline_change: 'mudança funil',
  followup_done: 'retorno concluído',
  followup_contact: 'contato retorno',
  ai_followup_draft: 'ação ia',
};

export const LEAD_HISTORY_SUMMARY_SYSTEM = `Você resume o histórico de um lead/aluno de academia de Jiu-Jitsu para a recepção.
Com base APENAS no contexto fornecido (mensagens WhatsApp, notas e eventos do cadastro), produza um resumo factual do que foi conversado e registrado.

Regras:
- Português do Brasil, tom objetivo
- Não invente fatos que não estejam no contexto
- Não sugira ações, próximos passos, ligações, agendamentos ou abordagens comerciais
- Não dê recomendações; apenas descreva o que aconteceu e o que foi dito/registrado
- Mencione dúvidas, preferências, objeções e combinados somente se constarem no contexto
- Se o contexto estiver vazio ou mínimo, descreva apenas os dados cadastrais visíveis

Responda APENAS com JSON válido:
{
  "summary": "1 a 3 parágrafos curtos com o resumo do histórico",
  "pontos_chave": ["até 5 bullets factuais"],
  "pendencias_mencionadas": ["até 5 itens mencionados pelo lead/equipe ou array vazio"]
}`;

function extractJsonObject(text) {
  const t = String(text || '').trim();
  const clean = t.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseIsoMs(iso) {
  if (!iso) return 0;
  const ms = new Date(String(iso)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function maxIso(values) {
  let best = '';
  let bestMs = 0;
  for (const v of values) {
    const s = String(v || '').trim();
    if (!s) continue;
    const ms = parseIsoMs(s);
    if (ms >= bestMs) {
      bestMs = ms;
      best = s;
    }
  }
  return best;
}

export function formatContextTimestamp(iso) {
  const ms = parseIsoMs(iso);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return String(iso || '').slice(0, 16);
  }
}

export function eventTypeLabel(type) {
  const key = String(type || '').trim();
  return EVENT_TYPE_LABELS[key] || key || 'evento';
}

export function parseStoredLeadHistorySummary(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let obj;
  try {
    obj = JSON.parse(s);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const text = String(obj.text || obj.summary || '').trim();
  if (!text) return null;
  return {
    v: Number(obj.v) || LEAD_HISTORY_SUMMARY_VERSION,
    text,
    pontos_chave: Array.isArray(obj.pontos_chave) ? obj.pontos_chave.map(String) : [],
    pendencias_mencionadas: Array.isArray(obj.pendencias_mencionadas)
      ? obj.pendencias_mencionadas.map(String)
      : [],
    generated_at: String(obj.generated_at || '').trim(),
    context_fingerprint: String(obj.context_fingerprint || '').trim(),
    source_counts:
      obj.source_counts && typeof obj.source_counts === 'object'
        ? {
            messages: Number(obj.source_counts.messages) || 0,
            events: Number(obj.source_counts.events) || 0,
          }
        : { messages: 0, events: 0 },
  };
}

export function serializeLeadHistorySummary(payload) {
  const doc = {
    v: LEAD_HISTORY_SUMMARY_VERSION,
    text: String(payload.text || '').trim(),
    pontos_chave: (Array.isArray(payload.pontos_chave) ? payload.pontos_chave : []).slice(0, 5).map(String),
    pendencias_mencionadas: (Array.isArray(payload.pendencias_mencionadas) ? payload.pendencias_mencionadas : [])
      .slice(0, 5)
      .map(String),
    generated_at: String(payload.generated_at || new Date().toISOString()),
    context_fingerprint: String(payload.context_fingerprint || '').trim(),
    source_counts: {
      messages: Number(payload.source_counts?.messages) || 0,
      events: Number(payload.source_counts?.events) || 0,
    },
  };
  let json = JSON.stringify(doc);
  if (json.length > LEAD_HISTORY_SUMMARY_MAX_CHARS) {
    doc.text = doc.text.slice(0, Math.max(500, LEAD_HISTORY_SUMMARY_MAX_CHARS - 512));
    json = JSON.stringify(doc);
  }
  return json.slice(0, LEAD_HISTORY_SUMMARY_MAX_CHARS);
}

export function computeLeadHistoryFingerprint({ lead, messages, events }) {
  const l = lead && typeof lead === 'object' ? lead : {};
  const msgList = Array.isArray(messages) ? messages : [];
  const evList = Array.isArray(events) ? events : [];
  const lastMessageAt = maxIso(msgList.map((m) => m.at || m.timestamp));
  const lastEventAt = maxIso(evList.map((e) => e.at));
  const parts = [
    lastMessageAt,
    lastEventAt,
    String(l.$updatedAt || l.updated_at || '').trim(),
    String(l.status || '').trim(),
    String(l.pipeline_stage || l.pipelineStage || '').trim(),
    String(msgList.length),
    String(evList.length),
  ];
  return parts.join('|');
}

export function isSummaryFresh(stored, currentFingerprint) {
  if (!stored?.text || !stored.context_fingerprint || !currentFingerprint) return false;
  return stored.context_fingerprint === currentFingerprint;
}

export function daysSinceLastContact(lead, messages, events) {
  const l = lead && typeof lead === 'object' ? lead : {};
  const anchor = maxIso([
    l.last_whatsapp_activity_at,
    l.last_contact_at,
    l.last_note_at,
    ...(Array.isArray(messages) ? messages.map((m) => m.at || m.timestamp) : []),
    ...(Array.isArray(events) ? events.map((e) => e.at) : []),
    l.$createdAt,
  ]);
  const ms = parseIsoMs(anchor);
  if (!ms) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  return Math.floor((today - day) / 86400000);
}

/**
 * @param {object} params
 */
export function buildLeadHistoryContextBlock({
  lead,
  messages,
  events,
  academyName,
  daysAgo,
  nextAction = '',
  forSummary = true,
  messageWindow = AGENT_HISTORY_WINDOW,
  totalMessageCount = null,
}) {
  const l = lead && typeof lead === 'object' ? lead : {};
  const msgList = Array.isArray(messages) ? messages : [];
  const evList = Array.isArray(events) ? events : [];
  const contactDays = daysAgo ?? daysSinceLastContact(l, msgList, evList);

  const lines = [
    `Lead: ${l.name || '—'}`,
    `Status: ${l.status || '—'}`,
    `Etapa funil: ${l.pipeline_stage || l.pipelineStage || '—'}`,
    `Origem: ${l.origin || l.source || '—'}`,
    `Aula experimental: ${String(l.scheduledDate || '').slice(0, 10) || '—'} ${l.scheduledTime || ''}`.trim(),
    contactDays != null ? `Dias desde último contato: ${contactDays}` : '',
    !forSummary && nextAction ? `Próxima ação sugerida: ${nextAction}` : '',
    `Academia: ${academyName || '—'}`,
  ].filter(Boolean);

  const eventLimit = forSummary ? 15 : 8;
  if (evList.length) {
    lines.push('', forSummary ? 'Notas e eventos do cadastro:' : 'Eventos recentes:');
    for (const e of evList.slice(0, eventLimit)) {
      const ts = formatContextTimestamp(e.at);
      const label = eventTypeLabel(e.type);
      const prefix = ts ? `[${ts}]` : '';
      lines.push(`- ${prefix} (${label}) ${String(e.text || '').trim()}`.trim());
    }
  }

  if (msgList.length) {
    lines.push('', 'Conversa WhatsApp (inbox):');
    const shown = msgList.slice(-messageWindow);
    for (const m of shown) {
      const ts = formatContextTimestamp(m.at || m.timestamp);
      const prefix = ts ? `[${ts}] ` : '';
      lines.push(`${prefix}${m.role}: ${m.content}`);
    }
    const total = totalMessageCount != null ? totalMessageCount : msgList.length;
    if (total > messageWindow) {
      lines.push(`(Mostrando ${shown.length} de ${total} mensagens — conversa mais antiga omitida.)`);
    }
  }

  if (forSummary && !msgList.length && !evList.length) {
    lines.push('', 'Sem mensagens ou notas registradas no contexto.');
  }

  return lines.join('\n');
}

export function parseSummaryGenerationResponse(raw) {
  const parsed = extractJsonObject(raw) || {};
  const summary = String(parsed.summary || raw || '').trim();
  const pontos_chave = Array.isArray(parsed.pontos_chave)
    ? parsed.pontos_chave.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  const pendencias_mencionadas = Array.isArray(parsed.pendencias_mencionadas)
    ? parsed.pendencias_mencionadas.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  return { summary, pontos_chave, pendencias_mencionadas };
}

/** Contexto só com mensagens — resumo incremental do Inbox/agente. */
export function buildMessagesOnlySummaryContext(recentMessages) {
  const mapped = mapMessagesForCopilotContext(
    (Array.isArray(recentMessages) ? recentMessages : []).map((m) => ({
      role: m?.role,
      content: m?.content,
      timestamp: m?.timestamp,
      at: m?.at,
    }))
  );
  return buildLeadHistoryContextBlock({
    lead: {},
    messages: mapped,
    events: [],
    academyName: '',
    forSummary: true,
  });
}

export function formatSummaryUserPrompt({ context, previousText }) {
  const parts = [];
  if (previousText) {
    parts.push(`Resumo anterior (pode estar desatualizado):\n${previousText}`, '');
  }
  parts.push(String(context || '').trim());
  return parts.join('\n');
}

/**
 * Avalia cache persistido sem chamar IA (GET peek / prefetch).
 */
export function evaluateLeadHistorySummaryCache({ lead, messages, events }) {
  const msgList = Array.isArray(messages) ? messages : [];
  const evList = Array.isArray(events) ? events : [];
  const context_fingerprint = computeLeadHistoryFingerprint({ lead, messages: msgList, events: evList });
  const stored = parseStoredLeadHistorySummary(lead?.ai_history_summary_json);

  if (!stored) {
    return {
      ok: true,
      has_cache: false,
      summary: '',
      pontos_chave: [],
      pendencias_mencionadas: [],
      generated_at: '',
      from_cache: false,
      stale: false,
      context_fingerprint,
    };
  }

  const fresh = isSummaryFresh(stored, context_fingerprint);
  return {
    ok: true,
    has_cache: true,
    ...toApiPayload(stored, { from_cache: true, stale: !fresh, context_fingerprint }),
  };
}

function toApiPayload(stored, { from_cache, stale, context_fingerprint }) {
  return {
    summary: stored.text,
    pontos_chave: stored.pontos_chave || [],
    pendencias_mencionadas: stored.pendencias_mencionadas || [],
    generated_at: stored.generated_at || '',
    from_cache: Boolean(from_cache),
    stale: Boolean(stale),
    context_fingerprint: context_fingerprint || stored.context_fingerprint || '',
    source_counts: stored.source_counts || { messages: 0, events: 0 },
  };
}

/**
 * @param {object} params
 * @param {Record<string, unknown>} params.lead
 * @param {unknown[]} params.messages
 * @param {unknown[]} params.events
 * @param {boolean} [params.forceRefresh]
 * @param {string} params.contextBlock
 * @param {(args: { context: string; previousText?: string }) => Promise<{ summary: string; pontos_chave?: string[]; pendencias_mencionadas?: string[] }>} params.generateFn
 */
export async function resolveLeadHistorySummary({
  lead,
  messages,
  events,
  contextBlock = '',
  forceRefresh = false,
  generateFn,
}) {
  const msgList = Array.isArray(messages) ? messages : [];
  const evList = Array.isArray(events) ? events : [];
  const context_fingerprint = computeLeadHistoryFingerprint({ lead, messages: msgList, events: evList });
  const stored = parseStoredLeadHistorySummary(lead?.ai_history_summary_json);

  if (stored && isSummaryFresh(stored, context_fingerprint) && !forceRefresh) {
    return {
      ...toApiPayload(stored, { from_cache: true, stale: false, context_fingerprint }),
      serialized: null,
    };
  }

  if (stored && !isSummaryFresh(stored, context_fingerprint) && !forceRefresh) {
    return {
      ...toApiPayload(stored, { from_cache: true, stale: true, context_fingerprint }),
      serialized: null,
    };
  }

  if (typeof generateFn !== 'function') {
    throw new Error('generateFn_required');
  }

  const generated = await generateFn({
    context: String(contextBlock || '').trim(),
    previousText: stored?.text || '',
  });

  const generated_at = new Date().toISOString();
  const payload = {
    text: String(generated.summary || '').trim(),
    pontos_chave: generated.pontos_chave || [],
    pendencias_mencionadas: generated.pendencias_mencionadas || [],
    generated_at,
    context_fingerprint,
    source_counts: { messages: msgList.length, events: evList.length },
  };

  if (!payload.text) {
    throw new Error('empty_summary');
  }

  return {
    ...toApiPayload(payload, { from_cache: false, stale: false, context_fingerprint }),
    serialized: serializeLeadHistorySummary(payload),
  };
}

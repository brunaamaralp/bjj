import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { assertBillingActive, sendBillingGateError } from './billingGate.js';
import { assertAiModuleEnabled, sendAiFeatureDisabledError } from './aiFeaturePolicy.js';
import { apiErro, logApiError } from './friendlyError.js';
import { DB_ID, LEADS_COL, LEAD_EVENTS_COL } from './appwriteCollections.js';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  applyWhatsappTemplatePlaceholders,
} from '../whatsappTemplateDefaults.js';
import { findConversationDoc, safeParseMessages } from './conversationsStore.js';
import { resolveConversationMessagesFromDoc } from './followupCopilotMessages.js';
import { sortMessagesChrono } from './conversationListMeta.js';
import {
  LEAD_HISTORY_SUMMARY_SYSTEM,
  buildLeadHistoryContextBlock,
  daysSinceLastContact,
  parseSummaryGenerationResponse,
  resolveLeadHistorySummary,
  evaluateLeadHistorySummaryCache,
  formatSummaryUserPrompt,
} from './leadHistorySummary.js';
import { Client, Databases } from 'node-appwrite';
import { callClaudeUserMessage } from './claudeClient.js';

const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const adminClient =
  PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = adminClient ? new Databases(adminClient) : null;

const DRAFT_SYSTEM = `Você redige mensagens curtas de WhatsApp para retorno pós-aula experimental em academia de Jiu-Jitsu.
Tom: acolhedor, profissional, sem pressão excessiva. Português do Brasil.
Responda APENAS com JSON: { "draft": "texto da mensagem" }`;

async function readJsonBody(req) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

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

async function loadLeadContext(academyId, leadId) {
  if (!databases || !LEADS_COL) return null;
  const doc = await databases.getDocument(DB_ID, LEADS_COL, leadId);
  if (String(doc?.academyId || '').trim() !== academyId) return null;
  return doc;
}

async function loadConversationBundle(academyId, phone, leadId) {
  if (!CONVERSATIONS_COL) return { messages: [], totalMessageCount: 0 };
  const doc = await findConversationDoc(phone, academyId, {
    leadId: String(leadId || '').trim(),
  });
  if (!doc) return { messages: [], totalMessageCount: 0 };
  const full = sortMessagesChrono(safeParseMessages(doc.messages));
  const recent = safeParseMessages(doc.messages_recent);
  const totalMessageCount = full.length || recent.length;
  const messages = resolveConversationMessagesFromDoc(doc);
  return { messages, totalMessageCount };
}

async function loadRecentLeadEvents(academyId, leadId) {
  if (!LEAD_EVENTS_COL) return [];
  const res = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, [
    Query.equal('academy_id', [academyId]),
    Query.equal('lead_id', [leadId]),
    Query.orderDesc('at'),
    Query.limit(25),
  ]);
  return (res.documents || []).map((d) => ({
    type: String(d.type || ''),
    text: String(d.text || '').slice(0, 400),
    at: String(d.at || ''),
  }));
}

async function loadLeadHistoryBundle(academyId, leadId, lead) {
  const [{ messages, totalMessageCount }, events] = await Promise.all([
    loadConversationBundle(academyId, lead?.phone, leadId),
    loadRecentLeadEvents(academyId, leadId),
  ]);
  return { messages, events, totalMessageCount, contactDays: daysSinceLastContact(lead, messages, events) };
}

async function ensureCopilotAccess(req, res) {
  if (!databases) {
    res.status(503).json({ error: 'appwrite_not_configured' });
    return null;
  }
  const me = await ensureAuth(req, res);
  if (!me) return null;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;
  const { academyId, doc: academyDoc } = access;
  try {
    assertAiModuleEnabled(academyDoc);
  } catch (e) {
    if (sendAiFeatureDisabledError(res, e)) return null;
    throw e;
  }
  return { academyId, academyDoc };
}

function readLeadId(req) {
  const query = req?.query || {};
  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  return String(query.leadId || query.lead_id || body.leadId || body.lead_id || '').trim();
}

async function handleLeadSummaryPeek(req, res) {
  const access = await ensureCopilotAccess(req, res);
  if (!access) return;
  const { academyId } = access;
  const leadId = readLeadId(req);
  if (!leadId) return res.status(400).json({ error: 'lead_id_required' });

  let lead;
  try {
    lead = await loadLeadContext(academyId, leadId);
  } catch {
    return res.status(404).json({ error: 'lead_not_found' });
  }
  if (!lead) return res.status(404).json({ error: 'lead_not_found' });

  const { messages, events } = await loadLeadHistoryBundle(academyId, leadId, lead);
  const result = evaluateLeadHistorySummaryCache({ lead, messages, events });
  return res.status(200).json(result);
}

export default async function followupCopilotHandler(req, res) {
  if (req.method === 'GET') {
    return handleLeadSummaryPeek(req, res);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ai_not_configured' });
  }

  const access = await ensureCopilotAccess(req, res);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  try {
    await assertBillingActive(academyId);
  } catch (e) {
    if (sendBillingGateError(res, e)) return;
    logApiError('followup-copilot/billing', e);
    return res.status(500).json({ error: apiErro(e, 'action') });
  }

  const body = (await readJsonBody(req)) || {};
  const mode = String(body.mode || '').trim().toLowerCase();
  const leadId = readLeadId(req) || String(body.leadId || body.lead_id || '').trim();
  const forceRefresh = body.forceRefresh === true || body.force_refresh === true;
  if (!leadId) return res.status(400).json({ error: 'lead_id_required' });
  if (mode !== 'summary' && mode !== 'draft') {
    return res.status(400).json({ error: 'invalid_mode' });
  }

  let lead;
  try {
    lead = await loadLeadContext(academyId, leadId);
  } catch {
    return res.status(404).json({ error: 'lead_not_found' });
  }
  if (!lead) return res.status(404).json({ error: 'lead_not_found' });

  const { messages, events, totalMessageCount, contactDays } = await loadLeadHistoryBundle(
    academyId,
    leadId,
    lead
  );

  const context = buildLeadHistoryContextBlock({
    lead,
    messages,
    events,
    academyName: academyDoc?.name,
    daysAgo: contactDays,
    nextAction: String(body.nextAction || '').trim(),
    forSummary: mode === 'summary',
    totalMessageCount,
  });

  try {
    if (mode === 'summary') {
      const result = await resolveLeadHistorySummary({
        lead,
        messages,
        events,
        contextBlock: context,
        forceRefresh,
        generateFn: async ({ context: ctx, previousText }) => {
          const userContent = formatSummaryUserPrompt({ context: ctx, previousText });
          const raw = await callClaudeUserMessage({
            apiKey: ANTHROPIC_API_KEY,
            system: LEAD_HISTORY_SUMMARY_SYSTEM,
            userContent,
            maxTokens: 800,
            temperature: 0.1,
            route: 'followup_copilot',
            academy_id: academyId,
          });
          return parseSummaryGenerationResponse(raw);
        },
      });

      if (result.serialized) {
        try {
          await databases.updateDocument(DB_ID, LEADS_COL, leadId, {
            ai_history_summary_json: result.serialized,
          });
        } catch (e) {
          logApiError('followup-copilot/persist-summary', e);
        }
      }

      return res.status(200).json({
        ok: true,
        has_cache: Boolean(result.summary),
        summary: result.summary,
        pontos_chave: result.pontos_chave,
        pendencias_mencionadas: result.pendencias_mencionadas,
        generated_at: result.generated_at,
        from_cache: result.from_cache,
        stale: result.stale,
        context_fingerprint: result.context_fingerprint,
      });
    }

    const templateKey = String(body.templateKey || body.template_key || 'dashboard_contact').trim();
    const templates = { ...DEFAULT_WHATSAPP_TEMPLATES };
    let templatesOverride = {};
    try {
      const raw = academyDoc?.whatsappTemplates;
      templatesOverride = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    } catch {
      void 0;
    }
    const templateRaw = String(templatesOverride[templateKey] || templates[templateKey] || '').trim();
    const baseText = templateRaw
      ? applyWhatsappTemplatePlaceholders(templateRaw, {
          lead: { name: lead.name, scheduledDate: lead.scheduledDate, scheduledTime: lead.scheduledTime },
          academyName: String(academyDoc?.name || '').trim(),
        })
      : '';

    const userContent = [
      context,
      '',
      baseText ? `Template base (${templateKey}):\n${baseText}` : 'Sem template base.',
      '',
      'Personalize a mensagem mantendo o objetivo do retorno pós-aula.',
    ].join('\n');

    const raw = await callClaudeUserMessage({
      apiKey: ANTHROPIC_API_KEY,
      system: DRAFT_SYSTEM,
      userContent,
      maxTokens: 500,
      temperature: 0.35,
      route: 'followup_copilot',
      academy_id: academyId,
    });
    const parsed = extractJsonObject(raw) || {};
    const draft = String(parsed.draft || raw).trim();
    return res.status(200).json({ ok: true, draft, templateKey });
  } catch (e) {
    logApiError('followup-copilot/claude', e);
    const code = String(e?.message || '').trim();
    const status = code === 'claude_timeout' ? 504 : 502;
    return res.status(status).json({ error: apiErro(e, 'action'), code: code || 'upstream_error' });
  }
}

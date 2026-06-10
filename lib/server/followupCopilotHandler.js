import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { assertBillingActive, sendBillingGateError } from './billingGate.js';
import { apiErro } from './friendlyError.js';
import { DB_ID, LEADS_COL, LEAD_EVENTS_COL } from './appwriteCollections.js';

const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
import { AGENT_HISTORY_WINDOW } from '../constants.js';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  applyWhatsappTemplatePlaceholders,
} from '../whatsappTemplateDefaults.js';
import { Client, Databases } from 'node-appwrite';

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

const SUMMARY_SYSTEM = `Você ajuda recepcionistas de academia de Jiu-Jitsu a retomar contato após aula experimental.
Responda APENAS com JSON válido:
{
  "summary": "2-3 frases em português sobre o lead e o contexto",
  "bullets": ["sugestão de abordagem 1", "sugestão 2"]
}
Seja objetivo, sem inventar fatos que não estejam no contexto.`;

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

async function callClaude({ system, userContent, maxTokens = 700 }) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature: 0.35,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  const raw = await resp.text();
  if (!resp.ok) throw new Error(raw.slice(0, 300) || 'Falha ao chamar Claude');
  const data = JSON.parse(raw);
  return (Array.isArray(data?.content) ? data.content : [])
    .filter((p) => p?.type === 'text')
    .map((p) => String(p.text || ''))
    .join('\n')
    .trim();
}

function parseMessages(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistente' : 'cliente',
        content: String(m.content || '').trim(),
      }))
      .filter((m) => m.content);
  } catch {
    return [];
  }
}

async function loadLeadContext(academyId, leadId) {
  if (!databases || !LEADS_COL) return null;
  const doc = await databases.getDocument(DB_ID, LEADS_COL, leadId);
  if (String(doc?.academyId || '').trim() !== academyId) return null;
  return doc;
}

async function loadWaMessages(academyId, phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits || !CONVERSATIONS_COL) return [];
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('phone_number', [digits]),
    Query.equal('academy_id', [academyId]),
    Query.orderDesc('updated_at'),
    Query.limit(1),
  ]);
  const doc = list.documents?.[0];
  return parseMessages(doc?.messages).slice(-AGENT_HISTORY_WINDOW);
}

async function loadRecentLeadEvents(academyId, leadId) {
  if (!LEAD_EVENTS_COL) return [];
  const res = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, [
    Query.equal('academy_id', [academyId]),
    Query.equal('lead_id', [leadId]),
    Query.orderDesc('at'),
    Query.limit(12),
  ]);
  return (res.documents || []).map((d) => ({
    type: String(d.type || ''),
    text: String(d.text || '').slice(0, 200),
    at: String(d.at || ''),
  }));
}

function buildContextBlock({ lead, messages, events, academyName, daysAgo, nextAction }) {
  const lines = [
    `Lead: ${lead.name || '—'}`,
    `Status: ${lead.status || '—'}`,
    `Aula experimental: ${String(lead.scheduledDate || '').slice(0, 10) || '—'} ${lead.scheduledTime || ''}`.trim(),
    `Dias desde a aula: ${daysAgo ?? '—'}`,
    nextAction ? `Próxima ação sugerida: ${nextAction}` : '',
    `Academia: ${academyName || '—'}`,
  ].filter(Boolean);

  if (events.length) {
    lines.push('', 'Eventos recentes:');
    for (const e of events.slice(0, 8)) {
      lines.push(`- [${e.type}] ${e.text}`.trim());
    }
  }

  if (messages.length) {
    lines.push('', 'Últimas mensagens WhatsApp:');
    for (const m of messages) {
      lines.push(`${m.role}: ${m.content}`);
    }
  }

  return lines.join('\n');
}

export default async function followupCopilotHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!databases) {
    return res.status(500).json({ error: 'appwrite_not_configured' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ai_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  try {
    await assertBillingActive(academyId);
  } catch (e) {
    if (sendBillingGateError(res, e)) return;
    return res.status(500).json({ error: apiErro(e, 'action') });
  }

  const body = (await readJsonBody(req)) || {};
  const mode = String(body.mode || '').trim().toLowerCase();
  const leadId = String(body.leadId || body.lead_id || '').trim();
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

  const scheduled = String(lead.scheduledDate || '').slice(0, 10);
  const classDay = scheduled ? new Date(`${scheduled}T00:00:00`) : new Date(lead.$createdAt || Date.now());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  classDay.setHours(0, 0, 0, 0);
  const daysAgo = Math.floor((today - classDay) / 86400000);

  const [messages, events] = await Promise.all([
    loadWaMessages(academyId, lead.phone),
    loadRecentLeadEvents(academyId, leadId),
  ]);

  const context = buildContextBlock({
    lead,
    messages,
    events,
    academyName: academyDoc?.name,
    daysAgo,
    nextAction: String(body.nextAction || '').trim(),
  });

  try {
    if (mode === 'summary') {
      const raw = await callClaude({ system: SUMMARY_SYSTEM, userContent: context });
      const parsed = extractJsonObject(raw) || {};
      return res.status(200).json({
        ok: true,
        summary: String(parsed.summary || raw).trim(),
        bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map(String) : [],
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

    const raw = await callClaude({ system: DRAFT_SYSTEM, userContent, maxTokens: 500 });
    const parsed = extractJsonObject(raw) || {};
    const draft = String(parsed.draft || raw).trim();
    return res.status(200).json({ ok: true, draft, templateKey });
  } catch (e) {
    return res.status(502).json({ error: apiErro(e, 'action') });
  }
}

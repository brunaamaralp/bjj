import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { fetchAcademyPromptSettings } from './academyPromptSettings.js';
import { parseFaqItems } from '../whatsappTemplateDefaults.js';
import { buildPromptContactContext, profileLineForSystemPrompt } from './agentPromptContext.js';
import { assembleAgentSystemPrompt } from './assembleAgentSystemPrompt.js';
import {
  CLAUDE_TIMEOUT_MS,
  CLAUDE_MAX_RETRIES,
  CLAUDE_RETRY_DELAY_MS,
  CLAUDE_RETRYABLE_HTTP_STATUS
} from '../constants.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function ensureConfigOk(res) {
  if (!DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  return true;
}

function extractJsonObject(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const firstBrace = t.indexOf('{');
  const lastBrace = t.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const candidate = t.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeHistoryForClaude(historyRaw) {
  if (!Array.isArray(historyRaw)) return [];
  return historyRaw
    .filter((m) => m && typeof m === 'object')
    .map((m) => {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content = String(m.content || m.text || '').trim();
      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

async function callClaude({ system, messages, maxTokens, temperature }, attempt = 0) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurado');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        temperature,
        system,
        messages
      }),
      signal: controller.signal
    });

    const raw = await resp.text();
    clearTimeout(timeoutId);

    if (!resp.ok) {
      if (CLAUDE_RETRYABLE_HTTP_STATUS.includes(resp.status) && attempt < CLAUDE_MAX_RETRIES) {
        const delay = CLAUDE_RETRY_DELAY_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        return callClaude({ system, messages, maxTokens, temperature }, attempt + 1);
      }
      const errObj = extractJsonObject(raw);
      const msg = errObj?.error?.message ? String(errObj.error.message) : raw.slice(0, 500);
      throw new Error(msg || 'Falha ao chamar Claude');
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('Resposta Anthropic não é JSON válido');
    }

    const parts = Array.isArray(data?.content) ? data.content : [];
    const text = parts
      .filter((p) => p && p.type === 'text')
      .map((p) => String(p.text || ''))
      .join('\n')
      .trim();
    return text;
  } catch (e) {
    clearTimeout(timeoutId);
    const name = e && typeof e === 'object' && 'name' in e ? e.name : '';
    if (name === 'AbortError' && attempt < CLAUDE_MAX_RETRIES) {
      const delay = CLAUDE_RETRY_DELAY_MS * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
      return callClaude({ system, messages, maxTokens, temperature }, attempt + 1);
    }
    if (name === 'AbortError') throw new Error(`Timeout na chamada ao Claude após ${CLAUDE_TIMEOUT_MS}ms`);
    throw e;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!ensureConfigOk(res)) return;

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const academyId = String(access.academyId || '').trim();
  const academyDoc = access.doc;

  let body = req.body && typeof req.body === 'object' ? req.body : {};
  // Alguns setups enviam JSON; em caso de body string, tenta parse.
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body);
    } catch {
      body = {};
    }
  }

  const bodyAcademyId = String(body.academyId || body.academy_id || '').trim();
  if (bodyAcademyId && bodyAcademyId !== academyId) {
    return res.status(400).json({ sucesso: false, erro: 'academyId ausente ou divergente' });
  }

  const message = String(body.message || '').trim();
  if (!message) return res.status(400).json({ sucesso: false, erro: 'message ausente' });

  const history = normalizeHistoryForClaude(body.history);

  const today = new Date().toISOString().split('T')[0];
  const resetDate = String(academyDoc?.test_messages_reset_date || '').trim();
  const usedToday = resetDate === today ? Number(academyDoc?.test_messages_today) || 0 : 0;

  const testsLimit = 10;
  if (usedToday >= testsLimit) {
    const resetAt = 'amanhã às 00:00';
    return res.status(429).json({
      error: 'limite_diario',
      message:
        'Você atingiu o limite de 10 testes hoje. Volte amanhã para continuar testando.',
      resetAt
    });
  }

  // Monta system prompt igual ao agente real, mas sem persistir conversa.
  const promptSettings = await fetchAcademyPromptSettings(academyId);
  const effectiveIntro = String(promptSettings.intro || '').trim();
  const effectiveBody = String(promptSettings.body || '').trim();
  const extraSuffix = String(promptSettings.suffix || '').trim();

  if (!effectiveIntro && !effectiveBody) {
    return res.status(400).json({ sucesso: false, erro: 'prompt_nao_configurado' });
  }

  const faqItems = parseFaqItems(academyDoc?.faq_data);
  const contactCtx = buildPromptContactContext(null, 'amigo');
  const profileLine = profileLineForSystemPrompt(contactCtx);

  const system = assembleAgentSystemPrompt({
    effectiveIntro,
    effectiveBody,
    extraSuffix,
    profileLine,
    nomeContatoLine: contactCtx.nomeContatoLine,
    summaryText: '',
    faqItems
  });

  const claudeMessages = [...history, { role: 'user', content: message }];
  let outputText = '';
  try {
    outputText = await callClaude({
      system,
      messages: claudeMessages,
      maxTokens: 500,
      temperature: 0.4
    });
  } catch (e) {
    return res.status(502).json({
      sucesso: false,
      erro: e?.message || 'Falha ao chamar Claude'
    });
  }

  const parsedOut = extractJsonObject(outputText) || {};
  const responseText =
    typeof parsedOut?.resposta === 'string'
      ? String(parsedOut.resposta).trim()
      : String(outputText || '').trim();

  // Incrementa contador de testes apenas se a IA respondeu.
  const nextUsed = usedToday + 1;
  try {
    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
      test_messages_today: nextUsed,
      test_messages_reset_date: today
    });
  } catch (e) {
    return res.status(500).json({
      sucesso: false,
      erro: 'Falha ao atualizar contador de testes (verifique campos test_messages_today/test_messages_reset_date na collection academies).',
      details: e?.message || String(e || '')
    });
  }

  return res.status(200).json({
    response: responseText,
    testsUsedToday: nextUsed,
    testsLimit
  });
}


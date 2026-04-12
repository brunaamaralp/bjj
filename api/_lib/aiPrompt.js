import { Account, Client, Databases, ID, Permission, Query, Role, Teams } from 'node-appwrite';
import { setPlan } from '../../src/services/planService.js';
import { AGENT_HISTORY_WINDOW } from '../../lib/constants.js';
import { getPromptSettingsDocForSave } from '../../lib/server/academyPromptSettings.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !CONVERSATIONS_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'ACADEMIES_COL não configurado' });
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
  return String(DEFAULT_ACADEMY_ID || '').trim();
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
    if (ownerId && userId && ownerId === userId) return doc;

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const memberships = await teams.listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)]);
        const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
        if (list.length > 0) return doc;
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

function permissionsForAcademyDoc(academyDoc) {
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const teamId = String(academyDoc?.teamId || '').trim();
  const perms = [];
  if (ownerId) perms.push(Permission.read(Role.user(ownerId)), Permission.update(Role.user(ownerId)), Permission.delete(Role.user(ownerId)));
  if (teamId) perms.push(Permission.read(Role.team(teamId)), Permission.update(Role.team(teamId)), Permission.delete(Role.team(teamId)));
  if (perms.length > 0) return perms;
  return [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
}

const IMPROVE_REPLY_SYSTEM = `Você é um assistente que melhora rascunhos de mensagens de atendimento humano no WhatsApp para uma academia de Jiu-Jitsu (Gracie Barra / atendimento em português do Brasil).

Sua tarefa: receber o contexto recente da conversa e o rascunho digitado pelo atendente; devolver APENAS o texto final melhorado, pronto para enviar.

Regras:
- Preserve o significado e a intenção do rascunho — não mude o recado principal.
- Tom caloroso, natural e profissional, como uma recepcionista experiente; adapte levemente ao tom que a pessoa (user) usa na conversa.
- Corrija gramática, pontuação e clareza; quebras de linha adequadas ao WhatsApp.
- Seja conciso quando o rascunho for curto; não alongue sem necessidade.
- NÃO invente preços, horários, endereços, promoções ou políticas que não apareçam explicitamente no contexto ou no rascunho.
- NÃO diga que é uma IA; não meta-comentários ("aqui está a versão melhorada").
- No máximo 1 emoji na mensagem, só se fizer sentido e o rascunho já sugerir algo informal; se não couber, zero emoji.
- Responda somente com o texto da mensagem melhorada, sem aspas, sem markdown, sem prefixos.`;

const GENERATE_PROMPT_SYSTEM = `Você é especialista em criar prompts para assistentes virtuais de estúdios fitness (yoga, pilates, dança, artes marciais, musculação, etc).
Com base nas informações fornecidas pelo gestor, gere um prompt completo e profissional para a assistente virtual do estúdio.

Estrutura obrigatória do prompt gerado:
1. Identidade e personalidade da assistente (nome, tom, estilo)
2. Regra de grupos (nunca atender grupos do WhatsApp — retornar "" vazio)
3. Perfil do contato (como identificar lead vs aluno e adaptar atendimento)
4. Turmas e horários (todas as turmas informadas)
5. Planos e preços (todos os planos informados)
6. Uniforme e equipamentos (se aplicável)
7. Aula/sessão experimental (se oferecida)
8. Regras de tom de atendimento
9. Regras de formatação (sem blocos longos, máx 1 emoji por mensagem)
10. Regras de vendas (funil rápido, 1 pergunta por vez, CTA no momento certo)

Importante:
- Adapte completamente ao tipo de estúdio e modalidade informada
- Não mencione outras academias ou marcas
- Use o nome da assistente informado pelo gestor
- Retorne APENAS o texto do prompt, sem markdown, sem explicações, sem títulos com #, sem blocos de código`;

async function readJsonBodyForPost(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length === 0) return null;
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizePhoneForImprove(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function safeParseMessagesForImprove(raw) {
  if (raw === null || raw === undefined || raw === '') return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : String(m.content || ''),
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : '',
        sender: typeof m.sender === 'string' ? m.sender : undefined
      }));
  } catch {
    return [];
  }
}

async function callClaudeImprove({ system, messages, maxTokens, temperature }) {
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
    })
  });

  const raw = await resp.text();
  if (!resp.ok) {
    let msg = raw.slice(0, 500);
    try {
      const err = JSON.parse(raw);
      if (err?.error?.message) msg = String(err.error.message);
    } catch {
      void 0;
    }
    throw new Error(msg || 'Falha ao chamar Claude');
  }
  const data = JSON.parse(raw);
  const parts = Array.isArray(data?.content) ? data.content : [];
  return parts
    .filter((p) => p && p.type === 'text')
    .map((p) => String(p.text || ''))
    .join('\n')
    .trim();
}

async function handleImproveReply(res, academyId, body) {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ sucesso: false, erro: 'ANTHROPIC_API_KEY não configurado' });
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ sucesso: false, erro: 'Body inválido' });
  }

  const bodyAcademy = String(body.academyId || body.academy_id || '').trim();
  if (bodyAcademy && bodyAcademy !== academyId) {
    return res.status(400).json({ sucesso: false, erro: 'academyId do body não confere com o cabeçalho' });
  }

  const phone = normalizePhoneForImprove(body.phone);
  if (!phone) {
    return res.status(400).json({ sucesso: false, erro: 'phone ausente ou inválido' });
  }

  const draft = typeof body.draft === 'string' ? body.draft : String(body.draft || '');
  if (!draft.trim()) {
    return res.status(400).json({ sucesso: false, erro: 'draft ausente' });
  }

  let messages = [];
  try {
    const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
      Query.equal('phone_number', [phone]),
      Query.equal('academy_id', [academyId]),
      Query.orderDesc('updated_at'),
      Query.limit(1)
    ]);
    const existing = list.documents && list.documents[0] ? list.documents[0] : null;
    const all = existing ? safeParseMessagesForImprove(existing.messages) : [];
    messages = all.slice(-AGENT_HISTORY_WINDOW);
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao carregar conversa' });
  }

  const contextLines = messages.map((m) => {
    const who = m.role === 'assistant' ? 'assistente' : 'cliente';
    const tag = m.sender === 'human' ? ' (humano)' : '';
    return `${who}${tag}: ${m.content}`;
  });

  const userContent = [
    contextLines.length ? `Últimas mensagens (mais antigas → mais recentes):\n${contextLines.join('\n\n')}` : '(Sem mensagens anteriores no histórico.)',
    '',
    'Rascunho do atendente para melhorar:',
    draft.trim()
  ].join('\n');

  let improved = '';
  try {
    improved = await callClaudeImprove({
      system: IMPROVE_REPLY_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 900,
      temperature: 0.35
    });
  } catch (e) {
    return res.status(502).json({ sucesso: false, erro: e?.message || 'Falha ao melhorar texto' });
  }

  if (!improved.trim()) {
    return res.status(502).json({ sucesso: false, erro: 'Resposta vazia da IA' });
  }

  return res.status(200).json({ sucesso: true, improved: improved.trim() });
}

async function handleGeneratePrompt(res, academyId, body) {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ sucesso: false, erro: 'ANTHROPIC_API_KEY não configurado' });
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ sucesso: false, erro: 'Body inválido' });
  }

  const bodyAcademy = String(body.academyId || body.academy_id || '').trim();
  if (bodyAcademy && bodyAcademy !== academyId) {
    return res.status(400).json({ sucesso: false, erro: 'academyId do body não confere com o cabeçalho' });
  }

  const wizardData = body.wizardData;
  if (!wizardData || typeof wizardData !== 'object' || Array.isArray(wizardData)) {
    return res.status(400).json({ sucesso: false, erro: 'wizardData ausente ou inválido' });
  }

  const userContent = `Dados do estúdio fornecidos pelo gestor:
${JSON.stringify(wizardData, null, 2)}

Gere o prompt completo para a assistente virtual deste estúdio.`;

  let prompt = '';
  try {
    prompt = await callClaudeImprove({
      system: GENERATE_PROMPT_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 2000,
      temperature: 0.45
    });
  } catch (e) {
    return res.status(502).json({ sucesso: false, erro: e?.message || 'Falha ao gerar prompt' });
  }

  if (!prompt.trim()) {
    return res.status(500).json({ sucesso: false, erro: 'Prompt gerado vazio' });
  }

  console.log('[ai-prompt] generate_prompt concluído', { academyId });
  return res.status(200).json({ sucesso: true, prompt: prompt.trim() });
}

export default async function handler(req, res) {
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const academyDoc = await ensureAcademyAccess(req, res, me);
  if (!academyDoc) return;
  const academyId = String(academyDoc.$id || '').trim();

  try {
    if (req.method === 'POST') {
      const body = (await readJsonBodyForPost(req)) || {};
      const action = String(body.action || '').trim().toLowerCase();
      if (action === 'generate_prompt') {
        return handleGeneratePrompt(res, academyId, body);
      }
      if (action === 'improve_reply') {
        return handleImproveReply(res, academyId, body);
      }
      res.setHeader('Allow', 'GET, PUT, POST, PATCH');
      return res.status(405).json({ sucesso: false, erro: 'Use action: improve_reply ou generate_prompt no body JSON' });
    }

    if (req.method === 'GET') {
      const { doc } = await getPromptSettingsDocForSave(academyId);
      const plan = String(academyDoc?.plan || 'starter').trim().toLowerCase();
      const safePlan = ['starter', 'studio', 'pro'].includes(plan) ? plan : 'starter';
      const out = {
        prompt_intro: String(doc?.prompt_intro || '').trim(),
        prompt_body: String(doc?.prompt_body || '').trim(),
        prompt_suffix: String(doc?.prompt_suffix || '').trim(),
        ia_ativa: academyDoc?.ia_ativa === true,
        birthdayMessage: String(academyDoc?.birthdayMessage || '').trim(),
        ai_name: String(academyDoc?.ai_name || '').trim(),
        plan: safePlan,
        ai_threads_used: Number(academyDoc?.ai_threads_used) || 0,
        ai_threads_limit: Number(academyDoc?.ai_threads_limit) || 300,
        ai_overage_enabled: academyDoc?.ai_overage_enabled !== false && academyDoc?.ai_overage_enabled !== 'false',
        billing_cycle_day: Math.min(
          Math.max(parseInt(String(academyDoc?.billing_cycle_day ?? 1), 10) || 1, 1),
          28
        ),
        wizard_data: String(academyDoc?.wizard_data ?? '')
      };
      return res.status(200).json({ sucesso: true, ...out });
    }

    if (req.method === 'PATCH') {
      const body = (await readJsonBodyForPost(req)) || {};
      const patchAction = String(body.action || '').trim().toLowerCase();
      if (patchAction === 'save_wizard_data') {
        const raw =
          typeof body.wizard_data === 'string' ? body.wizard_data : JSON.stringify(body.wizard_data ?? {});
        const str = String(raw || '').trim();
        if (!str) {
          return res.status(400).json({ sucesso: false, erro: 'wizard_data vazio' });
        }
        if (str.length > 10000) {
          return res.status(400).json({ sucesso: false, erro: 'wizard_data excede 10.000 caracteres' });
        }
        try {
          JSON.parse(str);
        } catch {
          return res.status(400).json({ sucesso: false, erro: 'wizard_data JSON inválido' });
        }
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { wizard_data: str });
        return res.status(200).json({ sucesso: true });
      }
      if (patchAction === 'save_birthday_message') {
        const msg = String(body.birthdayMessage || '').trim().slice(0, 500);
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          birthdayMessage: msg
        });
        return res.status(200).json({ sucesso: true, birthdayMessage: msg });
      if (patchAction === 'toggle_ia') {
        const novoStatus = Boolean(body.ia_ativa);
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          ia_ativa: novoStatus
        });
        console.log('[ai-prompt] ia_ativa atualizado', { academyId, novoStatus });
        return res.status(200).json({ sucesso: true, ia_ativa: novoStatus });
      }
      if (patchAction === 'set_plan') {
        const p = String(body.plan || '')
          .trim()
          .toLowerCase();
        if (!['starter', 'studio', 'pro'].includes(p)) {
          return res.status(400).json({ sucesso: false, erro: 'plan inválido (starter, studio ou pro)' });
        }
        await setPlan(academyId, p, academyDoc);
        return res.status(200).json({ sucesso: true, plan: p });
      }
      if (patchAction === 'update_ai_settings') {
        const patch = {};
        if (body.ai_name !== undefined) {
          const n = String(body.ai_name || '').trim().slice(0, 80);
          if (!n) {
            return res.status(400).json({ sucesso: false, erro: 'ai_name não pode ser vazio' });
          }
          patch.ai_name = n;
        }
        if (body.ai_overage_enabled !== undefined) {
          patch.ai_overage_enabled = Boolean(body.ai_overage_enabled);
        }
        if (body.billing_cycle_day !== undefined) {
          const d = parseInt(String(body.billing_cycle_day), 10);
          if (!Number.isFinite(d) || d < 1 || d > 28) {
            return res.status(400).json({ sucesso: false, erro: 'billing_cycle_day deve ser entre 1 e 28' });
          }
          patch.billing_cycle_day = d;
        }
        if (Object.keys(patch).length === 0) {
          return res.status(400).json({ sucesso: false, erro: 'Nenhum campo para atualizar' });
        }
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, patch);
        return res.status(200).json({ sucesso: true, ...patch });
      }
      res.setHeader('Allow', 'GET, PUT, POST, PATCH');
      return res.status(405).json({
        sucesso: false,
        erro:
          'Use action: save_wizard_data, toggle_ia, save_birthday_message, set_plan ou update_ai_settings no body JSON'
      });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const intro = String(body.prompt_intro || '').trim();
      const bodyTxt = String(body.prompt_body || '').trim();
      const suffix = String(body.prompt_suffix || '').trim();

      const perms = permissionsForAcademyDoc(academyDoc);
      const { doc, coll, kind } = await getPromptSettingsDocForSave(academyId);
      const data = { prompt_intro: intro, prompt_body: bodyTxt, prompt_suffix: suffix };
      if (doc) {
        await databases.updateDocument(DB_ID, coll, doc.$id, data);
        return res.status(200).json({ sucesso: true });
      }
      if (kind === 'settings') {
        await databases.createDocument(DB_ID, coll, ID.unique(), { academy_id: academyId, ...data }, perms);
        return res.status(200).json({ sucesso: true });
      }
      await databases.createDocument(
        DB_ID,
        coll,
        ID.unique(),
        { academy_id: academyId, phone_number: '__settings__', ...data },
        perms
      );
      return res.status(200).json({ sucesso: true });
    }

    res.setHeader('Allow', 'GET, PUT, POST, PATCH');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}


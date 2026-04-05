import { Account, Client, Databases, ID, Permission, Query, Role, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const SETTINGS_COL = process.env.APPWRITE_SETTINGS_COLLECTION_ID || process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || '';
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

async function getSettingsDoc(academyId) {
  if (SETTINGS_COL) {
    const list = await databases.listDocuments(DB_ID, SETTINGS_COL, [Query.equal('academy_id', [academyId]), Query.limit(1)]);
    const doc = list.documents && list.documents[0] ? list.documents[0] : null;
    if (doc) return { doc, coll: SETTINGS_COL, kind: 'settings' };
  }
  const list2 = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('academy_id', [academyId]),
    Query.equal('phone_number', ['__settings__']),
    Query.limit(1)
  ]);
  const doc2 = list2.documents && list2.documents[0] ? list2.documents[0] : null;
  if (doc2) return { doc: doc2, coll: CONVERSATIONS_COL, kind: 'conversations' };
  return { doc: null, coll: SETTINGS_COL || CONVERSATIONS_COL, kind: SETTINGS_COL ? 'settings' : 'conversations' };
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
    messages = all.slice(-10);
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
      if (action === 'improve_reply') {
        return handleImproveReply(res, academyId, body);
      }
      res.setHeader('Allow', 'GET, PUT, POST');
      return res.status(405).json({ sucesso: false, erro: 'Use action: improve_reply no body JSON' });
    }

    if (req.method === 'GET') {
      const { doc } = await getSettingsDoc(academyId);
      const out = {
        prompt_intro: String(doc?.prompt_intro || '').trim(),
        prompt_body: String(doc?.prompt_body || '').trim(),
        prompt_suffix: String(doc?.prompt_suffix || '').trim()
      };
      return res.status(200).json({ sucesso: true, ...out });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const intro = String(body.prompt_intro || '').trim();
      const bodyTxt = String(body.prompt_body || '').trim();
      const suffix = String(body.prompt_suffix || '').trim();

      const perms = permissionsForAcademyDoc(academyDoc);
      const { doc, coll, kind } = await getSettingsDoc(academyId);
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

    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}


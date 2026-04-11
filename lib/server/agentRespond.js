import { Client, Databases, ID, Permission, Query, Role, Account, Teams } from 'node-appwrite';
import { humanHandoffIsActive, humanHandoffUntilFromMs } from '../../lib/humanHandoffUntil.js';
import { getHumanHandoffHoursForServer } from '../constants.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CONVERSATION_SUMMARY_ENABLED = String(process.env.CONVERSATION_SUMMARY_ENABLED || '').toLowerCase() === 'true' ||
  String(process.env.CONVERSATION_SUMMARY_ENABLED || '') === '1';
const SETTINGS_COL = process.env.APPWRITE_SETTINGS_COLLECTION_ID || process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || '';
const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const teams = new Teams(client);

// Rate limit simples em memória por academyId
// Reseta a cada cold start — aceitável para Vercel Hobby
const _rlMap = new Map();
function checkRateLimit(academyId, maxReq = 30, windowMs = 60000) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = `${academyId}:${bucket}`;
  const count = (_rlMap.get(key) || 0) + 1;
  _rlMap.set(key, count);
  // Limpar buckets antigos do mesmo academyId
  for (const k of _rlMap.keys()) {
    if (k.startsWith(`${academyId}:`) && k !== key) _rlMap.delete(k);
  }
  return count <= maxReq;
}

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !CONVERSATIONS_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'ACADEMIES_COL não configurado' });
    return false;
  }
  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ sucesso: false, erro: 'ANTHROPIC_API_KEY não configurado' });
    return false;
  }
  return true;
}

function ensureJson(req, res) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) {
    res.status(400).json({ sucesso: false, erro: 'Content-Type inválido' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ sucesso: false, erro: 'Body ausente' });
    return false;
  }
  return true;
}

function firstName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  return n.split(/\s+/).filter(Boolean)[0] || '';
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function safeParseMessages(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : String(m.content || ''),
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString(),
        message_id:
          typeof m.message_id === 'string'
            ? m.message_id
            : typeof m.messageId === 'string'
              ? m.messageId
              : typeof m.id === 'string'
                ? m.id
                : '',
        in_reply_to:
          typeof m.in_reply_to === 'string'
            ? m.in_reply_to
            : typeof m.inReplyTo === 'string'
              ? m.inReplyTo
              : '',
        classificacao: m.classificacao && typeof m.classificacao === 'object' ? m.classificacao : null
      }));
  } catch {
    return [];
  }
}

function resolveAcademyId(req) {
  const h = String(req.headers['x-academy-id'] || '').trim();
  if (h) return h;
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const fromBody = String(b.academy_id || b.academyId || '').trim();
  if (fromBody) return fromBody;
  return String(DEFAULT_ACADEMY_ID || '').trim();
}

function resolveAcademyIdForMembership(req) {
  const h = String(req.headers['x-academy-id'] || '').trim();
  if (h) return h;
  return String(DEFAULT_ACADEMY_ID || '').trim();
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
    return await account.get();
  } catch {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
}

async function ensureAcademyAccess(req, res, me) {
  const academyId = resolveAcademyIdForMembership(req);
  if (!academyId) {
    res.status(400).json({ sucesso: false, erro: 'x-academy-id ausente' });
    return null;
  }
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    const ownerId = String(doc?.ownerId || '').trim();
    const userId = String(me?.$id || '').trim();
    if (ownerId && userId && ownerId === userId) return academyId;

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const memberships = await teams.listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)]);
        const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
        if (list.length > 0) return academyId;
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

async function ensureAcademyExists(req, res) {
  const academyId = resolveAcademyId(req);
  if (!academyId) {
    res.status(400).json({ sucesso: false, erro: 'academy_id ausente' });
    return null;
  }
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    if (!doc || !doc.$id) {
      res.status(404).json({ sucesso: false, erro: 'Academia não encontrada' });
      return null;
    }
    return doc;
  } catch {
    res.status(404).json({ sucesso: false, erro: 'Academia não encontrada' });
    return null;
  }
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

function parseSummaryField(raw) {
  const s = String(raw || '').trim();
  if (!s) return { updatedAtIso: '', updatedAtMs: 0, text: '' };
  const obj = extractJsonObject(s);
  const updatedAtIso = typeof obj?.updated_at === 'string' ? obj.updated_at : '';
  const text = typeof obj?.text === 'string' ? obj.text : s;
  const ms = updatedAtIso ? new Date(updatedAtIso).getTime() : 0;
  return { updatedAtIso, updatedAtMs: Number.isFinite(ms) ? ms : 0, text: String(text || '').trim() };
}

function shouldUpdateSummary({ enabled, history, currentSummaryRaw }) {
  if (!enabled) return false;
  const h = Array.isArray(history) ? history : [];
  if (h.length < 6) return false;
  const parsed = parseSummaryField(currentSummaryRaw);
  if (!parsed.text) return true;
  const lastTs = h[h.length - 1]?.timestamp || '';
  const lastMs = lastTs ? new Date(String(lastTs)).getTime() : 0;
  const lastOkMs = Number.isFinite(lastMs) ? lastMs : 0;
  if (!lastOkMs) return false;
  if (!parsed.updatedAtMs) return true;
  return lastOkMs - parsed.updatedAtMs > 6 * 60 * 60 * 1000;
}

async function generateSummary({ previousSummaryText, recentMessages }) {
  const parts = [];
  if (previousSummaryText) parts.push({ role: 'user', content: `Resumo anterior:\n${previousSummaryText}` });
  parts.push({
    role: 'user',
    content: JSON.stringify(
      {
        instrucoes:
          'Gere um resumo curto e útil para contexto de atendimento (em português), com no máximo 10 linhas. Inclua: nome (se houver), objetivo do contato, dúvidas principais, preferências (horário/idade), status (experimental/agendamento/valores) e qualquer detalhe importante. Não invente nada.',
        ultimas_mensagens: (recentMessages || []).map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        }))
      },
      null,
      0
    )
  });
  const text = await callClaude({
    system: 'Você é um resumidor. Responda SOMENTE com o texto do resumo, sem markdown.',
    messages: parts,
    maxTokens: 250,
    temperature: 0
  });
  return String(text || '').trim();
}

async function getOrCreateConversationDoc(phone, academyId, academyDoc) {
  const a = String(academyId || '').trim();
  if (!a) throw new Error('academy_id ausente');
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('phone_number', [phone]),
    Query.equal('academy_id', [a]),
    Query.limit(1)
  ]);
  const existing = list.documents && list.documents[0] ? list.documents[0] : null;
  if (existing) return existing;

  const nowIso = new Date().toISOString();
  return databases.createDocument(
    DB_ID,
    CONVERSATIONS_COL,
    ID.unique(),
    {
      phone_number: phone,
      messages: JSON.stringify([]),
      updated_at: nowIso,
      academy_id: a
    },
    permissionsForAcademyDoc(academyDoc)
  );
}

async function callClaude({ system, messages, maxTokens, temperature }) {
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
    const err = extractJsonObject(raw);
    const msg = err?.error?.message ? String(err.error.message) : raw.slice(0, 500);
    throw new Error(msg || 'Falha ao chamar Claude');
  }
  const data = JSON.parse(raw);
  const parts = Array.isArray(data?.content) ? data.content : [];
  const text = parts
    .filter((p) => p && p.type === 'text')
    .map((p) => String(p.text || ''))
    .join('\n')
    .trim();
  return text;
}

function normalizeClassification(obj) {
  const allowed = {
    intencao: [
      'horarios_adulto',
      'horarios_crianca',
      'horarios_junior',
      'preco_adulto',
      'preco_crianca',
      'preco_uniforme_adulto',
      'preco_uniforme_infantil',
      'aula_experimental',
      'duvida',
      'aluno_atual',
      'outro'
    ],
    tipo_contato: ['lead', 'aluno'],
    prioridade: ['alta', 'media', 'baixa'],
    lead_quente: ['sim', 'nao'],
    precisa_resposta_humana: ['sim', 'nao'],
    perfil_lead: ['adulto_para_si', 'responsavel_crianca', 'responsavel_junior', 'indefinido']
  };

  const pick = (key, fallback) => {
    const v = String(obj?.[key] || '').trim();
    return allowed[key].includes(v) ? v : fallback;
  };

  return {
    intencao: pick('intencao', 'outro'),
    tipo_contato: pick('tipo_contato', 'lead'),
    prioridade: pick('prioridade', 'media'),
    lead_quente: pick('lead_quente', 'nao'),
    precisa_resposta_humana: pick('precisa_resposta_humana', 'nao'),
    perfil_lead: pick('perfil_lead', 'indefinido')
  };
}

/** Intenções que indicam interesse em aula experimental, horários ou valores para entrar — viram lead no CRM. */
const INTENT_QUALIFIES_AS_LEAD = new Set([
  'aula_experimental',
  'horarios_adulto',
  'horarios_crianca',
  'horarios_junior',
  'preco_adulto',
  'preco_crianca',
  'preco_uniforme_adulto',
  'preco_uniforme_infantil'
]);

/**
 * Só cria documento na coleção Leads após a classificação (evita inflar métricas com "oi", suporte ou aluno atual).
 * Inclui casos ambíguos quando o modelo marca lead_quente.
 */
function shouldAutoCreateLeadFromClassification(classificacao) {
  if (!classificacao || typeof classificacao !== 'object') return false;
  if (String(classificacao.tipo_contato || '').trim() === 'aluno') return false;
  const intent = String(classificacao.intencao || '').trim();
  if (intent === 'aluno_atual') return false;
  if (INTENT_QUALIFIES_AS_LEAD.has(intent)) return true;
  const quente = String(classificacao.lead_quente || '').trim() === 'sim';
  if (quente && (intent === 'duvida' || intent === 'outro')) return true;
  return false;
}

function findAssistantReply(history, messageId) {
  const mid = String(messageId || '').trim();
  if (!mid) return null;
  const hit = history.find((m) => m?.role === 'assistant' && String(m?.in_reply_to || '').trim() === mid);
  if (!hit) return null;
  return {
    resposta: String(hit.content || '').trim(),
    classificacao: normalizeClassification(hit.classificacao || {})
  };
}

function parseIsoToMs(iso) {
  const d = new Date(String(iso || ''));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findLeadByPhone(phone, academyId) {
  if (!LEADS_COL) return null;
  const a = String(academyId || '').trim();
  if (!a) return null;
  const p = normalizePhone(phone);
  const candidates = [];
  if (p) candidates.push(p);
  const raw = String(phone || '').trim();
  if (raw && raw !== p) candidates.push(raw);

  const queryCombos = [
    { academy: 'academy_id', phone: 'phone_number' },
    { academy: 'academy_id', phone: 'phone' },
    { academy: 'academyId', phone: 'phone' },
    { academy: 'academyId', phone: 'phone_number' }
  ];

  for (const c of candidates) {
    for (const combo of queryCombos) {
      try {
        const list = await databases.listDocuments(DB_ID, LEADS_COL, [
          Query.equal(combo.academy, [a]),
          Query.equal(combo.phone, [c]),
          Query.limit(1)
        ]);
        const doc = list.documents && list.documents[0] ? list.documents[0] : null;
        if (doc) return doc;
      } catch {}
    }
  }
  return null;
}

function getLeadTurmaFromDoc(doc) {
  return String(doc?.type || doc?.tipo || '').trim();
}

function normalizeTurmaKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function turmaIsKidsOrJuniores(raw) {
  const t = normalizeTurmaKey(raw);
  if (!t) return false;
  if (t.includes('junior')) return true;
  if (t.includes('kids')) return true;
  if (t.includes('crianca')) return true;
  if (t.includes('infantil')) return true;
  if (t.includes('pequeno')) return true;
  return false;
}

function turmaIsAdulto(raw) {
  const t = normalizeTurmaKey(raw);
  if (!t) return false;
  if (t.includes('adult')) return true;
  if (t.includes('feminin')) return true;
  if (t.includes('no-gi') || t.includes('nogi')) return true;
  return false;
}

/**
 * Monta contexto de perfil + linha "nome" para o system prompt.
 * kids/juniores/criança: telefone costuma ser do responsável — nome do cadastro é do aluno.
 */
function buildPromptContactContext(leadDoc, whatsappDisplayNameRaw) {
  const waFirst = firstName(whatsappDisplayNameRaw) || 'amigo';

  if (!leadDoc) {
    return {
      mode: 'lead',
      profileAppendix: '',
      nomeContatoLine: `Nome do contato (WhatsApp): ${waFirst}.`
    };
  }

  const turma = getLeadTurmaFromDoc(leadDoc);
  const cadastroNome = String(leadDoc.name || '').trim() || '(sem nome no cadastro)';

  if (turmaIsKidsOrJuniores(turma)) {
    const turmaLabel = turma || 'kids/juniores';
    const parentName = String(leadDoc.parentName || leadDoc.parent_name || '').trim();

    if (parentName) {
      return {
        mode: 'responsavel_aluno',
        nomeAluno: cadastroNome,
        turma,
        profileAppendix:
          '\n\nCONTEXTO OBRIGATÓRIO — TELEFONE DO RESPONSÁVEL:\n' +
          `Turma/tipo "${turmaLabel}". O nome "${cadastroNome}" no cadastro é do ALUNO (criança/junior). O responsável cadastrado é "${parentName}".\n` +
          '- Nunca trate o interlocutor como se se chamasse pelo nome do aluno.\n' +
          '- Dirija-se ao responsável; use o nome do aluno ao falar do filho/aluno (horário, experimental, etc.).\n' +
          '- Pode tratar o responsável pelo nome cadastrado quando soar natural; se o nome no WhatsApp divergir muito, adapte à conversa.',
        nomeContatoLine:
          `Nome no cadastro (ALUNO — turma ${turmaLabel}): ${cadastroNome}.\n` +
          `Responsável no cadastro: ${parentName}. Não confundir os dois.`
      };
    }

    return {
      mode: 'responsavel_aluno',
      nomeAluno: cadastroNome,
      turma,
      profileAppendix:
        '\n\nCONTEXTO OBRIGATÓRIO — TELEFONE DO RESPONSÁVEL:\n' +
        `Este número está no cadastro com turma/tipo "${turmaLabel}". O nome "${cadastroNome}" no cadastro é do ALUNO (criança/junior), não da pessoa que usa o WhatsApp.\n` +
        '- Nunca trate o interlocutor como se se chamasse esse nome.\n' +
        '- Dirija-se ao responsável; use o nome do aluno só ao falar do filho/aluno (horário da turma, experimental da criança, etc.).\n' +
        '- O nome de quem escreve não vem do cadastro como pessoa — se não estiver claro, pergunte educadamente como prefere ser chamado/a.\n' +
        '- O primeiro nome exibido no WhatsApp pode ser do responsável; mesmo assim não confunda com o nome do aluno cadastrado.',
      nomeContatoLine:
        `Nome no cadastro (ALUNO — turma ${turmaLabel}): ${cadastroNome}.\n` +
        `Quem escreve: RESPONSÁVEL por este número — não usar "${cadastroNome}" como nome de quem fala. ` +
        'Se necessário, pergunte como prefere ser chamado/a.'
    };
  }

  if (turmaIsAdulto(turma)) {
    return {
      mode: 'aluno_adulto',
      turma,
      profileAppendix:
        '\n\nCONTEXTO DO CADASTRO:\n' +
        `Turma/tipo: ${turma}. O nome "${cadastroNome}" no cadastro refere-se ao próprio praticante deste número (adulto).`,
      nomeContatoLine: `Nome do contato (cadastro adulto — turma ${turma}): ${cadastroNome}.`
    };
  }

  return {
    mode: 'lead_com_cadastro',
    turma,
    profileAppendix:
      '\n\nCONTEXTO DO CADASTRO:\n' +
      `Existe cadastro vinculado: "${cadastroNome}" (tipo/turma: ${turma || 'não informado'}). ` +
      'O telefone pode ser de responsável ou do próprio aluno — use a conversa para não confundir.',
    nomeContatoLine: `Cadastro: ${cadastroNome} (tipo: ${turma || '?'}). Primeiro nome no WhatsApp: ${waFirst}.`
  };
}

function profileLineForSystemPrompt(contactCtx) {
  const base =
    'PERFIL DO CONTATO:\n' +
    'Use o cadastro de alunos e o contexto da conversa para identificar quem é a pessoa:\n\n' +
    'Se for LEAD (não matriculado):\n' +
    '- Foco em converter para aula experimental gratuita\n' +
    '- Qualifique rapidamente: para si ou para filho/a? Qual faixa etária?\n' +
    '- Ofereça o CTA de experimental no momento certo (quando já tem info suficiente)\n\n' +
    'Se for ALUNO ATIVO ou PAI/MÃE DE ALUNO:\n' +
    '- Trate como alguém que já conhece a academia\n' +
    '- Não ofereça aula experimental nem explique o que é Jiu-Jitsu\n' +
    '- Foque em resolver a dúvida diretamente (horário, pagamento, uniforme, etc.)\n' +
    '- Para assuntos financeiros ou administrativos, diga que vai passar para o responsável\n\n' +
    'Se não tiver certeza: trate como lead, mas adapte se a pessoa demonstrar familiaridade com a academia (mencionar faixa, professor, treino, mensalidade, etc.)';

  const cadastroVsWhatsApp =
    contactCtx?.mode !== 'lead'
      ? '\n\nREGRA FIXA — NOME NO CADASTRO:\n' +
        '- O nome do aluno e o do responsável (quando houver) salvos no cadastro da academia são a fonte de verdade.\n' +
        '- O nome exibido no perfil do WhatsApp não substitui nem corrige o cadastro; não diga que vai atualizar o cadastro só com base nesse nome.\n' +
        '- Use o WhatsApp, se fizer sentido, só como referência de tratamento na conversa; dados oficiais seguem o cadastro.\n'
      : '';

  return base + cadastroVsWhatsApp + (contactCtx?.profileAppendix || '');
}

/** Cria lead mínimo só se não existir documento para o telefone. Nunca atualiza nome de lead já existente com o nome do WhatsApp. */
async function createMinimalLeadIfMissing({ academyId, phone, name, academyDoc, classificacao }) {
  if (!LEADS_COL) return null;
  const a = String(academyId || '').trim();
  if (!a) return null;
  const telefone = normalizePhone(phone) || String(phone || '').trim();
  if (!telefone) return null;

  const displayName = String(name || '').trim() || telefone;
  const perms = permissionsForAcademyDoc(academyDoc);
  
  // Antes de criar o lead, verificar se já existe com esse telefone:
  const existing = await findLeadByPhone(telefone, a);
  if (existing) {
    console.log('[AgentRespond] Lead já existe — não criar duplicata');
    return existing;
  }

  // `contact_type` identifica o cadastro; `status` continua representando a etapa do funil.
  // contact_type é sempre 'lead' neste ponto porque a função já
  // retorna antes se tipo_contato === 'aluno' (ver verificação acima)
  const contactType = 'lead';

  const payloads = [
    { name: displayName, phone_number: telefone, status: 'Novo', origin: 'WhatsApp', academy_id: a, contact_type: contactType },
    { name: displayName, phone: telefone, status: 'Novo', origin: 'WhatsApp', academyId: a, contact_type: contactType }
  ];

  for (const data of payloads) {
    try {
      const created = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), data, perms);
      return created || null;
    } catch {}
  }
  return null;
}

async function getPromptSettings(academyId) {
  const a = String(academyId || '').trim();
  if (!a) return { intro: '', body: '', suffix: '' };
  try {
    if (SETTINGS_COL) {
      const list = await databases.listDocuments(DB_ID, SETTINGS_COL, [Query.equal('academy_id', [a]), Query.limit(1)]);
      const doc = list.documents && list.documents[0] ? list.documents[0] : null;
      if (doc) {
        return {
          intro: String(doc.prompt_intro || '').trim(),
          body: String(doc.prompt_body || '').trim(),
          suffix: String(doc.prompt_suffix || '').trim()
        };
      }
    }
    const list2 = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
      Query.equal('academy_id', [a]),
      Query.equal('phone_number', ['__settings__']),
      Query.limit(1)
    ]);
    const doc2 = list2.documents && list2.documents[0] ? list2.documents[0] : null;
    if (doc2) {
      return {
        intro: String(doc2.prompt_intro || '').trim(),
        body: String(doc2.prompt_body || '').trim(),
        suffix: String(doc2.prompt_suffix || '').trim()
      };
    }
  } catch {}
  return { intro: '', body: '', suffix: '' };
}

function shouldPromoteToExperimental({ classificacao, resposta, userName }) {
  if (String(classificacao?.intencao || '').trim() !== 'aula_experimental') return false;
  const txt = String(resposta || '').trim();
  if (!txt) return false;
  const lower = txt.toLowerCase();
  const hasConfirm = /agendad|marcad|confirmad|fechad/.test(lower);
  const hasTime = /\b\d{1,2}h(\d{2})?\b/i.test(txt) || /\b\d{1,2}:\d{2}\b/.test(txt);
  const hasDay = /(seg|segunda|ter|terça|terca|qua|quarta|qui|quinta|sex|sexta|sab|sábado|sabado|dom|hoje|amanh)/i.test(txt);
  const uname = String(userName || '').trim();
  const hasSomeName = uname && uname.toLowerCase() !== 'amigo';
  const hasName = hasSomeName ? new RegExp(`\\b${escapeRegExp(uname)}\\b`, 'i').test(txt) : false;
  const looksLikeConfirmation = !/[?]\s*$/.test(txt);
  return hasConfirm && (hasTime || hasDay) && looksLikeConfirmation && (hasName || hasSomeName);
}

async function updateLeadNotesFromClassification(leadDoc, classificacao) {
  if (!leadDoc || !LEADS_COL) return;
  let parsed = {};
  try {
    parsed = leadDoc.notes ? JSON.parse(leadDoc.notes) : {};
  } catch {
    parsed = {};
  }
  if (Array.isArray(parsed)) parsed = { history: parsed };
  if (!parsed || typeof parsed !== 'object') parsed = {};
  if (!Array.isArray(parsed.history)) parsed.history = [];

  parsed.whatsappIntention = classificacao.intencao;
  parsed.whatsappPriority = classificacao.prioridade;
  parsed.whatsappLeadQuente = classificacao.lead_quente;
  parsed.needHuman = classificacao.precisa_resposta_humana;
  parsed.whatsappUpdatedAt = new Date().toISOString();

  await databases.updateDocument(DB_ID, LEADS_COL, leadDoc.$id, { notes: JSON.stringify(parsed) });
}

async function updateConversationMeta(docId, { leadId, humanHandoffUntil }) {
  const payload = {};
  if (leadId) payload.lead_id = leadId;
  if (humanHandoffUntil) payload.human_handoff_until = humanHandoffUntil;
  if (Object.keys(payload).length === 0) return;
  try {
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, payload);
  } catch {}
}

function mergeConversationMessages(existing, additions) {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const hasUserById = new Set(out.filter((m) => m?.role === 'user' && m?.message_id).map((m) => String(m.message_id)));
  const hasAssistantByReply = new Set(
    out.filter((m) => m?.role === 'assistant' && m?.in_reply_to).map((m) => String(m.in_reply_to))
  );

  for (const a of additions || []) {
    if (!a || typeof a !== 'object') continue;
    if (a.role === 'user' && a.message_id) {
      const id = String(a.message_id);
      if (hasUserById.has(id)) continue;
      hasUserById.add(id);
    }
    if (a.role === 'assistant' && a.in_reply_to) {
      const rid = String(a.in_reply_to);
      if (hasAssistantByReply.has(rid)) continue;
      hasAssistantByReply.add(rid);
    }
    out.push(a);
  }
  return out.slice(-10);
}

async function updateConversationWithMerge(docId, additions) {
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const current = await databases.getDocument(DB_ID, CONVERSATIONS_COL, docId);
      const history = safeParseMessages(current.messages);
      const merged = mergeConversationMessages(history, additions);
      const nowIso = new Date().toISOString();
      const userAdds = Array.isArray(additions) ? additions.filter((a) => a && a.role === 'user').length : 0;
      const prevUnread = Number.isFinite(Number(current?.unread_count)) ? Number(current.unread_count) : 0;
      const payload = {
        messages: JSON.stringify(merged),
        updated_at: nowIso
      };
      if (userAdds > 0) {
        payload.unread_count = prevUnread + userAdds;
        payload.last_user_msg_at = nowIso;
      }
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, payload);

      const check = await databases.getDocument(DB_ID, CONVERSATIONS_COL, docId);
      const after = safeParseMessages(check.messages);
      const missing = (additions || []).some((a) => {
        if (!a || typeof a !== 'object') return false;
        if (a.role === 'user' && a.message_id) {
          return !after.some((m) => m.role === 'user' && String(m.message_id || '') === String(a.message_id));
        }
        if (a.role === 'assistant' && a.in_reply_to) {
          return !after.some((m) => m.role === 'assistant' && String(m.in_reply_to || '') === String(a.in_reply_to));
        }
        return false;
      });
      if (!missing) return { ok: true, history: after };
    } catch (e) {
      lastErr = e?.message || 'Erro ao atualizar conversa';
    }
  }
  return { ok: false, erro: lastErr || 'Erro ao atualizar conversa' };
}

const SYSTEM_PROMPT_INTRO = '';
const SYSTEM_PROMPT_BODY = '';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  if (!ensureJson(req, res)) return;

  const expectedInternal = String(process.env.INTERNAL_API_SECRET || '').trim();
  const inboundSecret = String(req.headers['x-internal-secret'] || '').trim();
  const isInternal =
    expectedInternal.length > 0 &&
    inboundSecret.length > 0 &&
    inboundSecret === expectedInternal;

  let jwtAuthorizedAcademyId = null;
  if (!isInternal) {
    const me = await ensureAuth(req, res);
    if (!me) return;
    jwtAuthorizedAcademyId = await ensureAcademyAccess(req, res, me);
    if (!jwtAuthorizedAcademyId) return;
  }

  const academyDoc = await ensureAcademyExists(req, res);
  if (!academyDoc) return;
  const academyId = String(academyDoc.$id || '').trim();

  if (!isInternal && academyId !== jwtAuthorizedAcademyId) {
    return res.status(403).json({ sucesso: false, erro: 'Acesso negado à academia' });
  }

  const mode = String(req.query?.mode || '').trim();
  const isSuggest = mode === 'suggest';

  const phone = String(req.body?.phone || '').trim();
  const name = String(req.body?.name || '').trim();
  const message = String(req.body?.message || '').trim();
  const messageId = String(req.body?.message_id || req.body?.messageId || '').trim();
  if (!phone || !message) {
    return res.status(400).json({ sucesso: false, erro: 'Campos obrigatórios ausentes' });
  }

  try {
    let leadDoc = null;
    try {
      leadDoc = await findLeadByPhone(phone, academyId);
    } catch {
      leadDoc = null;
    }

    const doc = await getOrCreateConversationDoc(phone, academyId, academyDoc);
    const handoffUntilRaw = typeof doc?.human_handoff_until === 'string' ? doc.human_handoff_until : '';
    if (humanHandoffIsActive(handoffUntilRaw)) {
      return res.status(200).json({ skipped: true, reason: 'human_handoff_active', sucesso: false });
    }
    let history = safeParseMessages(doc.messages);
    const contactCtx = buildPromptContactContext(leadDoc, name);
    const userName = firstName(name) || 'amigo';
    const summaryParsed = parseSummaryField(doc?.summary);
    const summaryText = summaryParsed.text;

    if (!isSuggest && messageId) {
      const existingReply = findAssistantReply(history, messageId);
      if (existingReply?.resposta) {
        return res.status(200).json({ resposta: existingReply.resposta, classificacao: existingReply.classificacao, sucesso: true });
      }

      const existingUser = history.find((m) => m?.role === 'user' && String(m?.message_id || '').trim() === messageId);
      const nowMs = Date.now();
      const existingAgeMs = existingUser ? nowMs - parseIsoToMs(existingUser.timestamp) : Infinity;
      const isFreshInFlight = existingUser && existingAgeMs >= 0 && existingAgeMs < 120000;

      if (!existingUser) {
        const userAt = new Date().toISOString();
        const up = await updateConversationWithMerge(doc.$id, [
          { role: 'user', content: message, timestamp: userAt, message_id: messageId }
        ]);
        if (!up.ok) throw new Error(up.erro || 'Erro ao salvar conversa');
        history = up.history || history;
      } else if (isFreshInFlight) {
        return res.status(200).json({ sucesso: true, em_processamento: true });
      }
    }

    const claudeMessages = history.map((m) => ({ role: m.role, content: m.content }));
    if (isSuggest || !messageId) {
      let appendUser = true;
      if (!isSuggest && !messageId) {
        const last = history.length ? history[history.length - 1] : null;
        if (
          last &&
          last.role === 'user' &&
          String(last.content || '').trim() === String(message || '').trim()
        ) {
          appendUser = false;
        }
      }
      if (appendUser) claudeMessages.push({ role: 'user', content: message });
    }

    const profileLine = profileLineForSystemPrompt(contactCtx);
    const settings = await getPromptSettings(academyId);
    const effectiveIntro = String(settings.intro || '') || SYSTEM_PROMPT_INTRO;
    const effectiveBody = String(settings.body || '') || SYSTEM_PROMPT_BODY;
    const extraSuffix = String(settings.suffix || '').trim();
    if (!effectiveIntro?.trim() && !effectiveBody?.trim()) {
      console.log('[respond] prompt vazio — encerrando sem chamar Claude', { academyId });
      return res.status(200).json({
        sucesso: false,
        motivo: 'prompt_nao_configurado'
      });
    }
    const baseSystemPrompt = [effectiveIntro, profileLine, effectiveBody, extraSuffix].filter(Boolean).join('\n');

    const system = [
      baseSystemPrompt,
      contactCtx.nomeContatoLine,
      summaryText ? `Resumo do histórico (pode estar desatualizado):\n${summaryText}` : '',
      'CLASSIFICAÇÃO — tipo_contato:\n' +
        'Use tipo_contato "aluno" apenas para quem já treina na academia (matrícula ativa). Quem está conhecendo ou quer experimentar é "lead". intencao "aluno_atual" é para dúvidas de quem já é aluno (não conta como lead novo no funil).\n\n' +
        'CLASSIFICAÇÃO — lead_quente:\n' +
        'Quando classificar lead_quente como "sim", sua próxima ação no campo "resposta" deve ser o CTA de agendamento da aula experimental ou pedir/confirmar o nome completo para agendar — nunca mais uma pergunta de qualificação genérica.',
      `Retorne SOMENTE um JSON válido (sem markdown) no seguinte formato:\n` +
        `{"resposta":"string","classificacao":{"intencao":"horarios_adulto|horarios_crianca|horarios_junior|preco_adulto|preco_crianca|preco_uniforme_adulto|preco_uniforme_infantil|aula_experimental|duvida|aluno_atual|outro","tipo_contato":"lead|aluno","prioridade":"alta|media|baixa","lead_quente":"sim|nao","precisa_resposta_humana":"sim|nao","perfil_lead":"adulto_para_si|responsavel_crianca|responsavel_junior|indefinido"}}`
    ]
      .filter(Boolean)
      .join('\n\n');

    // Rate limit por academia — 30 req/min
    if (!checkRateLimit(academyId)) {
      console.warn('[respond] rate limit atingido', { academyId });
      return res.status(429).json({
        sucesso: false,
        erro: 'Muitas requisições. Tente novamente em instantes.'
      });
    }

    const outputText = await callClaude({ system, messages: claudeMessages, maxTokens: 700, temperature: 0.4 });

    const parsedOut = extractJsonObject(outputText) || {};
    const resposta = typeof parsedOut?.resposta === 'string' ? parsedOut.resposta.trim() : outputText.trim();
    const classificacao = normalizeClassification(parsedOut?.classificacao || parsedOut);

    if (isSuggest) {
      return res.status(200).json({ resposta, classificacao, sucesso: true });
    }

    const assistantAt = new Date().toISOString();
    const additions = [];
    if (messageId) {
      additions.push({
        role: 'assistant',
        content: resposta,
        timestamp: assistantAt,
        in_reply_to: messageId,
        classificacao
      });
    } else {
      const userAt = new Date().toISOString();
      const last = history.length ? history[history.length - 1] : null;
      const alreadyUser =
        last &&
        last.role === 'user' &&
        String(last.content || '').trim() === String(message || '').trim();
      if (!alreadyUser) additions.push({ role: 'user', content: message, timestamp: userAt });
      additions.push({ role: 'assistant', content: resposta, timestamp: assistantAt, classificacao });
    }

    const up2 = await updateConversationWithMerge(doc.$id, additions);
    if (!up2.ok) throw new Error(up2.erro || 'Erro ao salvar conversa');

    if (!leadDoc && shouldAutoCreateLeadFromClassification(classificacao)) {
      try {
        leadDoc = await createMinimalLeadIfMissing({ academyId, phone, name, academyDoc, classificacao });
      } catch {
        leadDoc = null;
      }
    }

    if (leadDoc) {
      try {
        await updateLeadNotesFromClassification(leadDoc, classificacao);
      } catch {}
      await updateConversationMeta(doc.$id, { leadId: leadDoc.$id });
    }

    if (classificacao.precisa_resposta_humana === 'sim') {
      const h = getHumanHandoffHoursForServer();
      const until = humanHandoffUntilFromMs(Date.now() + h * 60 * 60 * 1000);
      if (until) await updateConversationMeta(doc.$id, { humanHandoffUntil: until });
    }

    if (leadDoc && shouldPromoteToExperimental({ classificacao, resposta, userName })) {
      const currentStatus = String(leadDoc?.status || '').trim();
      if (currentStatus !== 'Matriculado' && currentStatus !== 'Experimental') {
        try {
          await databases.updateDocument(DB_ID, LEADS_COL, leadDoc.$id, { status: 'Experimental' });
        } catch {}
      }
    }

    if (shouldUpdateSummary({ enabled: CONVERSATION_SUMMARY_ENABLED, history: up2.history, currentSummaryRaw: doc?.summary })) {
      try {
        const newSummaryText = await generateSummary({
          previousSummaryText: summaryText,
          recentMessages: up2.history
        });
        if (newSummaryText) {
          const summaryPayload = JSON.stringify({ updated_at: new Date().toISOString(), text: newSummaryText });
          await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { summary: summaryPayload });
        }
      } catch {}
    }

    return res.status(200).json({ resposta, classificacao, sucesso: true });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}


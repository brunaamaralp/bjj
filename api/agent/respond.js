import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CONVERSATION_SUMMARY_ENABLED = String(process.env.CONVERSATION_SUMMARY_ENABLED || '').toLowerCase() === 'true' ||
  String(process.env.CONVERSATION_SUMMARY_ENABLED || '') === '1';
const HUMAN_HANDOFF_HOURS = Number.parseInt(String(process.env.HUMAN_HANDOFF_HOURS || '6'), 10);

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !CONVERSATIONS_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!DEFAULT_ACADEMY_ID) {
    res.status(500).json({ sucesso: false, erro: 'DEFAULT_ACADEMY_ID não configurado' });
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

async function getOrCreateConversationDoc(phone) {
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('phone_number', [phone]),
    Query.equal('academy_id', [DEFAULT_ACADEMY_ID]),
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
      academy_id: DEFAULT_ACADEMY_ID
    },
    [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
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

async function findLeadByPhone(phone) {
  if (!LEADS_COL) return null;
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
          Query.equal(combo.academy, [DEFAULT_ACADEMY_ID]),
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

function leadProfileFromStatus(statusRaw) {
  const status = String(statusRaw || '').trim();
  if (status === 'Matriculado') return 'aluno_ativo';
  if (status === 'Experimental') return 'experimental';
  return 'lead';
}

function profileLineForSystemPrompt(profile) {
  if (profile === 'aluno_ativo') {
    return (
      'PERFIL DO CONTATO: Aluno ativo da academia.\n' +
      'REGRAS ESPECIAIS PARA ALUNO:\n' +
      '- Trate como membro da equipe, não como lead\n' +
      '- NÃO ofereça aula experimental\n' +
      '- NÃO mencione preços de planos ou matrículas\n' +
      '- Responda dúvidas sobre horários, faltas e rotina normalmente\n' +
      '- Para dúvidas sobre pagamento ou graduação, diga que vai passar para o responsável\n' +
      '- Use um tom mais próximo e familiar'
    );
  }
  if (profile === 'experimental') {
    return (
      'PERFIL DO CONTATO: Aula experimental agendada — pessoa\n' +
      'que já demonstrou interesse e tem aula marcada. Seja\n' +
      'acolhedor, reforce os benefícios e tire dúvidas finais.'
    );
  }
  return (
    'PERFIL DO CONTATO: Lead — pessoa interessada mas ainda\n' +
    'não matriculada. Foco em converter para aula experimental.'
  );
}

async function createMinimalLeadIfMissing({ phone, name }) {
  if (!LEADS_COL) return null;
  const telefone = normalizePhone(phone) || String(phone || '').trim();
  if (!telefone) return null;

  const displayName = String(name || '').trim() || telefone;
  const perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];

  const payloads = [
    { name: displayName, phone_number: telefone, status: 'Novo', origin: 'WhatsApp', academy_id: DEFAULT_ACADEMY_ID },
    { name: displayName, phone: telefone, status: 'Novo', origin: 'WhatsApp', academyId: DEFAULT_ACADEMY_ID }
  ];

  for (const data of payloads) {
    try {
      const created = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), data, perms);
      return created || null;
    } catch {}
  }
  return null;
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

async function updateConversationMeta(docId, { leadId, humanHandoffUntilIso }) {
  const payload = {};
  if (leadId) payload.lead_id = leadId;
  if (humanHandoffUntilIso) payload.human_handoff_until = humanHandoffUntilIso;
  if (Object.keys(payload).length === 0) return;
  try {
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, payload);
  } catch {}
}

function addHoursIso(hours) {
  const h = Number.isFinite(hours) && hours > 0 ? hours : 6;
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
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

const SYSTEM_PROMPT_INTRO = `Você é um atendente da Gracie Barra Lagoa da Prata, academia de Jiu-Jitsu em Lagoa da Prata MG. Atenda de forma humana e direta. Use o primeiro nome da pessoa. Nunca mencione que é uma IA.`;

const SYSTEM_PROMPT_BODY = `HORÁRIOS ADULTO: Seg/Qua 7h e 19h10 | Ter/Qui 7h e 20h15 | Sex 7h e 18h | Sáb 10h-12h
Turma Feminina: Ter/Qui 19h | No-Gi Faixa Azul+: Seg-Sex 12h | Avançado Faixa Azul+: Seg/Qua 20h15
INFANTIL 5-9 anos: Seg/Qua 8h | Ter/Qui 18h
JUNIORES 10-15 anos: Ter/Qui 8h | Seg/Qua 18h
PLANOS ADULTO: Anual 12x R$289 | Recorrente R$330 | Semestral 6x R$330 | Trimestral 3x R$360 | Mensal R$390 | Matrícula R$90
PLANOS INFANTIL: Anual 12x R$239 | Recorrente R$279 | Semestral 6x R$279 | Trimestral 3x R$299 | Mensal R$319 | Matrícula R$90
UNIFORME:
- A Gracie Barra exige o uso do kimono oficial da equipe
  durante os treinos — kimonos de outras equipes não são
  permitidos
- O uniforme completo é composto por kimono + camiseta
  training + faixa
- ADULTO: Kimono R$649,90 | Camiseta R$179,90 | Faixa R$79,90
  Kit completo em até 3x de R$303,23
- INFANTIL: Kimono R$489,90 | Camiseta R$159,90 | Faixa R$79,90
  Kit completo em até 3x no cartão
- Para quem quer fazer aulas avulsas: temos kimono para
  ALUGUEL por aula
- Na aula experimental: emprestamos o kimono gratuitamente,
  sem necessidade de nenhum equipamento
EXPERIMENTAL: gratuita, kimono emprestado. Pedir horário e nome completo.
Endereço: Azure Residence, Av. Dr. Antônio Luciano Pereira Filho 843, Coronel Luciano.
REGRAS: Respostas curtas. Emojis com moderação. Para pagamentos ou assuntos internos diga que vai passar para o responsável. Nunca invente informações.
FORMATAÇÃO:
- Nunca envie blocos longos de texto sem quebras
- Use negrito (*texto*) para destacar informações importantes
  como preços, horários e nomes de planos
- Use emojis com moderação para deixar a mensagem mais
  acolhedora — mas nunca em excesso
- Separe tópicos diferentes em parágrafos distintos
- Quando listar horários ou preços, use marcadores (•)
  para facilitar a leitura
- Prefira respostas curtas e diretas — se tiver muito
  conteúdo, divida em duas mensagens ou priorize o mais
  relevante
- Nunca responda tudo de uma vez — conduza a conversa
  fazendo uma pergunta ao final quando fizer sentido`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  if (!ensureJson(req, res)) return;

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
    let perfilContato = 'lead';
    try {
      leadDoc = await findLeadByPhone(phone);
      if (!leadDoc) {
        if (!isSuggest) leadDoc = await createMinimalLeadIfMissing({ phone, name });
      }
      perfilContato = leadProfileFromStatus(leadDoc?.status);
    } catch {
      leadDoc = null;
      perfilContato = 'lead';
    }

    const doc = await getOrCreateConversationDoc(phone);
    let history = safeParseMessages(doc.messages);
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
    if (isSuggest || !messageId) claudeMessages.push({ role: 'user', content: message });

    const profileLine = profileLineForSystemPrompt(perfilContato);
    const baseSystemPrompt = [SYSTEM_PROMPT_INTRO, profileLine, SYSTEM_PROMPT_BODY].filter(Boolean).join('\n');

    const system = [
      baseSystemPrompt,
      `Nome do contato: ${userName}.`,
      summaryText ? `Resumo do histórico (pode estar desatualizado):\n${summaryText}` : '',
      `Retorne SOMENTE um JSON válido (sem markdown) no seguinte formato:\n` +
        `{"resposta":"string","classificacao":{"intencao":"horarios_adulto|horarios_crianca|horarios_junior|preco_adulto|preco_crianca|preco_uniforme_adulto|preco_uniforme_infantil|aula_experimental|duvida|aluno_atual|outro","tipo_contato":"lead|aluno","prioridade":"alta|media|baixa","lead_quente":"sim|nao","precisa_resposta_humana":"sim|nao","perfil_lead":"adulto_para_si|responsavel_crianca|responsavel_junior|indefinido"}}`
    ]
      .filter(Boolean)
      .join('\n\n');

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
      additions.push({ role: 'user', content: message, timestamp: userAt });
      additions.push({ role: 'assistant', content: resposta, timestamp: assistantAt, classificacao });
    }

    const up2 = await updateConversationWithMerge(doc.$id, additions);
    if (!up2.ok) throw new Error(up2.erro || 'Erro ao salvar conversa');

    if (leadDoc) {
      try {
        await updateLeadNotesFromClassification(leadDoc, classificacao);
      } catch {}
      await updateConversationMeta(doc.$id, { leadId: leadDoc.$id });
    }

    if (classificacao.precisa_resposta_humana === 'sim') {
      const untilIso = addHoursIso(Number.isFinite(HUMAN_HANDOFF_HOURS) ? HUMAN_HANDOFF_HOURS : 6);
      await updateConversationMeta(doc.$id, { humanHandoffUntilIso: untilIso });
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

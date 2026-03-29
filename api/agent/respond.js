import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

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
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString()
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

const SYSTEM_PROMPT = `Você é um atendente da Gracie Barra Lagoa da Prata, academia de Jiu-Jitsu em Lagoa da Prata MG. Atenda de forma humana e direta. Use o primeiro nome da pessoa. Nunca mencione que é uma IA.
HORÁRIOS ADULTO: Seg/Qua 7h e 19h10 | Ter/Qui 7h e 20h15 | Sex 7h e 18h | Sáb 10h-12h
Turma Feminina: Ter/Qui 19h | No-Gi Faixa Azul+: Seg-Sex 12h | Avançado Faixa Azul+: Seg/Qua 20h15
INFANTIL 5-9 anos: Seg/Qua 8h | Ter/Qui 18h
JUNIORES 10-15 anos: Ter/Qui 8h | Seg/Qua 18h
PLANOS ADULTO: Anual 12x R$289 | Recorrente R$330 | Semestral 6x R$330 | Trimestral 3x R$360 | Mensal R$390 | Matrícula R$90
PLANOS INFANTIL: Anual 12x R$239 | Recorrente R$279 | Semestral 6x R$279 | Trimestral 3x R$299 | Mensal R$319 | Matrícula R$90
UNIFORME ADULTO: Kimono R$649,90 | Camiseta R$179,90 | Faixa R$79,90 | Kit 3x R$303,23
UNIFORME INFANTIL: Kimono R$489,90 | Camiseta R$159,90 | Faixa R$79,90 | Kit 3x no cartão
EXPERIMENTAL: gratuita, kimono emprestado. Pedir horário e nome completo.
Endereço: Azure Residence, Av. Dr. Antônio Luciano Pereira Filho 843, Coronel Luciano.
REGRAS: Respostas curtas. Emojis com moderação. Para pagamentos ou assuntos internos diga que vai passar para o responsável. Nunca invente informações.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  if (!ensureJson(req, res)) return;

  const phone = String(req.body?.phone || '').trim();
  const name = String(req.body?.name || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!phone || !message) {
    return res.status(400).json({ sucesso: false, erro: 'Campos obrigatórios ausentes' });
  }

  try {
    const doc = await getOrCreateConversationDoc(phone);
    const history = safeParseMessages(doc.messages);
    const userName = firstName(name) || 'amigo';

    const claudeMessages = history.map((m) => ({ role: m.role, content: m.content }));
    claudeMessages.push({ role: 'user', content: message });

    const resposta = await callClaude({
      system: `${SYSTEM_PROMPT}\n\nNome do contato: ${userName}.`,
      messages: claudeMessages,
      maxTokens: 600,
      temperature: 0.4
    });

    const classificationText = await callClaude({
      system:
        'Você é um classificador. Responda SOMENTE com um JSON válido (sem markdown) exatamente neste formato e somente com valores permitidos.\n\nFormato:\n{"intencao":"horarios_adulto|horarios_crianca|horarios_junior|preco_adulto|preco_crianca|preco_uniforme_adulto|preco_uniforme_infantil|aula_experimental|duvida|aluno_atual|outro","tipo_contato":"lead|aluno","prioridade":"alta|media|baixa","lead_quente":"sim|nao","precisa_resposta_humana":"sim|nao","perfil_lead":"adulto_para_si|responsavel_crianca|responsavel_junior|indefinido"}',
      messages: [
        {
          role: 'user',
          content: JSON.stringify(
            {
              phone,
              name: name || null,
              mensagem_usuario: message,
              resposta_assistente: resposta
            },
            null,
            0
          )
        }
      ],
      maxTokens: 250,
      temperature: 0
    });

    const parsed = extractJsonObject(classificationText) || {};
    const classificacao = normalizeClassification(parsed);

    const userAt = new Date().toISOString();
    const assistantAt = new Date().toISOString();
    const next = history.slice();
    next.push({ role: 'user', content: message, timestamp: userAt });
    next.push({ role: 'assistant', content: resposta, timestamp: assistantAt });
    const last10 = next.slice(-10);

    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, {
      messages: JSON.stringify(last10),
      updated_at: assistantAt
    });

    return res.status(200).json({ resposta, classificacao, sucesso: true });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}


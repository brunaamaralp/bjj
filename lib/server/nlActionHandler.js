import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';

const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ error: 'server_misconfigured' });
    return false;
  }
  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'anthropic_not_configured' });
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

function allowedStudentIds(students) {
  const ids = new Set();
  if (!Array.isArray(students)) return ids;
  for (const s of students) {
    const id = String(s?.id || '').trim();
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Interpretação de comandos NL no módulo financeiro (mesmo padrão de auth que aiPrompt / agentTest).
 */
export default async function nlActionHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!ensureConfigOk(res)) return;

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const academyId = String(access.academyId || '').trim();

  let body = req.body && typeof req.body === 'object' ? req.body : {};
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body);
    } catch {
      body = {};
    }
  }

  const bodyAcademy = String(body.academyId || body.academy_id || '').trim();
  if (bodyAcademy && bodyAcademy !== academyId) {
    return res.status(400).json({ error: 'academy_mismatch' });
  }

  const { text, students, academyName } = body;

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'text_required' });
  }

  const studentList = (Array.isArray(students) ? students : [])
    .slice(0, 100)
    .map((s) => `- ${s.name} (id: ${s.id}, plano: ${s.plan || 'não informado'})`)
    .join('\n');

  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const currentMonth = new Date().toISOString().slice(0, 7);

  const systemPrompt = `Você é um assistente de academia que interpreta comandos em português e os converte em ações estruturadas.

Academia: ${String(academyName || '').trim()}
Data de hoje: ${today}
Mês atual: ${currentMonth}

Alunos cadastrados:
${studentList || 'Nenhum aluno cadastrado'}

Você suporta APENAS estas duas ações:
1. register_payment — registrar pagamento de mensalidade de um aluno
2. add_note — adicionar uma nota sobre um lead ou aluno

Responda SEMPRE com um JSON válido e nada mais. Sem texto adicional, sem markdown, sem blocos de código.

Se conseguir interpretar, retorne EXATAMENTE este formato:
{
  "action": "register_payment" | "add_note",
  "confidence": "high" | "medium" | "low",
  "data": {
    "student_id": "id exato da lista — NUNCA inventar",
    "student_name": "nome completo do aluno",
    "reference_month": "YYYY-MM",
    "amount": número ou null,
    "method": "pix" | "dinheiro" | "cartão débito" | "cartão crédito" | "transferência" | null,
    "note_text": "texto da nota — só para add_note",
    "note": "observação adicional — só para register_payment"
  },
  "summary": "frase curta em português descrevendo a ação",
  "missing": []
}

Se NÃO conseguir interpretar ou a ação não for suportada:
{
  "action": null,
  "error": "explicação em português do problema"
}

Regras obrigatórias:
- reference_month: "abril" → "${new Date().getFullYear()}-04"; "mês passado" → mês anterior ao atual; sem menção → mês atual (${currentMonth})
- Nunca usar student_id que não esteja na lista fornecida
- Se mais de um aluno tiver nome similar → confidence: "low" e explicar no summary
- register_payment: student_id obrigatório; amount e method podem ser null
- add_note: student_id e note_text obrigatórios
- missing: array com nomes dos campos obrigatórios ausentes`;

  const allowedIds = allowedStudentIds(students);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Comando: "${String(text).trim()}"` }]
      })
    });

    const rawTextBody = await response.text();
    if (!response.ok) {
      let msg = rawTextBody.slice(0, 400);
      try {
        const err = JSON.parse(rawTextBody);
        if (err?.error?.message) msg = String(err.error.message);
      } catch {
        void 0;
      }
      console.error('[nl-action] Anthropic HTTP', response.status, msg);
      return res.status(502).json({
        action: null,
        error: 'Falha ao contactar o modelo. Tente novamente.'
      });
    }

    let data;
    try {
      data = JSON.parse(rawTextBody);
    } catch {
      return res.status(200).json({
        action: null,
        error: 'Não consegui interpretar o comando. Tente ser mais específico.'
      });
    }

    const rawText = data.content?.[0]?.text || '';
    let parsed = extractJsonObject(rawText.replace(/```json|```/g, '').trim());
    if (!parsed) {
      try {
        parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
      } catch {
        parsed = null;
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return res.status(200).json({
        action: null,
        error: 'Não consegui interpretar o comando. Tente ser mais específico.'
      });
    }

    if (parsed.action === 'register_payment' || parsed.action === 'add_note') {
      const sid = String(parsed.data?.student_id || '').trim();
      if (!sid || !allowedIds.has(sid)) {
        return res.status(200).json({
          action: null,
          error: 'O aluno identificado não está na lista enviada ou o id é inválido. Reformule o comando.'
        });
      }
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('nlActionHandler error:', err);
    return res.status(500).json({
      action: null,
      error: 'Erro ao processar o comando. Tente novamente.'
    });
  }
}

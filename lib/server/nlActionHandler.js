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

function allowedLeadIds(leads) {
  const ids = new Set();
  if (!Array.isArray(leads)) return ids;
  for (const l of leads) {
    const id = String(l?.id || '').trim();
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

  const { text, students, leads, academyName, context } = body;

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'text_required' });
  }

  const studentList = (Array.isArray(students) ? students : [])
    .slice(0, 100)
    .map((s) => `- ${s.name} (id: ${s.id}, plano: ${s.plan || 'não informado'})`)
    .join('\n');
  const leadList = (Array.isArray(leads) ? leads : [])
    .slice(0, 100)
    .map((l) => `- ${l.name} (id: ${l.id}, status: ${l.status || 'não informado'}, etapa: ${l.pipelineStage || 'não informada'})`)
    .join('\n');

  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const currentMonth = new Date().toISOString().slice(0, 7);

  const normalizedContext = ['financeiro', 'funil'].includes(String(context || '').trim().toLowerCase())
    ? String(context || '').trim().toLowerCase()
    : '';
  const showFinance = !normalizedContext || normalizedContext === 'financeiro';
  const showFunnel = !normalizedContext || normalizedContext === 'funil';

  const systemPrompt = `Você é um assistente de academia que interpreta comandos em português e os converte em ações estruturadas.

Academia: ${String(academyName || '').trim()}
Data de hoje: ${today}
Mês atual: ${currentMonth}
Contexto solicitado: ${normalizedContext || 'geral'}

Alunos cadastrados:
${studentList || 'Nenhum aluno cadastrado'}

Leads no funil:
${leadList || 'Nenhum lead no funil'}

Você suporta APENAS as ações listadas abaixo:
${showFinance ? '1. register_payment — registrar pagamento de mensalidade de um aluno\n2. add_note — adicionar uma nota sobre um lead ou aluno' : ''}
${showFunnel ? '3. mark_attended — marcar lead como "Compareceu" na aula experimental\n4. mark_missed — marcar lead como "Não Compareceu"\n5. register_whatsapp — registrar que enviou WhatsApp para um lead' : ''}

Responda SEMPRE com um JSON válido e nada mais. Sem texto adicional, sem markdown, sem blocos de código.

Se conseguir interpretar, retorne EXATAMENTE este formato:
{
  "action": "register_payment" | "add_note" | "mark_attended" | "mark_missed" | "register_whatsapp",
  "confidence": "high" | "medium" | "low",
  "data": {
    "student_id": "id exato da lista — NUNCA inventar",
    "student_name": "nome completo do aluno",
    "lead_id": "id exato da lista de leads — NUNCA inventar",
    "lead_name": "nome completo do lead",
    "reference_month": "YYYY-MM",
    "amount": número ou null,
    "method": "pix" | "dinheiro" | "cartão débito" | "cartão crédito" | "transferência" | null,
    "note_text": "texto da nota — só para add_note",
    "note": "observação adicional — só para register_payment",
    "reason": "motivo mencionado ou null — só para mark_missed",
    "message_description": "descrição da mensagem ou null — só para register_whatsapp"
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
- Nunca usar student_id ou lead_id que não esteja na lista fornecida
- Se mais de um nome for similar → confidence: "low" e explicar no summary
- register_payment: student_id obrigatório; amount e method podem ser null
- add_note: em contexto financeiro usar student_id; em contexto funil usar lead_id; note_text obrigatório
- mark_attended: lead_id obrigatório
- mark_missed: lead_id obrigatório
- register_whatsapp: lead_id obrigatório
- missing: array com nomes dos campos obrigatórios ausentes`;

  const allowedIds = allowedStudentIds(students);
  const allowedFunnelIds = allowedLeadIds(leads);

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

    if (normalizedContext === 'financeiro' && ['mark_attended', 'mark_missed', 'register_whatsapp'].includes(parsed.action)) {
      return res.status(200).json({
        action: null,
        error: 'A ação identificada não pertence ao contexto financeiro.'
      });
    }
    if (normalizedContext === 'funil' && ['register_payment', 'add_note'].includes(parsed.action)) {
      return res.status(200).json({
        action: null,
        error: 'A ação identificada não pertence ao contexto do funil.'
      });
    }

    if (parsed.action === 'register_payment') {
      const sid = String(parsed.data?.student_id || '').trim();
      if (!sid || !allowedIds.has(sid)) {
        return res.status(200).json({
          action: null,
          error: 'O aluno identificado não está na lista enviada ou o id é inválido. Reformule o comando.'
        });
      }
    }
    if (parsed.action === 'add_note') {
      const sid = String(parsed.data?.student_id || '').trim();
      const lid = String(parsed.data?.lead_id || '').trim();
      const studentOk = sid && allowedIds.has(sid);
      const leadOk = lid && allowedFunnelIds.has(lid);
      if (!studentOk && !leadOk) {
        return res.status(200).json({
          action: null,
          error: 'Não encontrei id válido de aluno/lead na lista enviada. Reformule o comando.'
        });
      }
    }
    if (parsed.action === 'mark_attended' || parsed.action === 'mark_missed' || parsed.action === 'register_whatsapp') {
      const lid = String(parsed.data?.lead_id || '').trim();
      if (!lid || !allowedFunnelIds.has(lid)) {
        return res.status(200).json({
          action: null,
          error: 'O lead identificado não está na lista enviada ou o id é inválido. Reformule o comando.'
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

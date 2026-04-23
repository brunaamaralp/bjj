import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { normalizeScheduleTime, isValidYmd } from '../nlScheduleParse.js';
import { sanitizeStudentUpdatesForNl } from '../studentNlUpdates.js';
import { sanitizePaymentUpdatesForNl } from '../paymentNlUpdates.js';

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

/** Destinos que têm comando NL dedicado (não usar move_pipeline_stage). */
const MOVE_PIPELINE_FORBIDDEN_TARGETS = new Set(['Matriculado', 'Não Compareceu', 'Não fechou', 'Aula experimental']);

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

  const {
    text,
    students,
    leads,
    academyName,
    context,
    pipelineStages: pipelineStagesRaw,
    pendingTransactions: pendingTransactionsRaw,
    recentPayments: recentPaymentsRaw
  } = body;

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

  const pipelineStages = (Array.isArray(pipelineStagesRaw) ? pipelineStagesRaw : [])
    .filter((s) => s && String(s.id || '').trim())
    .slice(0, 48)
    .map((s) => ({ id: String(s.id).trim(), label: String(s.label || s.id || '').trim() }));
  const pipelineStageLines = pipelineStages
    .map((s) => `- id: ${s.id} — label: ${s.label}`)
    .join('\n');

  const pendingTransactionsNorm = (Array.isArray(pendingTransactionsRaw) ? pendingTransactionsRaw : [])
    .filter((t) => t && String(t.id || '').trim())
    .slice(0, 40)
    .map((t) => ({
      id: String(t.id).trim(),
      status: String(t.status || '').toLowerCase(),
      gross: Number(t.gross),
      fee: Number(t.fee),
      net: Number(t.net),
      method: String(t.method || ''),
      installments: Number(t.installments) || 1,
      type: String(t.type || ''),
      planName: String(t.planName || ''),
      lead_id: String(t.lead_id || ''),
      note: String(t.note || ''),
      createdAt: String(t.createdAt || '')
    }));
  const pendingForNl = pendingTransactionsNorm.filter((t) => t.status === 'pending');
  const pendingTxLines = pendingForNl
    .map(
      (t) =>
        `- id: ${t.id} — nota: ${String(t.note || '').slice(0, 80)} — bruto: ${t.gross} — tipo: ${t.type} — criada: ${String(t.createdAt || '').slice(0, 16)}`
    )
    .join('\n');

  const recentPaymentsNorm = (Array.isArray(recentPaymentsRaw) ? recentPaymentsRaw : [])
    .filter((p) => p && String(p.id || p.$id || '').trim())
    .slice(0, 120)
    .map((p) => ({
      id: String(p.id || p.$id || '').trim(),
      lead_id: String(p.student_id || p.lead_id || '').trim(),
      student_name: String(p.student_name || '').trim(),
      reference_month: String(p.reference_month || '').trim(),
      amount: Number(p.amount),
      status: String(p.status || '').toLowerCase(),
      method: String(p.method || ''),
      note: String(p.note || ''),
      plan_name: String(p.plan_name || '').trim(),
      account: String(p.account || '').trim()
    }));
  const paymentLinesForNl = recentPaymentsNorm
    .map(
      (p) =>
        `- id: ${p.id} — aluno: ${p.student_name || p.lead_id || '?'} — mês: ${p.reference_month} — status: ${p.status} — valor: ${Number.isFinite(p.amount) ? p.amount : '?'} — plano: ${String(p.plan_name || '').slice(0, 40)} — obs.: ${String(p.note || '').slice(0, 72)}`
    )
    .join('\n');

  const rawCtx = String(context || '').trim().toLowerCase();
  const normalizedContext = ['financeiro', 'funil', 'perfil'].includes(rawCtx) ? rawCtx : '';
  const showFinance = !normalizedContext || normalizedContext === 'financeiro' || normalizedContext === 'perfil';
  const showFunnel = !normalizedContext || normalizedContext === 'funil' || normalizedContext === 'perfil';

  const systemPrompt = `Você é um assistente de academia que interpreta comandos em português e os converte em ações estruturadas.

Academia: ${String(academyName || '').trim()}
Data de hoje: ${today}
Mês atual: ${currentMonth}
Contexto solicitado: ${normalizedContext || 'geral'}${normalizedContext === 'perfil' ? ' (perfil: financeiro + funil habilitados no mesmo comando)' : ''}

Alunos cadastrados:
${studentList || 'Nenhum aluno cadastrado'}

Leads no funil:
${leadList || 'Nenhum lead no funil'}

${showFunnel ? `Etapas do funil (para move_pipeline_stage use target_stage_id = id exato de uma linha abaixo):\n${pipelineStageLines || 'Nenhuma etapa enviada — não use move_pipeline_stage.'}\n` : ''}
${showFinance && pendingTxLines ? `Transações financeiras PENDENTES (para settle_transaction use transaction_id = id exato):\n${pendingTxLines}\n` : showFinance ? 'Transações pendentes: nenhuma enviada — não use settle_transaction até a lista carregar (página Caixa).\n' : ''}
${showFinance && paymentLinesForNl ? `Registros de mensalidade visíveis (para update_payment use payment_id = id exato):\n${paymentLinesForNl}\n` : showFinance ? 'Mensalidades na tela: nenhuma enviada — não use update_payment até abrir Mensalidades e carregar o mês.\n' : ''}
Você suporta APENAS as ações listadas abaixo:
${showFinance ? '1. register_payment — registrar pagamento de mensalidade de um aluno\n2. add_note — adicionar uma nota sobre um lead ou aluno\n3. register_expense — registrar despesa/saída (compras, estoque, frutas, material, etc.)\n4. register_checkin — registrar presença (check-in) de um aluno\n5. update_student — atualizar dados do aluno (só campos permitidos em updates)\n6. settle_transaction — liquidar transação pendente (transaction_id da lista acima)\n7. update_payment — alterar observação (note), conta (account) ou nome do plano (plan_name) de um registro de mensalidade (payment_id da lista de mensalidades)' : ''}
${showFunnel ? '8. mark_attended — marcar lead como "Compareceu" na aula experimental\n9. mark_missed — marcar lead como "Não Compareceu"\n10. register_whatsapp — registrar que enviou WhatsApp para um lead\n11. mark_enrolled — marcar lead do funil como matriculado (vira aluno)\n12. mark_lost — marcar lead como perdido (encerra oportunidade)\n13. schedule_experimental — agendar aula experimental (data YYYY-MM-DD + hora HH:mm)\n14. move_pipeline_stage — mover lead para outra etapa do funil (só ids listados acima; não usar para Matriculado, Não compareceu, Perdido nem Aula experimental)\n15. create_lead — cadastrar novo lead (nome + telefone obrigatórios)' : ''}

Responda SEMPRE com um JSON válido e nada mais. Sem texto adicional, sem markdown, sem blocos de código.

Se conseguir interpretar, retorne EXATAMENTE este formato:
{
  "action": "register_payment" | "register_expense" | "register_checkin" | "update_student" | "settle_transaction" | "update_payment" | "add_note" | "mark_attended" | "mark_missed" | "register_whatsapp" | "mark_enrolled" | "mark_lost" | "schedule_experimental" | "move_pipeline_stage" | "create_lead",
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
    "message_description": "descrição da mensagem ou null — só para register_whatsapp",
    "expense_description": "o que foi comprado/pago — obrigatório para register_expense (ex.: frutas, kimonos, material de limpeza)",
    "expense_category": "categoria curta ou null — só register_expense",
    "lost_reason": "motivo do lead perdido — mark_lost (se ausente, o sistema usa \"Não especificado\")",
    "scheduled_date": "YYYY-MM-DD — schedule_experimental",
    "scheduled_time": "HH:mm (24h) ou 18h30 — schedule_experimental",
    "target_stage_id": "id exato da etapa de destino — move_pipeline_stage",
    "updates": { "plan": "exemplo update_student", "emergencyPhone": "11999990000", "note": "obs update_payment", "account": "conta", "plan_name": "plano" },
    "transaction_id": "id exato da lista de transações pendentes — settle_transaction",
    "payment_id": "id exato da lista de mensalidades — update_payment",
    "lead_phone": "telefone só dígitos — create_lead",
    "lead_name": "nome — create_lead (alternativa a name)"
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
- mark_enrolled: lead_id obrigatório (lead do funil que passará a ser aluno)
- register_expense: amount obrigatório (> 0); expense_description obrigatório; method pode ser null (usa dinheiro)
- register_checkin: student_id obrigatório (aluno da lista)
- mark_lost: lead_id obrigatório; lost_reason no texto ou use \"Não especificado\"
- schedule_experimental: lead_id obrigatório; scheduled_date obrigatório (YYYY-MM-DD; converta \"hoje\"/\"amanhã\" usando a data de hoje acima); scheduled_time obrigatório (HH:mm)
- move_pipeline_stage: lead_id e target_stage_id obrigatórios; target_stage_id deve ser um dos ids listados em \"Etapas do funil\"; NÃO usar para Matriculado, Não Compareceu, Não fechou nem Aula experimental
- update_student: student_id obrigatório; campo updates (objeto) com pelo menos uma chave permitida: plan, enrollmentDate, birthDate (YYYY-MM-DD), cpf, responsavel, emergencyContact, emergencyPhone, preferredPaymentMethod, preferredPaymentAccount, name, phone, type (Adulto|Criança|Juniores), parentName, age, belt, origin
- settle_transaction: transaction_id obrigatório e deve constar na lista de transações pendentes enviada
- update_payment: payment_id obrigatório e deve constar na lista de mensalidades enviada; campo updates com pelo menos uma chave: note, account, plan_name (snake_case; não alterar valor pago, status nem mês por este comando)
- create_lead: name (ou lead_name) e phone (ou lead_phone, só dígitos, min 10) obrigatórios; opcional origin, type (Adulto|Criança|Juniores)
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
        max_tokens: 700,
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
      console.error(
        '[nl-action]',
        JSON.stringify({ stage: 'anthropic_http', status: response.status, message: String(msg).slice(0, 300) })
      );
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

    if (
      normalizedContext === 'financeiro' &&
      [
        'mark_attended',
        'mark_missed',
        'register_whatsapp',
        'mark_enrolled',
        'mark_lost',
        'schedule_experimental',
        'move_pipeline_stage',
        'create_lead'
      ].includes(parsed.action)
    ) {
      return res.status(200).json({
        action: null,
        error: 'A ação identificada não pertence ao contexto financeiro.'
      });
    }
    if (
      normalizedContext === 'funil' &&
      ['register_payment', 'add_note', 'register_expense', 'register_checkin', 'update_student', 'settle_transaction', 'update_payment'].includes(
        parsed.action
      )
    ) {
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
    if (
      parsed.action === 'mark_attended' ||
      parsed.action === 'mark_missed' ||
      parsed.action === 'register_whatsapp' ||
      parsed.action === 'mark_enrolled' ||
      parsed.action === 'mark_lost' ||
      parsed.action === 'schedule_experimental' ||
      parsed.action === 'move_pipeline_stage'
    ) {
      const lid = String(parsed.data?.lead_id || '').trim();
      if (!lid || !allowedFunnelIds.has(lid)) {
        return res.status(200).json({
          action: null,
          error: 'O lead identificado não está na lista enviada ou o id é inválido. Reformule o comando.'
        });
      }
    }

    if (parsed.action === 'register_checkin') {
      const sid = String(parsed.data?.student_id || '').trim();
      if (!sid || !allowedIds.has(sid)) {
        return res.status(200).json({
          action: null,
          error: 'O aluno identificado não está na lista enviada ou o id é inválido. Reformule o comando.'
        });
      }
    }

    if (parsed.action === 'update_student') {
      const sid = String(parsed.data?.student_id || '').trim();
      if (!sid || !allowedIds.has(sid)) {
        return res.status(200).json({
          action: null,
          error: 'O aluno identificado não está na lista enviada ou o id é inválido. Reformule o comando.'
        });
      }
      const sanitized = sanitizeStudentUpdatesForNl(parsed.data || {});
      if (Object.keys(sanitized).length === 0) {
        return res.status(200).json({
          action: null,
          error:
            'Nenhum campo válido para atualizar. Ex.: "Atualiza o telefone de emergência do João para 11999998877" ou "Muda o plano da Maria para Kimono + nogi".'
        });
      }
      parsed.data = {
        student_id: sid,
        student_name: String(parsed.data?.student_name || '').trim(),
        updates: sanitized
      };
    }

    if (parsed.action === 'register_expense') {
      const amt = Number(parsed.data?.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(200).json({
          action: null,
          error: 'Informe um valor de despesa maior que zero.'
        });
      }
      const desc = String(
        parsed.data?.expense_description || parsed.data?.description || parsed.data?.note || ''
      ).trim();
      if (!desc) {
        return res.status(200).json({
          action: null,
          error: 'Descreva a despesa (ex.: compra de frutas, estoque).'
        });
      }
    }

    if (parsed.action === 'mark_lost') {
      const lr = String(parsed.data?.lost_reason || parsed.data?.reason || '').trim();
      parsed.data = { ...(parsed.data || {}), lost_reason: lr || 'Não especificado' };
    }

    if (parsed.action === 'schedule_experimental') {
      const ymd = String(parsed.data?.scheduled_date || parsed.data?.date || '').trim();
      const timeNorm = normalizeScheduleTime(parsed.data?.scheduled_time || parsed.data?.time || '');
      if (!isValidYmd(ymd)) {
        return res.status(200).json({
          action: null,
          error: 'Informe uma data válida para o agendamento (YYYY-MM-DD), ex.: amanhã convertido para a data correta.'
        });
      }
      if (!timeNorm) {
        return res.status(200).json({
          action: null,
          error: 'Informe um horário válido (ex.: 18:30, 9h, 14h15).'
        });
      }
      parsed.data = { ...(parsed.data || {}), scheduled_date: ymd, scheduled_time: timeNorm };
    }

    if (parsed.action === 'move_pipeline_stage') {
      const allowedStageIds = new Set(pipelineStages.map((s) => s.id));
      if (allowedStageIds.size === 0) {
        return res.status(200).json({
          action: null,
          error: 'Abra o assistente a partir da página Funil para carregar as etapas do pipeline.'
        });
      }
      const tid = String(parsed.data?.target_stage_id || parsed.data?.stage_id || parsed.data?.pipeline_stage || '').trim();
      if (!tid || !allowedStageIds.has(tid)) {
        return res.status(200).json({
          action: null,
          error: 'Etapa de destino inválida. Use o id exato listado em Etapas do funil.'
        });
      }
      if (MOVE_PIPELINE_FORBIDDEN_TARGETS.has(tid)) {
        return res.status(200).json({
          action: null,
          error:
            tid === 'Aula experimental'
              ? 'Para a etapa experimental com data e hora, use schedule_experimental. Para só mudar coluna, escolha outra etapa.'
              : 'Para Matriculado, Não compareceu ou Perdido, use o comando específico (matricular / não compareceu / perdido).'
        });
      }
      parsed.data = { ...(parsed.data || {}), target_stage_id: tid };
    }

    if (parsed.action === 'create_lead') {
      const nm = String(parsed.data?.name || parsed.data?.lead_name || '').trim();
      const ph = String(parsed.data?.phone || parsed.data?.lead_phone || '').replace(/\D/g, '');
      if (!nm || nm.length < 2) {
        return res.status(200).json({
          action: null,
          error: 'Informe o nome do lead (mínimo 2 caracteres).'
        });
      }
      if (!ph || ph.length < 10) {
        return res.status(200).json({
          action: null,
          error: 'Informe um telefone válido (mínimo 10 dígitos).'
        });
      }
      const typ = String(parsed.data?.type || '').trim();
      if (typ && !['Adulto', 'Criança', 'Juniores'].includes(typ)) {
        return res.status(200).json({
          action: null,
          error: 'Tipo deve ser Adulto, Criança ou Juniores.'
        });
      }
      parsed.data = {
        name: nm.slice(0, 200),
        phone: ph.slice(0, 15),
        type: typ || 'Adulto',
        origin: String(parsed.data?.origin || '').trim().slice(0, 128)
      };
    }

    if (parsed.action === 'settle_transaction') {
      if (pendingForNl.length === 0) {
        return res.status(200).json({
          action: null,
          error: 'Não há transações pendentes na lista. Abra o assistente na página Caixa e aguarde o carregamento do extrato.'
        });
      }
      const tid = String(parsed.data?.transaction_id || '').trim();
      const allowedT = new Set(pendingForNl.map((t) => t.id));
      if (!tid || !allowedT.has(tid)) {
        return res.status(200).json({
          action: null,
          error: 'transaction_id inválido. Use o id exato da lista de transações pendentes.'
        });
      }
      const row = pendingForNl.find((t) => t.id === tid);
      parsed.data = {
        transaction_id: tid,
        tx_snapshot: row
          ? {
              id: row.id,
              gross: row.gross,
              fee: row.fee,
              net: row.net,
              method: row.method,
              installments: row.installments,
              type: row.type,
              planName: row.planName,
              lead_id: row.lead_id,
              note: row.note
            }
          : null
      };
    }

    if (parsed.action === 'update_payment') {
      if (recentPaymentsNorm.length === 0) {
        return res.status(200).json({
          action: null,
          error: 'Não há registros de mensalidade na lista. Abra o assistente na página Mensalidades e aguarde o carregamento do mês.'
        });
      }
      const pid = String(parsed.data?.payment_id || parsed.data?.id || '').trim();
      const allowedPay = new Set(recentPaymentsNorm.map((p) => p.id));
      if (!pid || !allowedPay.has(pid)) {
        return res.status(200).json({
          action: null,
          error: 'payment_id inválido. Use o id exato da lista de mensalidades visível.'
        });
      }
      const sanitizedPay = sanitizePaymentUpdatesForNl(parsed.data || {});
      if (Object.keys(sanitizedPay).length === 0) {
        return res.status(200).json({
          action: null,
          error:
            'Nenhum campo válido para atualizar no pagamento. Ex.: "Coloca na observação do pagamento do João em abril: pago em duas vezes" (use note, account ou plan_name).'
        });
      }
      const prow = recentPaymentsNorm.find((p) => p.id === pid);
      parsed.data = {
        payment_id: pid,
        reference_month: prow?.reference_month || '',
        student_name: prow?.student_name || '',
        lead_id: prow?.lead_id || '',
        updates: sanitizedPay
      };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error(
      '[nl-action]',
      JSON.stringify({
        stage: 'handler_exception',
        message: String(err?.message || err).slice(0, 400),
        name: err?.name || ''
      })
    );
    return res.status(500).json({
      action: null,
      error: 'Erro ao processar o comando. Tente novamente.'
    });
  }
}

import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { normalizeScheduleTime, isValidYmd } from '../nlScheduleParse.js';
import { sanitizeStudentUpdatesForNl } from '../studentNlUpdates.js';
import { normalizeLeadProfileType } from '../leadTypeNormalize.js';
import { sanitizePaymentUpdatesForNl } from '../paymentNlUpdates.js';
import { matchStockProduct, catalogProductsForNl } from '../nlStockMatch.js';
import { suggestStudentsByName } from '../nlStudentMatch.js';
import { enrichRegisterPayment } from '../nlPaymentResolve.js';
import { enrichAdjustStockFromNl, buildAdjustStockSummary } from './inventoryAdjustAgent.js';
import { answerInventoryQuery } from './inventoryReportAgent.js';
import { answerAcademyQuery } from './nlAcademyQuery.js';
import { enrichNlActionContext } from './nlActionContextFetch.js';
import { isAdjustmentSubtype } from '../../src/lib/inventoryAdjust.js';
import { Client, Databases } from 'node-appwrite';
import { apiErro } from './friendlyError.js';
import { assertAiModuleEnabled, sendAiFeatureDisabledError } from './aiFeaturePolicy.js';

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
  try {
    assertAiModuleEnabled(access.doc);
  } catch (e) {
    if (sendAiFeatureDisabledError(res, e)) return;
    throw e;
  }

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
    recentPayments: recentPaymentsRaw,
    stockProducts: stockProductsRaw,
    financePlans: financePlansRaw
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

  const rawCtx = String(context || '').trim().toLowerCase();
  const normalizedContext = ['financeiro', 'funil', 'perfil', 'vendas'].includes(rawCtx) ? rawCtx : '';
  const showFinance =
    !normalizedContext ||
    normalizedContext === 'financeiro' ||
    normalizedContext === 'perfil' ||
    normalizedContext === 'vendas';
  const showFunnel = !normalizedContext || normalizedContext === 'funil' || normalizedContext === 'perfil';

  const endpoint =
    process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
  const projectId =
    process.env.APPWRITE_PROJECT_ID ||
    process.env.VITE_APPWRITE_PROJECT ||
    process.env.VITE_APPWRITE_PROJECT_ID ||
    '';
  const apiKey = process.env.APPWRITE_API_KEY || '';
  const databases = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

  let pendingForNl = [];
  let recentPaymentsNorm = [];
  let pipelineStages = [];

  try {
    const enriched = await enrichNlActionContext(databases, {
      academyId,
      showFinance,
      showFunnel,
      clientPending: pendingTransactionsRaw,
      clientPayments: recentPaymentsRaw,
      clientStages: pipelineStagesRaw,
      referenceMonth: currentMonth,
    });
    pendingForNl = enriched.pendingForNl;
    recentPaymentsNorm = enriched.recentPaymentsNorm;
    pipelineStages = enriched.pipelineStages;
  } catch (e) {
    console.error('[nl-action]', JSON.stringify({ stage: 'context_enrich', message: String(e?.message || e).slice(0, 200) }));
  }

  const pipelineStageLines = pipelineStages
    .map((s) => `- id: ${s.id} — label: ${s.label}`)
    .join('\n');

  const pendingTxLines = pendingForNl
    .map(
      (t) =>
        `- id: ${t.id} — nota: ${String(t.note || '').slice(0, 80)} — bruto: ${t.gross} — tipo: ${t.type} — criada: ${String(t.createdAt || '').slice(0, 16)}`
    )
    .join('\n');

  const paymentLinesForNl = recentPaymentsNorm
    .map(
      (p) =>
        `- id: ${p.id} — aluno: ${p.student_name || p.lead_id || '?'} — mês: ${p.reference_month} — status: ${p.status} — valor: ${Number.isFinite(p.amount) ? p.amount : '?'} — plano: ${String(p.plan_name || '').slice(0, 40)} — obs.: ${String(p.note || '').slice(0, 72)}`
    )
    .join('\n');

  const stockProductsNorm = catalogProductsForNl(
    (Array.isArray(stockProductsRaw) ? stockProductsRaw : []).slice(0, 220)
  );
  const stockProductLines = stockProductsNorm
    .map(
      (p) =>
        `- id: ${p.id} — ${p.display_label} — preço: ${p.sale_price != null ? p.sale_price : 'não cadastrado'} — estoque: ${p.current_quantity}`
    )
    .join('\n');

  const financePlansNorm = (Array.isArray(financePlansRaw) ? financePlansRaw : [])
    .slice(0, 40)
    .map((p) => ({
      name: String(p?.name || '').trim(),
      price: Number(p?.price),
    }))
    .filter((p) => p.name);
  const financePlanLines = financePlansNorm.map((p) => `- ${p.name}: R$ ${p.price}`).join('\n');

  const studentsArr = Array.isArray(students) ? students : [];

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
${showFinance && pendingTxLines ? `Transações financeiras PENDENTES (para settle_transaction use transaction_id = id exato):\n${pendingTxLines}\n` : showFinance ? 'Transações pendentes: nenhuma no momento — não use settle_transaction.\n' : ''}
${showFinance && paymentLinesForNl ? `Registros de mensalidade visíveis (para update_payment use payment_id = id exato):\n${paymentLinesForNl}\n` : showFinance ? 'Mensalidades do mês: nenhum registro — não use update_payment.\n' : ''}
Você suporta APENAS as ações listadas abaixo:
${showFinance ? '1. register_payment — registrar pagamento de mensalidade de um aluno (ex.: "Deivid pagou a mensalidade de maio, pix")\n2. register_sale — registrar venda de produto do estoque (ex.: "vendi rashguard branca M para o Deivid, pix")\n3. adjust_stock — ajustar saldo por perda/correção SEM venda (ex.: "quebramos 2 bonés", "sumiu uma camisa G", "ajusta estoque da camisa M para 5")\n4. inventory_query — CONSULTAR estoque/vendas/margem (ex.: "quais produtos estão parados?", "o que mais vendeu esse mês?") — NÃO altera dados\n5. academy_query — CONSULTAR alunos/mensalidades (ex.: "quem fez matrícula esse mês?", "quem ainda não pagou?", "quem está inadimplente?") — NÃO altera dados\n6. add_note — adicionar uma nota sobre um lead ou aluno\n7. register_expense — registrar despesa/saída (compras, estoque, frutas, material, etc.)\n8. register_checkin — registrar presença (check-in) de um aluno\n9. update_student — atualizar dados do aluno (só campos permitidos em updates)\n10. freeze_plan — trancar plano de aluno matriculado (start_ymd, duration_days ou end_ymd, reason)\n11. settle_transaction — liquidar transação pendente (transaction_id da lista acima)\n12. update_payment — alterar observação (note), conta (account) ou nome do plano (plan_name) de um registro de mensalidade (payment_id da lista de mensalidades)' : ''}
${showFinance && stockProductLines ? `\nProdutos do estoque (para register_sale e adjust_stock use variant_id/stock_item_id = id exato):\n${stockProductLines}\n` : showFinance ? '\nProdutos do estoque: lista não enviada — register_sale e adjust_stock precisam do catálogo (Vendas ou Estoque).\n' : ''}
${showFinance && financePlanLines ? `Planos da academia (valores de referência para mensalidades):\n${financePlanLines}\n` : ''}
${showFunnel ? '8. mark_attended — marcar lead como "Compareceu" na aula experimental\n9. mark_missed — marcar lead como "Não Compareceu"\n10. register_whatsapp — registrar que enviou WhatsApp para um lead\n11. mark_enrolled — marcar lead do funil como matriculado (vira aluno)\n12. mark_lost — marcar lead como perdido (encerra oportunidade)\n13. schedule_experimental — agendar aula experimental (data YYYY-MM-DD + hora HH:mm)\n14. move_pipeline_stage — mover lead para outra etapa do funil (só ids listados acima; não usar para Matriculado, Não compareceu, Perdido nem Aula experimental)\n15. create_lead — cadastrar novo lead (nome + telefone obrigatórios)' : ''}

Consultas somente leitura (qualquer tela — use action correspondente, NÃO altere dados):
- academy_query — alunos/mensalidades/funil (query_type abaixo; reference_month YYYY-MM; period week|month; period_from/period_to opcionais):
  • enrolled_in_month — quem matriculou no mês
  • unpaid_tuition — quem não pagou mensalidade no mês
  • overdue_tuition — inadimplentes no mês
  • new_leads — leads novos no funil (padrão: semana atual; "esse mês" → period month)
  • attended_experimental — quem compareceu à aula experimental no período
  • scheduled_experimental — quem tem experimental agendada no período
  • missed_experimental — quem faltou / não compareceu à experimental no período
  • lost_leads — leads perdidos (Não fechou) no período
  • pipeline_stage — leads em uma etapa do funil (pipeline_stage = nome citado na pergunta)
  • finance_summary — resumo caixa do mês: entradas, saídas e saldo liquidado
  • student_payment_status — status de mensalidade de UM aluno citado pelo nome (reference_month YYYY-MM)
  • checkins_today — quem fez check-in / presença hoje
  • overdue_tasks — tarefas pendentes com prazo vencido
- inventory_query — estoque/vendas: produtos parados, top vendas, margem, saldo (query_type: top_sellers | slow_movers | stock_level | margin)

Responda SEMPRE com um JSON válido e nada mais. Sem texto adicional, sem markdown, sem blocos de código.

Se conseguir interpretar, retorne EXATAMENTE este formato:
{
  "action": "register_payment" | "register_sale" | "adjust_stock" | "inventory_query" | "academy_query" | "register_expense" | "register_checkin" | "update_student" | "freeze_plan" | "settle_transaction" | "update_payment" | "add_note" | "mark_attended" | "mark_missed" | "register_whatsapp" | "mark_enrolled" | "mark_lost" | "schedule_experimental" | "move_pipeline_stage" | "create_lead",
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
    "lead_name": "nome — create_lead (alternativa a name)",
    "stock_item_id": "id exato do produto — register_sale",
    "product_query": "texto livre do produto mencionado — register_sale se stock_item_id incerto",
    "product_name": "nome do produto — register_sale",
    "variation": "tamanho/variação — register_sale",
    "quantity": número (padrão 1) — register_sale",
    "unit_price": número ou null — register_sale (null = usar sale_price do cadastro)",
    "customer_name": "nome do cliente avulso — register_sale sem student_id",
    "customer_phone": "telefone — register_sale cliente avulso",
    "payment_form": "pix | dinheiro | cartao_debito | cartao_credito | transferencia | outro — register_sale",
    "plan_name": "nome do plano — register_payment",
    "start_ymd": "YYYY-MM-DD — freeze_plan",
    "end_ymd": "YYYY-MM-DD — freeze_plan",
    "duration_days": "número inteiro — freeze_plan",
    "indefinite": "boolean — freeze_plan",
    "variant_id": "id exato da variante — adjust_stock",
    "quantity_change": "número inteiro (+/-) — adjust_stock",
    "target_quantity": "saldo final desejado — adjust_stock (calcule quantity_change)",
    "subtype": "avaria | furto | doacao | erro_conta — adjust_stock",
    "variant_label": "rótulo amigável — adjust_stock",
    "query_type": "top_sellers | slow_movers | stock_level | margin — inventory_query; enrolled_in_month | unpaid_tuition | overdue_tuition | new_leads | attended_experimental | scheduled_experimental | missed_experimental | lost_leads | pipeline_stage | finance_summary | student_payment_status | checkins_today | overdue_tasks — academy_query",
    "period": "week | month — academy_query (new_leads, attended_experimental, scheduled_experimental, missed_experimental, lost_leads; padrão week)",
    "pipeline_stage": "nome da etapa do funil — academy_query pipeline_stage (ex.: Aguardando decisão)",
    "student_name_filter": "nome do aluno — academy_query student_payment_status",
    "period_from": "YYYY-MM-DD início — inventory_query (opcional)",
    "period_to": "YYYY-MM-DD fim — inventory_query (opcional)"
  },
  "summary": "frase curta em português descrevendo a ação",
  "missing": [],
  "warnings": []
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
- register_payment: student_id obrigatório; amount e method podem ser null; use para REGISTRAR pagamento, não para consultar se está em dia
- register_sale: stock_item_id OU product_query obrigatório; student_id opcional (se ausente, customer_name); quantity padrão 1; unit_price null usa preço do catálogo
- adjust_stock: variant_id (ou stock_item_id) OU product_query obrigatório; quantity_change obrigatório (negativo = saída, positivo = entrada); subtype obrigatório; NÃO gera pagamento nem venda
- inventory_query: use para perguntas sobre estoque, vendas no período, margem ou produtos parados; query_type conforme intenção; product_name_filter quando citar produto; NÃO use register_sale nem adjust_stock para consultas
- academy_query: use para PERGUNTAS sobre alunos, mensalidades, funil e resumo financeiro; query_type conforme intenção; reference_month YYYY-MM; para new_leads/attended_experimental/scheduled_experimental/missed_experimental/lost_leads use period week (semana) ou month (mês); pipeline_stage exige pipeline_stage com nome da etapa; finance_summary usa reference_month; NÃO use register_payment para consultas; summary = UMA linha curta de resumo (ex.: "57 matrículas em maio de 2026") — sem listas, bullets nem nomes no summary (a lista detalhada é montada pelo servidor)
- inventory_query: summary = UMA linha curta; se precisar listar itens no texto de resposta do servidor, use markdown com linha de resumo + lista com traço "- item" (nunca bullets • em texto corrido)
- NÃO use register_sale para perguntas de preço ("quanto custa…") — use inventory_query margin ou action null
- NÃO use adjust_stock para vendas com pagamento — use register_sale
- NÃO use register_payment para consultas de status ("está em dia?") — action null com orientação
- cancelamento/estorno de venda não suportado — action null orientando fazer em Vendas manualmente
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
- freeze_plan: student_id obrigatório (aluno matriculado); start_ymd obrigatório (YYYY-MM-DD; "hoje" → data de hoje); duration_days OU end_ymd obrigatório; reason recomendado; indefinite opcional
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
      ['register_payment', 'register_sale', 'adjust_stock', 'add_note', 'register_expense', 'register_checkin', 'update_student', 'freeze_plan', 'settle_transaction', 'update_payment'].includes(
        parsed.action
      )
    ) {
      return res.status(200).json({
        action: null,
        error: 'A ação identificada não pertence ao contexto do funil.'
      });
    }

    if (parsed.action === 'inventory_query') {
      const d = parsed.data || {};
      const endpoint =
        process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
      const projectId =
        process.env.APPWRITE_PROJECT_ID ||
        process.env.VITE_APPWRITE_PROJECT ||
        process.env.VITE_APPWRITE_PROJECT_ID ||
        '';
      const apiKey = process.env.APPWRITE_API_KEY || '';
      const databases = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));
      const now = new Date();
      const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const defaultTo = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
      try {
        const out = await answerInventoryQuery(databases, {
          academyId,
          from: String(d.period_from || d.periodFrom || defaultFrom).slice(0, 10),
          to: String(d.period_to || d.periodTo || defaultTo).slice(0, 10),
          queryType: String(d.query_type || '').trim(),
          productNameFilter: String(d.product_name_filter || d.product_query || '').trim(),
        });
        parsed.data = { ...d, resposta: out.resposta, query_type: d.query_type || 'top_sellers' };
        parsed.summary = String(out.resposta || '').split('\n')[0].slice(0, 200);
      } catch (e) {
        return res.status(200).json({
          action: null,
          error: apiErro(e, 'load'),
        });
      }
    }

    if (parsed.action === 'academy_query') {
      const d = parsed.data || {};
      const endpoint =
        process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
      const projectId =
        process.env.APPWRITE_PROJECT_ID ||
        process.env.VITE_APPWRITE_PROJECT ||
        process.env.VITE_APPWRITE_PROJECT_ID ||
        '';
      const apiKey = process.env.APPWRITE_API_KEY || '';
      const databases = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));
      try {
        const out = await answerAcademyQuery(databases, {
          academyId,
          queryType: String(d.query_type || '').trim(),
          referenceMonth: String(d.reference_month || currentMonth).trim(),
          period: String(d.period || '').trim(),
          periodFrom: String(d.period_from || d.periodFrom || '').trim(),
          periodTo: String(d.period_to || d.periodTo || '').trim(),
          pipelineStage: String(d.pipeline_stage || d.stage_name || '').trim(),
          studentName: String(d.student_name || d.student_name_filter || '').trim(),
        });
        parsed.data = { ...d, ...out };
        parsed.summary = String(out.resposta || '').split('\n')[0].slice(0, 200);
      } catch (e) {
        return res.status(200).json({
          action: null,
          error: apiErro(e, 'load'),
        });
      }
    }

    if (parsed.action === 'adjust_stock') {
      if (stockProductsNorm.length === 0) {
        return res.status(200).json({
          action: null,
          error: 'Catálogo de estoque não carregado. Abra Estoque ou Vendas e tente de novo.',
        });
      }
      parsed = enrichAdjustStockFromNl(parsed, stockProductsNorm);
      const d = parsed.data || {};
      const variantId = String(d.variant_id || d.stock_item_id || '').trim();
      const qtyChange = Number(d.quantity_change);
      let subtype = String(d.subtype || '').trim();
      if (!variantId) {
        return res.status(200).json({
          action: null,
          error: `Não encontrei o produto no estoque.${d.product_query ? ` Busca: ${d.product_query}` : ''}`,
        });
      }
      if (!Number.isFinite(qtyChange) || qtyChange === 0) {
        return res.status(200).json({
          action: null,
          error: 'Informe a quantidade do ajuste (ex.: -2 para perda, ou saldo final desejado).',
        });
      }
      if (!isAdjustmentSubtype(subtype)) subtype = 'avaria';
      parsed.data = { ...d, variant_id: variantId, subtype, quantity_change: qtyChange };
      parsed.summary = buildAdjustStockSummary(parsed.data);
      const row = stockProductsNorm.find((p) => String(p.id) === variantId);
      if (row) {
        const after = Number(row.current_quantity) + qtyChange;
        if (after < 0) {
          return res.status(200).json({
            action: null,
            error: `Saldo insuficiente (atual: ${row.current_quantity}, ajuste: ${qtyChange}).`,
          });
        }
      }
    }

    if (parsed.action === 'register_payment') {
      const sid = String(parsed.data?.student_id || '').trim();
      if (!sid || !allowedIds.has(sid)) {
        const qName = String(parsed.data?.student_name || text || '').trim();
        const suggestions = suggestStudentsByName(qName, studentsArr);
        const hint =
          suggestions.length > 0
            ? ` Você quis dizer: ${suggestions.map((s) => s.name).join(', ')}?`
            : '';
        return res.status(200).json({
          action: null,
          error: `Não encontrei "${qName || 'o aluno'}" no sistema.${hint}`,
          suggestions
        });
      }
      const studentRow = studentsArr.find((s) => String(s.id).trim() === sid);
      parsed = enrichRegisterPayment(parsed, studentRow, financePlansNorm, recentPaymentsNorm);
    }

    if (parsed.action === 'register_sale') {
      if (stockProductsNorm.length === 0) {
        return res.status(200).json({
          action: null,
          error: 'Catálogo de produtos não carregado. Abra o assistente na página Vendas ou aguarde o estoque carregar.'
        });
      }

      const warnings = Array.isArray(parsed.warnings) ? [...parsed.warnings] : [];
      const d0 = parsed.data || {};
      let sid = String(d0.student_id || '').trim();
      const customerName = String(d0.customer_name || '').trim();

      if (sid && !allowedIds.has(sid)) {
        const suggestions = suggestStudentsByName(
          String(d0.student_name || customerName || '').trim(),
          studentsArr
        );
        const hint =
          suggestions.length > 0
            ? ` Você quis dizer: ${suggestions.map((s) => s.name).join(', ')}?`
            : '';
        return res.status(200).json({
          action: null,
          error: `Aluno não encontrado no cadastro.${hint}`,
          suggestions
        });
      }

      if (!sid && !customerName && String(d0.student_name || '').trim()) {
        const walkIn = String(d0.student_name).trim();
        const suggestions = suggestStudentsByName(walkIn, studentsArr);
        if (suggestions.length === 1 && suggestions[0].score >= 85) {
          sid = suggestions[0].id;
          parsed.data = { ...d0, student_id: sid, student_name: suggestions[0].name };
        } else if (suggestions.length > 1) {
          return res.status(200).json({
            action: null,
            error: `Vários alunos parecidos com "${walkIn}": ${suggestions.map((s) => s.name).join(', ')}. Seja mais específico.`,
            suggestions
          });
        } else {
          parsed.data = { ...d0, customer_name: walkIn, student_id: null };
        }
      }

      const match = matchStockProduct(
        String(d0.product_query || d0.product_name || '').trim() ||
          [d0.product_name, d0.variation].filter(Boolean).join(' '),
        stockProductsNorm,
        { stockItemId: String(d0.stock_item_id || '').trim() }
      );

      if (match.status === 'not_found') {
        const labels = (match.suggestions || []).map((s) => s.label).filter(Boolean);
        return res.status(200).json({
          action: null,
          error:
            labels.length > 0
              ? `Não encontrei "${String(d0.product_query || d0.product_name || 'o produto')}" no estoque. Você quis dizer: ${labels.join('; ')}?`
              : `Não encontrei "${String(d0.product_query || d0.product_name || 'o produto')}" no estoque.`,
          suggestions: match.suggestions
        });
      }

      if (match.status === 'ambiguous') {
        const labels = (match.suggestions || []).map((s) => s.label).filter(Boolean);
        return res.status(200).json({
          action: null,
          error: `Encontrei vários produtos parecidos. Escolha um: ${labels.join('; ')}.`,
          suggestions: match.suggestions
        });
      }

      const product = match.product;
      const qty = Math.max(1, Math.trunc(Number(d0.quantity) || 1));
      let unitPrice = d0.unit_price != null && d0.unit_price !== '' ? Number(d0.unit_price) : null;
      if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        unitPrice =
          product.sale_price != null && Number.isFinite(Number(product.sale_price))
            ? Number(product.sale_price)
            : null;
      }
      if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        return res.status(200).json({
          action: null,
          error: `Preço não cadastrado para "${product.display_label}". Informe o valor na frase ou cadastre o preço no estoque.`,
          missing: ['unit_price']
        });
      }

      if (Number(product.current_quantity) === 0) {
        warnings.push(`${product.display_label} está sem estoque. Você pode registrar mesmo assim.`);
      } else if (qty > Number(product.current_quantity)) {
        warnings.push(
          `Quantidade (${qty}) acima do estoque (${product.current_quantity}). Confirme se deseja continuar.`
        );
      }

      const studentRow = sid ? studentsArr.find((s) => String(s.id).trim() === sid) : null;
      parsed.data = {
        ...d0,
        student_id: sid || null,
        student_name: studentRow?.name || String(d0.student_name || '').trim() || null,
        customer_name: sid ? null : customerName || String(d0.customer_name || d0.student_name || '').trim() || null,
        stock_item_id: product.id,
        product_name: product.display_label,
        variation: String(product.Tamanho || d0.variation || '').trim() || null,
        quantity: qty,
        unit_price: unitPrice,
        payment_form: String(d0.payment_form || d0.method || 'pix').trim().toLowerCase(),
        sale_price_catalog: product.sale_price,
        current_quantity: product.current_quantity
      };
      parsed.warnings = warnings;
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

    if (parsed.action === 'freeze_plan') {
      const sid = String(parsed.data?.student_id || '').trim();
      if (!sid || !allowedIds.has(sid)) {
        const qName = String(parsed.data?.student_name || text || '').trim();
        const suggestions = suggestStudentsByName(qName, studentsArr);
        const hint =
          suggestions.length > 0
            ? ` Você quis dizer: ${suggestions.map((s) => s.name).join(', ')}?`
            : '';
        return res.status(200).json({
          action: null,
          error: `Não encontrei o aluno para trancar.${hint}`,
          suggestions
        });
      }
      const startYmd = String(parsed.data?.start_ymd || parsed.data?.startYmd || '').trim().slice(0, 10);
      const durationDays = parsed.data?.duration_days ?? parsed.data?.durationDays;
      const endYmd = String(parsed.data?.end_ymd || parsed.data?.endYmd || '').trim().slice(0, 10);
      if (!startYmd || (!endYmd && (durationDays == null || durationDays === ''))) {
        return res.status(200).json({
          action: null,
          error: 'Informe data de início e duração (dias) ou data de retorno para o trancamento.'
        });
      }
      const studentRow = studentsArr.find((s) => String(s.id).trim() === sid);
      parsed.data = {
        ...parsed.data,
        student_id: sid,
        student_name: String(parsed.data?.student_name || studentRow?.name || '').trim(),
        start_ymd: startYmd,
        end_ymd: endYmd || null,
        duration_days: durationDays != null && durationDays !== '' ? Number(durationDays) : null,
        reason: String(parsed.data?.reason || '').trim(),
        indefinite: parsed.data?.indefinite === true,
      };
      parsed.summary =
        parsed.summary ||
        `Trancar ${parsed.data.student_name || 'aluno'} a partir de ${startYmd}`;
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
      const typ = normalizeLeadProfileType(String(parsed.data?.type || '').trim());
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
          error: 'Não há transações pendentes para liquidar. Reformule ou confira o Caixa.',
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
          error: 'Não há registros de mensalidade para editar neste mês. Cite o mês ou reformule o comando.',
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

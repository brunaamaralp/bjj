import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { assertAiModuleEnabled, sendAiFeatureDisabledError } from './aiFeaturePolicy.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_TIMEOUT_MS = 12_000;

const IMPORT_FIELDS = [
  'date',
  'amount',
  'student_name',
  'direction',
  'category',
  'note',
  'method',
  'competence_month',
];

const CATEGORY_LABELS = Object.values(FINANCE_CATEGORIES).map((c) => c.label);

const FINANCE_TX_IMPORT_SYSTEM_PROMPT = `Você é um assistente de importação de lançamentos financeiros para uma academia.
Analise os cabeçalhos e linhas de exemplo de uma planilha e mapeie cada coluna para um dos campos:

Campos disponíveis:
- date (obrigatório): data do lançamento / pagamento / recebimento
- amount (obrigatório): valor monetário recebido (preferir "Valor Recebido" sobre "Valor Venda")
- student_name: nome do aluno (coluna Aluno) — usado para detectar duplicatas
- direction: natureza — entrada ou saída (sinônimos: tipo, crédito/débito, receita/despesa)
- category: categoria contábil (ex.: Mensalidades, Salários e encargos, Outras despesas)
- note: descrição / histórico / observação
- method: forma de pagamento (PIX, dinheiro, cartão, etc.)
- competence_month: mês de competência no formato YYYY-MM (raro; se ausente, null)

Categorias válidas do sistema:
${CATEGORY_LABELS.map((l) => `- ${l}`).join('\n')}

Responda APENAS com JSON válido:
{
  "mapping": {
    "date": "NomeDaColuna",
    "amount": "NomeDaColuna",
    "student_name": null,
    "direction": null,
    "category": null,
    "note": null,
    "method": null,
    "competence_month": null,
    "unmapped": ["ColunasSemMatch"]
  },
  "confidence": {
    "date": "high",
    "amount": "medium"
  },
  "suggestions": "texto opcional"
}`;

function extractJsonObject(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const clean = t.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickHeader(headers, candidates) {
  const byNorm = new Map(headers.map((h) => [normalizeHeader(h), h]));
  for (const c of candidates) {
    const hit = byNorm.get(normalizeHeader(c));
    if (hit) return hit;
  }
  for (const c of candidates) {
    const nc = normalizeHeader(c);
    for (const [norm, orig] of byNorm) {
      if (norm.includes(nc) || nc.includes(norm)) return orig;
    }
  }
  return null;
}

function looksLikeNativeFinanceTxHeaders(headers = []) {
  const dateCol = pickHeader(headers, [
    'data',
    'date',
    'dt',
    'data lancamento',
    'data lançamento',
    'data pagamento',
    'data movimento',
  ]);
  const amountCol = pickHeader(headers, [
    'valor recebido',
    'recebido',
    'amount',
    'valor',
    'value',
    'quantia',
    'total',
    'vlr',
  ]);
  return Boolean(dateCol && amountCol);
}

function nativeMappingFromHeaders(headers = []) {
  const mapping = {};
  for (const f of IMPORT_FIELDS) mapping[f] = null;

  mapping.date = pickHeader(headers, [
    'data',
    'date',
    'dt',
    'data lancamento',
    'data lançamento',
    'data pagamento',
    'data movimento',
  ]);
  mapping.amount = pickHeader(headers, [
    'valor recebido',
    'recebido',
    'amount',
    'valor',
    'value',
    'quantia',
    'total',
    'vlr',
  ]);
  mapping.student_name = pickHeader(headers, [
    'aluno',
    'nome aluno',
    'nome do aluno',
    'estudante',
    'nome',
    'name',
  ]);
  mapping.direction = pickHeader(headers, [
    'natureza',
    'tipo',
    'direction',
    'entrada/saida',
    'entrada saída',
    'credito debito',
    'crédito débito',
    'receita despesa',
  ]);
  mapping.category = pickHeader(headers, ['categoria', 'category', 'classificacao', 'classificação', 'conta']);
  mapping.note = pickHeader(headers, [
    'descricao',
    'descrição',
    'description',
    'historico',
    'histórico',
    'observacao',
    'observação',
    'memo',
    'nota',
  ]);
  mapping.method = pickHeader(headers, [
    'forma pgto',
    'forma pagamento',
    'forma de pagamento',
    'method',
    'pagamento',
    'meio pagamento',
  ]);
  mapping.competence_month = pickHeader(headers, [
    'competencia',
    'competência',
    'mes competencia',
    'mês competência',
    'competence_month',
  ]);

  mapping.unmapped = headers.filter((h) => !Object.values(mapping).includes(h));
  const confidence = {};
  for (const f of IMPORT_FIELDS) {
    confidence[f] = mapping[f] ? 'high' : 'low';
  }
  return {
    mapping,
    confidence,
    suggestions: 'Cabeçalhos reconhecidos — mapeamento automático aplicado.',
    manual_fallback: false,
  };
}

function emptyAiResponse(message) {
  const mapping = {};
  for (const f of IMPORT_FIELDS) mapping[f] = null;
  mapping.unmapped = [];
  return {
    mapping,
    confidence: {},
    suggestions: message || 'Mapeie as colunas manualmente.',
    manual_fallback: true,
  };
}

function sanitizeAiResponse(raw, headers) {
  const headerSet = new Set((headers || []).map((h) => String(h)));
  const mapping = {};
  const confidence = {};

  for (const f of IMPORT_FIELDS) {
    const col = raw?.mapping?.[f];
    if (col == null || col === '') mapping[f] = null;
    else {
      const name = String(col).trim();
      mapping[f] = headerSet.has(name) ? name : null;
    }
    const conf = raw?.confidence?.[f];
    if (conf === 'high' || conf === 'medium' || conf === 'low') confidence[f] = conf;
  }

  const unmapped = Array.isArray(raw?.mapping?.unmapped)
    ? raw.mapping.unmapped.map((c) => String(c).trim()).filter((c) => headerSet.has(c))
    : [];

  for (const h of headers || []) {
    const used = IMPORT_FIELDS.some((f) => mapping[f] === h);
    if (!used && !unmapped.includes(h)) unmapped.push(h);
  }
  mapping.unmapped = unmapped;

  return {
    mapping,
    confidence,
    suggestions: typeof raw?.suggestions === 'string' ? raw.suggestions.trim() : '',
    manual_fallback: false,
  };
}

/**
 * POST /api/agent?route=import-finance-tx — mapeamento IA de colunas → lançamentos do Caixa.
 */
export default async function importFinanceTxHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }
  }

  const headers = Array.isArray(body?.headers) ? body.headers.map((h) => String(h)) : [];
  const sample_rows = Array.isArray(body?.sample_rows) ? body.sample_rows.slice(0, 5) : [];

  if (!headers.length) {
    return res.status(400).json({ error: 'headers_required' });
  }

  if (looksLikeNativeFinanceTxHeaders(headers)) {
    return res.status(200).json(nativeMappingFromHeaders(headers));
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(200).json({
      ...emptyAiResponse('IA não configurada. Mapeie data e valor manualmente.'),
    });
  }

  try {
    assertAiModuleEnabled(access.doc);
  } catch (e) {
    if (sendAiFeatureDisabledError(res, e)) return;
    throw e;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: FINANCE_TX_IMPORT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              `Cabeçalhos: ${JSON.stringify(headers)}`,
              `Exemplo linha 1: ${JSON.stringify(sample_rows?.[0] || {})}`,
              '',
              'Mapeie date e amount (obrigatórios). direction/category/note/method são opcionais.',
              'Responda APENAS com JSON puro.',
            ].join('\n'),
          },
        ],
      }),
    });

    clearTimeout(timer);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[importFinanceTxHandler] Anthropic error:', data?.error?.message || response.status);
      return res.status(422).json({
        error: 'Não consegui interpretar essa planilha.',
        hint: 'Garanta colunas de data e valor, ou baixe o modelo CSV.',
      });
    }

    const parsed = extractJsonObject(data.content?.[0]?.text || '');
    if (!parsed || typeof parsed !== 'object') {
      return res.status(422).json({
        error: 'Não consegui interpretar essa planilha.',
        hint: 'Resposta da IA inválida. Revise os cabeçalhos e tente novamente.',
      });
    }

    return res.status(200).json(sanitizeAiResponse(parsed, headers));
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      return res.status(422).json({
        error: 'Não consegui interpretar essa planilha.',
        hint: 'A análise demorou demais. Mapeie data e valor manualmente.',
      });
    }
    console.error('[importFinanceTxHandler]', err);
    return res.status(422).json({
      error: 'Não consegui interpretar essa planilha.',
      hint: 'Erro ao consultar a IA. Mapeie as colunas manualmente.',
    });
  }
}

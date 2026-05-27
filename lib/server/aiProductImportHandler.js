import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { isParentVariantCatalogEnabled } from './productCatalogDb.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_TIMEOUT_MS = 10_000;

export const PRODUCT_IMPORT_SYSTEM_PROMPT = `Você é um assistente de importação de produtos para uma academia.
Analise os cabeçalhos e linhas de exemplo de um CSV e mapeie cada coluna
para um dos campos do sistema:

Campos disponíveis:
- nome (obrigatório): nome do produto
- categoria: categoria do produto (ex: Kimono, Rashguard, Acessórios)
- Tamanho: variação/tamanho (ex: A1, A2, P, M, G, Único)
- descricao: descrição do produto
- sale_price: preço de venda (número)
- cost_price: preço de custo (número)
- initial_quantity: quantidade inicial em estoque (inteiro)
- minimum_level: nível mínimo de estoque (inteiro, padrão 3)
- unit: unidade (unidade, pacote, kg)
- sku: código de referência
- is_for_sale: se é para venda (true/false)

Para cada coluna do CSV, indique:
1. O campo correspondente (ou null se não houver correspondência)
2. Confiança: high (nome exato ou óbvio), medium (similar), low (incerto)

Responda APENAS com JSON válido no formato:
{
  "mapping": {
    "nome": "NomeDaColunaCSV",
    "categoria": "ColunaOuNull",
    "Tamanho": null,
    "descricao": null,
    "sale_price": null,
    "cost_price": null,
    "initial_quantity": null,
    "minimum_level": null,
    "unit": null,
    "sku": null,
    "is_for_sale": null,
    "unmapped": ["ColunasSemMatch"]
  },
  "confidence": {
    "nome": "high",
    "sale_price": "medium"
  },
  "suggestions": "texto opcional com dicas"
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

const PRODUCT_FIELDS = [
  'nome',
  'categoria',
  'Tamanho',
  'descricao',
  'sale_price',
  'cost_price',
  'initial_quantity',
  'minimum_level',
  'unit',
  'sku',
  'is_for_sale',
];

function emptyAiResponse(message) {
  const mapping = {};
  for (const f of PRODUCT_FIELDS) mapping[f] = null;
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

  for (const f of PRODUCT_FIELDS) {
    const col = raw?.mapping?.[f];
    if (col == null || col === '') {
      mapping[f] = null;
    } else {
      const name = String(col).trim();
      mapping[f] = headerSet.has(name) ? name : null;
    }
    const conf = raw?.confidence?.[f];
    if (conf === 'high' || conf === 'medium' || conf === 'low') {
      confidence[f] = conf;
    }
  }

  const unmapped = Array.isArray(raw?.mapping?.unmapped)
    ? raw.mapping.unmapped.map((c) => String(c).trim()).filter((c) => headerSet.has(c))
    : [];

  for (const h of headers || []) {
    const used = PRODUCT_FIELDS.some((f) => mapping[f] === h);
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
 * Mapeamento de colunas CSV → campos de produto via Claude.
 */
export default async function aiProductImportHandler(req, res) {
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

  const catalogMode = isParentVariantCatalogEnabled() ? 'parent_variant' : 'legacy';

  if (!ANTHROPIC_API_KEY) {
    return res.status(200).json({
      ...emptyAiResponse('IA não configurada. Mapeie as colunas manualmente.'),
      catalog_mode: catalogMode,
    });
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
        max_tokens: 1000,
        system: PRODUCT_IMPORT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Headers: ${JSON.stringify(headers)}\n\nLinhas de exemplo:\n${JSON.stringify(sample_rows)}`,
          },
        ],
      }),
    });

    clearTimeout(timer);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error?.message || data?.error || `anthropic_http_${response.status}`;
      console.error('[aiProductImportHandler] Anthropic error:', msg);
      return res.status(200).json({
        ...emptyAiResponse('Não foi possível obter sugestão da IA. Mapeie manualmente.'),
        catalog_mode: catalogMode,
      });
    }

    const rawText = data.content?.[0]?.text || '';
    const parsed = extractJsonObject(rawText);
    if (!parsed || typeof parsed !== 'object') {
      return res.status(200).json({
        ...emptyAiResponse('Resposta da IA inválida. Mapeie as colunas manualmente.'),
        catalog_mode: catalogMode,
      });
    }

    return res.status(200).json({ ...sanitizeAiResponse(parsed, headers), catalog_mode: catalogMode });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      return res.status(200).json({
        ...emptyAiResponse('A análise demorou demais. Mapeie as colunas manualmente.'),
        catalog_mode: catalogMode,
      });
    }
    console.error('[aiProductImportHandler]', err);
    return res.status(200).json({
      ...emptyAiResponse('Erro ao consultar a IA. Mapeie as colunas manualmente.'),
      catalog_mode: catalogMode,
    });
  }
}

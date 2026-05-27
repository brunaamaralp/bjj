import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const IMPORT_PARSE_ERROR =
  'Não consegui interpretar a planilha. Tente exportar um plano de contas pelo Nave e usar esse arquivo como modelo.';

const IMPORT_PARSE_HINT =
  'No Caixa, abra Plano de contas e use o botão "Exportar plano" para baixar um CSV modelo com as colunas: Código, Nome, Tipo, Natureza, Grupo DRE, Classe DFC, Subcl. DFC e Caixa.';

const DRE_GROUPS = new Set([
  'Receita Bruta',
  'Deduções',
  'CMV/CPV',
  'Despesas Operacionais',
  'Resultado Financeiro',
  'Imposto s/ Lucro',
]);

const DFC_CLASSES = new Set(['Operacional', 'Investimento', 'Financiamento', 'Caixa']);

function normHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildHeaderMap(keys) {
  const map = {};
  for (const key of keys) {
    map[normHeader(key)] = key;
  }
  return map;
}

function hasHeader(headerMap, ...aliases) {
  return aliases.some((a) => headerMap[normHeader(a)] != null);
}

function pickCell(row, headerMap, ...aliases) {
  for (const alias of aliases) {
    const key = headerMap[normHeader(alias)];
    if (key == null) continue;
    const val = row[key];
    if (val != null && String(val).trim() !== '') return val;
  }
  return '';
}

function normType(t) {
  const s = String(t || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['ativo', 'asset'].includes(s)) return 'ativo';
  if (['passivo', 'liability'].includes(s)) return 'passivo';
  if (['pl', 'patrimonio', 'patrimônio', 'patrimonio liquido', 'patrimônio líquido'].includes(s)) return 'pl';
  if (['receita', 'revenue', 'income'].includes(s)) return 'receita';
  if (['despesa', 'expense'].includes(s)) return 'despesa';
  if (['custo', 'cost', 'cmv', 'cpv'].includes(s)) return 'custo';
  return 'ativo';
}

function normNature(n) {
  const s = String(n || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['credora', 'credit'].includes(s)) return 'credora';
  return 'devedora';
}

function parseCash(val) {
  const s = String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ['sim', 's', 'yes', 'y', 'true', '1', 'x'].includes(s);
}

function sanitizeAccounts(list) {
  if (!Array.isArray(list)) return [];
  return list.map((a) => {
    const dreGrupo = String(a?.dreGrupo || '').trim();
    const dfcClasse = String(a?.dfcClasse || '').trim();
    return {
      code: String(a?.code || '').trim(),
      name: String(a?.name || '').trim(),
      type: normType(a?.type),
      nature: normNature(a?.nature),
      dreGrupo: DRE_GROUPS.has(dreGrupo) ? dreGrupo : '',
      dfcClasse: DFC_CLASSES.has(dfcClasse) ? dfcClasse : '',
      dfcSubclasse: String(a?.dfcSubclasse || '').trim(),
      cash: Boolean(a?.cash),
    };
  }).filter((a) => a.code && a.name);
}

function sanitizePlans(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => ({
      name: String(p?.name || '').trim(),
      price: Number(p?.price),
      durationDays: Math.max(1, Number(p?.durationDays) || 30),
      description: String(p?.description || '').trim(),
      applyCardFee: p?.applyCardFee !== false,
    }))
    .filter((p) => p.name && Number.isFinite(p.price));
}

function sanitizeBankAccounts(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((b) => ({
      bankName: String(b?.bankName || '').trim(),
      branch: String(b?.branch || '').trim(),
      account: String(b?.account || '').trim(),
      accountName: String(b?.accountName || '').trim(),
      pixKey: String(b?.pixKey || '').trim(),
    }))
    .filter((b) => b.bankName || b.account || b.pixKey);
}

/** Export nativo do Nave: todas as colunas do CSV de "Exportar plano". */
function isNaveNativeExport(headerMap) {
  return (
    hasHeader(headerMap, 'Código', 'Codigo') &&
    hasHeader(headerMap, 'Nome', 'Name') &&
    hasHeader(headerMap, 'Tipo', 'Type') &&
    hasHeader(headerMap, 'Natureza', 'Nature') &&
    hasHeader(headerMap, 'Grupo DRE', 'DRE') &&
    hasHeader(headerMap, 'Classe DFC', 'DFC') &&
    hasHeader(headerMap, 'Subcl. DFC', 'Subcl DFC', 'Subclasse DFC') &&
    hasHeader(headerMap, 'Caixa', 'Cash')
  );
}

function parseNaveNativeAccounts(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const headerMap = buildHeaderMap(Object.keys(rows[0] || {}));
  if (!isNaveNativeExport(headerMap)) return null;

  const rawAccounts = rows.map((row) => ({
    code: pickCell(row, headerMap, 'Código', 'Codigo', 'Code'),
    name: pickCell(row, headerMap, 'Nome', 'Name'),
    type: pickCell(row, headerMap, 'Tipo', 'Type'),
    nature: pickCell(row, headerMap, 'Natureza', 'Nature'),
    dreGrupo: pickCell(row, headerMap, 'Grupo DRE', 'DRE'),
    dfcClasse: pickCell(row, headerMap, 'Classe DFC', 'DFC'),
    dfcSubclasse: pickCell(row, headerMap, 'Subcl. DFC', 'Subcl DFC', 'Subclasse DFC'),
    cash: parseCash(pickCell(row, headerMap, 'Caixa', 'Cash')),
  }));

  const accounts = sanitizeAccounts(rawAccounts);
  if (!accounts.length) return null;

  return {
    accounts,
    summary: `${accounts.length} conta(s) importada(s) do modelo Nave (sem IA).`,
  };
}

function getSpreadsheetHeaders(rows) {
  return Object.keys(rows[0] || {});
}

function formatRowAsColumns(row) {
  return Object.entries(row || {})
    .map(([key, value]) => `${key}=${JSON.stringify(String(value ?? '').trim())}`)
    .join(' | ');
}

function buildAiUserContent(rows, sample) {
  const headers = getSpreadsheetHeaders(rows);
  const exampleRow = rows[0];
  const headerList = headers.length ? headers.join(' | ') : '(sem cabeçalhos)';
  const exampleLine = exampleRow ? formatRowAsColumns(exampleRow) : '(vazio)';
  const dataLines = sample.map((row, index) => `Linha ${index + 1}: ${formatRowAsColumns(row)}`).join('\n');

  return `Cabeçalhos reais da planilha (use para mapear colunas → campos do JSON):
${headerList}

Linha de exemplo (primeira linha de dados — confirme o mapeamento antes de processar o restante):
${exampleLine}

---
Processe as ${sample.length} linha(s) abaixo com o mesmo mapeamento de colunas:
${dataLines}`;
}

function buildAiSystemPrompt(academyName) {
  return `Você é um assistente financeiro especializado em academias de artes marciais e fitness no Brasil.

Você receberá o cabeçalho real da planilha, uma linha de exemplo e todas as linhas de dados.
Primeiro identifique qual coluna corresponde a cada campo do JSON de saída; depois processe todas as linhas.

Academia: ${String(academyName || '').trim() || '(nome não informado)'}

=== PLANO DE CONTAS (array "accounts") ===
Mapeie as colunas da planilha para estes campos (nomes de coluna podem ser diferentes):

- code (obrigatório): código da conta contábil (ex.: "1.1.1", "3.2")
- name (obrigatório): nome ou descrição da conta (ex.: colunas "Nome", "Descrição", "Conta/Subconta")
- type: Ativo | Passivo | Patrimônio | Receita | Despesa | Custo (normalize variações em português/inglês)
- nature: Devedora | Credora (ex.: colunas "Natureza", "D/C" com D ou C)
- dreGrupo: um dos valores abaixo, ou string vazia "" se não aplicável
- dfcClasse: um dos valores abaixo, ou string vazia "" se não aplicável
- dfcSubclasse: texto livre ou ""
- cash: boolean true/false (ex.: coluna "Caixa" com Sim/Não; true se for conta de caixa)

Grupos DRE válidos para dreGrupo: 'Receita Bruta', 'Deduções', 'CMV/CPV', 'Despesas Operacionais', 'Resultado Financeiro', 'Imposto s/ Lucro'

Classes DFC válidas para dfcClasse: 'Operacional', 'Investimento', 'Financiamento', 'Caixa'

=== PLANOS DE PAGAMENTO (array "plans") ===
Campos: name, price (número), durationDays (padrão 30), description, applyCardFee (true/false)

=== CONTAS BANCÁRIAS (array "bankAccounts") ===
Campos: bankName, branch, account, accountName, pixKey

Responda APENAS com um objeto JSON puro. Sem texto antes ou depois.
Sem markdown. Sem explicações. Comece com { e termine com }.

Estrutura exata:
{
  "accounts": [
    {
      "code": "1.1.1",
      "name": "Caixa",
      "type": "Ativo",
      "nature": "Devedora",
      "dreGrupo": "",
      "dfcClasse": "Operacional",
      "dfcSubclasse": "",
      "cash": true
    }
  ],
  "plans": [],
  "bankAccounts": [],
  "summary": "frase resumindo o que foi encontrado"
}

Se uma categoria não tiver dados na planilha, retornar array vazio.
Não inventar dados — usar apenas o que estiver na planilha.`;
}

function extractJsonObject(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const clean = t.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const candidate = clean.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function buildParseErrorResponse() {
  return {
    error: IMPORT_PARSE_ERROR,
    hint: IMPORT_PARSE_HINT,
    accounts: [],
    plans: [],
    bankAccounts: [],
    summary: '',
  };
}

/**
 * Importação de configurações financeiras via parser determinístico ou IA.
 */
export default async function importFinanceHandler(req, res) {
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

  const { rows, academyName } = body || {};
  if (!rows?.length) {
    return res.status(400).json({ error: 'rows_required' });
  }

  const headerMap = buildHeaderMap(Object.keys(rows[0] || {}));
  if (isNaveNativeExport(headerMap)) {
    const native = parseNaveNativeAccounts(rows);
    if (native?.accounts?.length) {
      return res.status(200).json({
        accounts: native.accounts,
        plans: [],
        bankAccounts: [],
        summary: native.summary,
      });
    }
    return res.status(200).json({
      error: 'Nenhuma conta válida encontrada na planilha. Verifique se cada linha tem código e nome.',
      hint: IMPORT_PARSE_HINT,
      accounts: [],
      plans: [],
      bankAccounts: [],
      summary: '',
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'anthropic_not_configured' });
  }

  const sample = rows.slice(0, 200);
  const systemPrompt = buildAiSystemPrompt(academyName);
  const userContent = buildAiUserContent(rows, sample);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error?.message || data?.error || `anthropic_http_${response.status}`;
      console.error('[importFinanceHandler] Anthropic error:', msg);
      return res.status(502).json({ error: 'Erro ao consultar a IA. Tente novamente.' });
    }

    const rawText = data.content?.[0]?.text || '';
    const parsedRaw = extractJsonObject(rawText);
    if (!parsedRaw || typeof parsedRaw !== 'object') {
      console.error('[importFinanceHandler] Failed to parse AI JSON', {
        rowsSent: sample.length,
        rawTextLength: rawText.length,
        rawTextPreview: rawText.slice(0, 500),
        rawText,
      });
      return res.status(200).json(buildParseErrorResponse());
    }

    const out = {
      accounts: sanitizeAccounts(parsedRaw.accounts),
      plans: sanitizePlans(parsedRaw.plans),
      bankAccounts: sanitizeBankAccounts(parsedRaw.bankAccounts),
      summary: typeof parsedRaw.summary === 'string' ? parsedRaw.summary.trim() : '',
    };

    return res.status(200).json(out);
  } catch (err) {
    console.error('importFinanceHandler error:', err);
    return res.status(500).json({ error: 'Erro ao processar. Tente novamente.' });
  }
}

import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const DRE_GROUPS = new Set([
  'Receita Bruta',
  'Deduções',
  'CMV/CPV',
  'Despesas Operacionais',
  'Resultado Financeiro',
  'Imposto s/ Lucro',
]);

const DFC_CLASSES = new Set(['Operacional', 'Investimento', 'Financiamento', 'Caixa']);

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

/**
 * Importação de configurações financeiras via IA (mesmo padrão de auth que nlActionHandler).
 */
export default async function importFinanceHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'anthropic_not_configured' });
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

  const sample = rows.slice(0, 200);
  const rowsText = sample.map((r) => Object.values(r).join(' | ')).join('\n');

  const systemPrompt = `Você é um assistente financeiro especializado em
academias de artes marciais e fitness no Brasil.

Você receberá linhas de uma planilha financeira e deve interpretá-las
e classificá-las nas seguintes categorias do sistema Nave:

1. PLANO DE CONTAS (accounts): contas contábeis com código, nome,
   tipo (Ativo, Passivo, Patrimônio, Receita, Despesa, Custo), natureza
   (Devedora, Credora), grupo DRE e classe DFC.

   Grupos DRE válidos: 'Receita Bruta', 'Deduções', 'CMV/CPV',
   'Despesas Operacionais', 'Resultado Financeiro', 'Imposto s/ Lucro'
   (deixar vazio se não se encaixar)

   Classes DFC válidas: 'Operacional', 'Investimento', 'Financiamento', 'Caixa'
   (deixar vazio se não se encaixar)

2. PLANOS DE PAGAMENTO (plans): planos/mensalidades oferecidos
   pela academia. Campos: name, price (número), durationDays (padrão 30),
   description, applyCardFee (true/false).

3. CONTAS BANCÁRIAS (bankAccounts): contas bancárias da academia.
   Campos: bankName, branch, account, accountName, pixKey.

Academia: ${String(academyName || '').trim() || '(nome não informado)'}

Responda APENAS com JSON válido, sem texto adicional, sem markdown:
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
  "plans": [
    {
      "name": "Mensal",
      "price": 150,
      "durationDays": 30,
      "description": "",
      "applyCardFee": true
    }
  ],
  "bankAccounts": [
    {
      "bankName": "Sicoob",
      "branch": "0001",
      "account": "12345-6",
      "accountName": "Academia XPTO",
      "pixKey": ""
    }
  ],
  "summary": "frase resumindo o que foi encontrado na planilha"
}

Se uma categoria não tiver dados na planilha, retornar array vazio.
Não inventar dados — usar apenas o que estiver na planilha.`;

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
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Planilha (${sample.length} linhas):\n${rowsText}`,
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
      return res.status(200).json({
        error: 'Não consegui interpretar a planilha. Verifique o formato.',
        accounts: [],
        plans: [],
        bankAccounts: [],
        summary: '',
      });
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

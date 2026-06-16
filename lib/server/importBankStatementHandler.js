/**
 * IA: extrato bancário tabular ou PDF → items[] normalizados.
 */
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { assertAiModuleEnabled, sendAiFeatureDisabledError } from './aiFeaturePolicy.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_TIMEOUT_MS = 15_000;
const MAX_SAMPLE_ROWS = 200;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 500;

const BANK_STATEMENT_SYSTEM_PROMPT = `Você é um assistente de importação de extrato bancário para uma academia no Brasil.
Extraia TODAS as movimentações (créditos e débitos) do extrato.

Para cada movimentação retorne:
- date: data no formato YYYY-MM-DD
- description: histórico/descrição (máx. 512 chars)
- amount: valor absoluto positivo (número)
- direction: "credit" para entradas ou "debit" para saídas

IGNORE: saldo inicial, saldo final, totais, cabeçalhos, linhas sem valor.

Responda APENAS com JSON válido:
{
  "items": [
    { "date": "2026-01-15", "description": "PIX João Silva", "amount": 150.00, "direction": "credit" }
  ],
  "summary": "texto opcional",
  "warnings": ["avisos opcionais"]
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

function roundMoney(n) {
  return Math.round(Math.abs(Number(n) || 0) * 100) / 100;
}

function parseYmd(raw) {
  const s = String(raw || '').trim().slice(0, 10);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (br) {
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  }
  return null;
}

function normalizeDirection(raw, amountSigned) {
  const s = String(raw || '').trim().toLowerCase();
  if (['debit', 'debito', 'débito', 'saida', 'saída', 'out', 'd'].includes(s)) return 'debit';
  if (['credit', 'credito', 'crédito', 'entrada', 'in', 'c'].includes(s)) return 'credit';
  if (Number(amountSigned) < 0) return 'debit';
  return 'credit';
}

export function sanitizeBankStatementItems(rawItems) {
  const out = [];
  for (const raw of rawItems || []) {
    const date = parseYmd(raw?.date);
    let amount = roundMoney(raw?.amount);
    if (!date || amount < 0.01) continue;
    const direction = normalizeDirection(raw?.direction, raw?.signed_amount ?? raw?.amount);
    out.push({
      date,
      description: String(raw?.description || 'Movimentação').trim().slice(0, 512) || 'Movimentação',
      amount,
      direction,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function buildTabularUserContent(headers, sampleRows, filename) {
  const rows = (sampleRows || []).slice(0, MAX_SAMPLE_ROWS);
  return [
    `Arquivo: ${filename || 'extrato'}`,
    `Cabeçalhos: ${JSON.stringify(headers)}`,
    `Linhas (${rows.length}):`,
    JSON.stringify(rows),
    '',
    'Extraia todas as movimentações. Responda APENAS com JSON puro.',
  ].join('\n');
}

async function callAnthropic({ system, userContent, pdfBase64 = null }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  const userMessage = pdfBase64
    ? {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: userContent || 'Extraia todas as movimentações deste extrato bancário. Responda APENAS com JSON puro.',
          },
        ],
      }
    : { role: 'user', content: userContent };

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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        system,
        messages: [userMessage],
      }),
    });

    clearTimeout(timer);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error?.message || data?.error || `anthropic_http_${response.status}`;
      throw new Error(String(msg));
    }
    return data.content?.[0]?.text || '';
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/**
 * POST /api/agent?route=import-bank-statement
 */
export default async function importBankStatementHandler(req, res) {
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

  const mode = String(body?.mode || 'tabular').trim().toLowerCase();
  const filename = String(body?.filename || 'extrato').slice(0, 256);

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'anthropic_not_configured' });
  }

  try {
    assertAiModuleEnabled(access.doc);
  } catch (e) {
    if (sendAiFeatureDisabledError(res, e)) return;
    throw e;
  }

  try {
    let rawText = '';

    if (mode === 'pdf') {
      const b64 = String(body?.content_base64 || '').trim();
      if (!b64) return res.status(400).json({ error: 'content_base64_required' });
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > MAX_PDF_BYTES) {
        return res.status(422).json({
          error: 'Arquivo PDF muito grande.',
          hint: 'O limite é 5 MB. Exporte um período menor ou use Excel/CSV.',
        });
      }
      rawText = await callAnthropic({
        system: BANK_STATEMENT_SYSTEM_PROMPT,
        userContent: `Extraia as movimentações do extrato "${filename}".`,
        pdfBase64: b64,
      });
    } else {
      const headers = Array.isArray(body?.headers) ? body.headers.map((h) => String(h)) : [];
      const sampleRows = Array.isArray(body?.sample_rows) ? body.sample_rows : [];
      if (!headers.length && !sampleRows.length) {
        return res.status(400).json({ error: 'headers_or_rows_required' });
      }
      rawText = await callAnthropic({
        system: BANK_STATEMENT_SYSTEM_PROMPT,
        userContent: buildTabularUserContent(headers, sampleRows, filename),
      });
    }

    const parsed = extractJsonObject(rawText);
    if (!parsed || !Array.isArray(parsed.items)) {
      return res.status(422).json({
        error: 'Não consegui interpretar este extrato.',
        hint: 'Revise o arquivo ou tente exportar em CSV/OFX do internet banking.',
      });
    }

    const items = sanitizeBankStatementItems(parsed.items);
    if (!items.length) {
      return res.status(422).json({
        error: 'Nenhuma movimentação detectada.',
        hint: 'Verifique se o arquivo contém transações com data e valor.',
      });
    }

    return res.status(200).json({
      items,
      parse_method: 'ai',
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((w) => String(w)) : [],
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      return res.status(504).json({
        error: 'A interpretação demorou demais.',
        hint: 'Tente um arquivo menor ou exporte em CSV.',
      });
    }
    console.error('[importBankStatementHandler]', err);
    return res.status(502).json({
      error: 'Erro ao consultar a IA. Tente novamente.',
      hint: String(err?.message || '').slice(0, 200),
    });
  }
}

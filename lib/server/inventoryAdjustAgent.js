/**
 * Assistente de ajuste de estoque em linguagem natural (recepcionistas).
 * Integrado via agentRespond (mode=inventory_adjust) e nl-action (adjust_stock).
 */
import { apiErro, logApiError } from './friendlyError.js';

import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { executeInventoryAdjustment } from './inventoryMoveHandler.js';
import { matchStockProduct } from '../nlStockMatch.js';
import {
  ADJUSTMENT_SUBTYPE_LABELS,
  ADJUSTMENT_SUBTYPE_SHORT,
  isAdjustmentSubtype,
  isInventoryAdjustConfirmText,
  normalizeAdjustmentSubtype,
} from '../../src/lib/inventoryAdjust.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const STOCK_ITEMS_COL =
  process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '';
const STOCK_MOVES_COL = process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';

function extractJsonObject(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const firstBrace = t.indexOf('{');
  const lastBrace = t.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(t.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function buildConfirmMessage({ variantLabel, quantityChange, subtype }) {
  const subLabel = ADJUSTMENT_SUBTYPE_SHORT[subtype] || subtype;
  const abs = Math.abs(Number(quantityChange) || 0);
  const dir =
    Number(quantityChange) < 0
      ? `reduzir ${abs} unidade${abs === 1 ? '' : 's'}`
      : `aumentar ${abs} unidade${abs === 1 ? '' : 's'}`;
  return `Entendi que você quer ${dir} de **${variantLabel}** por **${subLabel.toLowerCase()}**. Confirma?`;
}

function buildDoneMessage(before, after) {
  return `Feito! Saldo atualizado de ${before} para ${after} unidades.`;
}

async function parseAdjustIntent(text, stockProducts) {
  const lines = (stockProducts || [])
    .slice(0, 80)
    .map((p) => `- id: ${p.id} — ${p.display_label} — saldo: ${p.current_quantity}`)
    .join('\n');

  const system = `Você interpreta pedidos de AJUSTE de estoque (perda, furto, doação, correção de contagem) em português.
Produtos disponíveis:
${lines || '(lista vazia)'}

Subtipos válidos: avaria | furto | doacao | erro_conta

Exemplos:
- "quebramos 2 bonés" → variant match boné, quantity_change: -2, subtype: avaria
- "sumiu uma camisa G" → match camisa G, quantity_change: -1, subtype: furto
- "tinha 3 bermudas mas só encontrei 2" → quantity_change: -1, subtype: erro_conta
- "ajusta o estoque da camisa M pra 5" → se saldo atual 3, quantity_change: +2; se saldo 7, quantity_change: -2

Responda SOMENTE JSON:
{
  "intent": "adjust_stock" | null,
  "variant_id": "id exato ou null",
  "product_query": "texto para busca se id incerto",
  "variation": "tamanho/cor",
  "quantity_change": número inteiro (+/-),
  "target_quantity": número ou null (quando pedir saldo final),
  "subtype": "avaria|furto|doacao|erro_conta",
  "note": "observação curta ou null",
  "variant_label": "rótulo amigável para confirmação",
  "error": "se não entender"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system,
      messages: [{ role: 'user', content: String(text || '').trim() }],
    }),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error('Falha ao interpretar o pedido');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Resposta inválida do modelo');
  }
  const parsed = extractJsonObject(data.content?.[0]?.text || '');
  return parsed;
}

export function enrichAdjustStockFromNl(parsed, stockProducts) {
  const d = parsed.data || {};
  let variantId = String(d.variant_id || d.stock_item_id || '').trim();
  let variantLabel = String(d.variant_label || '').trim();

  if (!variantId) {
    const match = matchStockProduct(
      String(d.product_query || d.product_name || '').trim(),
      String(d.variation || '').trim(),
      stockProducts || []
    );
    if (match?.product) {
      variantId = match.product.id;
      variantLabel = match.product.display_label;
    }
  }

  if (!variantLabel && variantId) {
    const row = (stockProducts || []).find((p) => String(p.id) === variantId);
    if (row) variantLabel = row.display_label;
  }

  let qtyChange = Number(d.quantity_change);
  if (!Number.isFinite(qtyChange) && d.target_quantity != null) {
    const row = (stockProducts || []).find((p) => String(p.id) === variantId);
    const current = Number(row?.current_quantity ?? 0);
    const target = Math.trunc(Number(d.target_quantity));
    if (Number.isFinite(target)) qtyChange = target - current;
  }

  const subtype = normalizeAdjustmentSubtype(d.subtype) || 'avaria';

  return {
    ...parsed,
    data: {
      ...d,
      variant_id: variantId,
      variant_label: variantLabel,
      quantity_change: qtyChange,
      subtype,
      note: d.note != null ? String(d.note).trim() : '',
    },
  };
}

export function buildAdjustStockSummary(data) {
  const label = data.variant_label || 'variante';
  const sub = ADJUSTMENT_SUBTYPE_SHORT[data.subtype] || data.subtype;
  const ch = Number(data.quantity_change);
  if (!Number.isFinite(ch) || ch === 0) return `Ajustar estoque de ${label}`;
  const abs = Math.abs(ch);
  const verb = ch < 0 ? `Remover ${abs}` : `Adicionar ${abs}`;
  return `${verb} un. de ${label} (${sub})`;
}

/**
 * POST body: { message, stockProducts?, pending_confirm? }
 * Resposta: { resposta, pending_confirm?, executed?, quantity_before?, quantity_after? }
 */
export async function handleInventoryAdjustAgent(req, res, databases) {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ sucesso: false, erro: 'ANTHROPIC_API_KEY não configurado' });
  }
  if (!STOCK_MOVES_COL || !STOCK_ITEMS_COL || !DB_ID) {
    return res.status(503).json({ sucesso: false, erro: 'Estoque não configurado' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const message = String(body.message || body.text || '').trim();
  const stockProducts = Array.isArray(body.stockProducts) ? body.stockProducts : [];
  const pending = body.pending_confirm && typeof body.pending_confirm === 'object' ? body.pending_confirm : null;
  const actorName = String(body.actor_name || me.name || me.email || 'Usuário').trim();

  if (!message) {
    return res.status(400).json({ sucesso: false, erro: 'message_required' });
  }

  try {
    if (pending && isInventoryAdjustConfirmText(message)) {
      const variantId = String(pending.variant_id || '').trim();
      const subtype = normalizeAdjustmentSubtype(pending.subtype);
      const quantityChange = Number(pending.quantity_change);
      if (!variantId || !subtype || !Number.isFinite(quantityChange) || quantityChange === 0) {
        return res.status(400).json({ sucesso: false, erro: 'pending_confirm_invalid' });
      }

      const out = await executeInventoryAdjustment(databases, {
        dbId: DB_ID,
        stockItemsCol: STOCK_ITEMS_COL,
        stockMovesCol: STOCK_MOVES_COL,
        variantId,
        quantityChange,
        subtype,
        note: pending.note || '',
        actorUserId: me.$id,
        actorName,
        academy_id: academyId,
      });

      if (!out.ok) {
        return res.status(out.status || 400).json({ sucesso: false, erro: out.error });
      }

      return res.status(200).json({
        sucesso: true,
        executed: true,
        resposta: buildDoneMessage(out.quantity_before, out.quantity_after),
        quantity_before: out.quantity_before,
        quantity_after: out.quantity_after,
        variant_label: out.variant_label,
      });
    }

    const parsed = await parseAdjustIntent(message, stockProducts);
    if (!parsed || parsed.intent !== 'adjust_stock') {
      return res.status(200).json({
        sucesso: true,
        resposta: parsed?.error || 'Não entendi como ajuste de estoque. Tente: "quebramos 2 bonés" ou "ajusta camisa M para 5 unidades".',
        intent: null,
      });
    }

    let variantId = String(parsed.variant_id || '').trim();
    let variantLabel = String(parsed.variant_label || '').trim();
    if (!variantId) {
      const match = matchStockProduct(
        String(parsed.product_query || '').trim(),
        String(parsed.variation || '').trim(),
        stockProducts
      );
      if (match?.product) {
        variantId = match.product.id;
        variantLabel = match.product.display_label;
      } else if (match?.suggestions?.length) {
        return res.status(200).json({
          sucesso: true,
          resposta: `Qual produto? ${match.suggestions.map((s) => s.display_label).join('; ')}`,
          intent: null,
        });
      }
    }

    if (!variantId) {
      return res.status(200).json({
        sucesso: true,
        resposta: 'Não encontrei o produto no estoque. Informe o nome e o tamanho.',
        intent: null,
      });
    }

    const row = stockProducts.find((p) => String(p.id) === variantId);
    let quantityChange = Number(parsed.quantity_change);
    if (!Number.isFinite(quantityChange) && parsed.target_quantity != null && row) {
      quantityChange = Math.trunc(Number(parsed.target_quantity)) - Number(row.current_quantity || 0);
    }
    if (!Number.isFinite(quantityChange) || quantityChange === 0) {
      return res.status(200).json({
        sucesso: true,
        resposta: 'Informe quantas unidades a mais ou a menos (ex.: "perdemos 2" ou "ajustar para 5 unidades").',
        intent: null,
      });
    }

    const subtype = normalizeAdjustmentSubtype(parsed.subtype) || 'avaria';
    if (!variantLabel && row) variantLabel = row.display_label;
    if (!variantLabel) variantLabel = 'Produto';

    const pending_confirm = {
      variant_id: variantId,
      variant_label: variantLabel,
      quantity_change: quantityChange,
      subtype,
      note: String(parsed.note || '').trim(),
    };

    const confirmText = buildConfirmMessage(pending_confirm).replace(/\*\*/g, '');

    return res.status(200).json({
      sucesso: true,
      resposta: confirmText,
      intent: 'adjust_stock',
      pending_confirm,
    });
  } catch (e) {
    console.error('[inventoryAdjustAgent]', e?.message || e);
    return res.status(500).json({ sucesso: false, erro: apiErro(e, 'action') });
  }
}

export default handleInventoryAdjustAgent;

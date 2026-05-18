import { mapStockProductDoc } from '../../src/lib/stockProducts.js';

export { mapStockProductDoc };

/** Campos de outras coleções — nunca enviar em STOCK_ITEMS. */
export const FORBIDDEN_STOCK_ITEM_KEYS = [
  'item_estoque_id',
  'venda_id',
  'quantidade',
  'preco_unitario',
  'referencia_id',
  'tipo',
  'motivo',
  'usuario_id',
  'purchase_price',
  'action',
  'id',
];

export function stripForeignStockItemKeys(body) {
  const src = body && typeof body === 'object' ? body : {};
  const out = { ...src };
  for (const key of FORBIDDEN_STOCK_ITEM_KEYS) {
    delete out[key];
  }
  return out;
}

/** Atributos permitidos no documento STOCK_ITEMS (nunca SALE_ITEMS / STOCK_MOVES). */
export const STOCK_ITEM_DOCUMENT_KEYS = [
  'nome',
  'categoria',
  'descricao',
  'Tamanho',
  'sale_price',
  'cost_price',
  'is_for_sale',
  'is_active',
  'image_url',
  'sku',
  'unit',
  'minimum_level',
  'notes',
  'last_updated',
  'current_quantity',
  'academy_id',
];

export function sanitizeStockItemDocument(data) {
  const src = data && typeof data === 'object' ? data : {};
  const out = {};
  for (const key of STOCK_ITEM_DOCUMENT_KEYS) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  return out;
}

function parseOptionalPrice(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function buildProductPayloadFromBody(body, { isCreate }) {
  const clean = stripForeignStockItemKeys(body);
  const nome = String(clean.nome || '').trim().slice(0, 128);
  const categoria = String(clean.categoria || '').trim().slice(0, 64);
  if (!nome) return { error: 'nome obrigatório' };
  if (!categoria) return { error: 'categoria obrigatória' };

  const payload = {
    nome,
    categoria,
    descricao: String(clean.descricao || '').trim().slice(0, 512),
    Tamanho: String(clean.Tamanho ?? clean.tamanho ?? '').trim().slice(0, 16),
    sale_price: parseOptionalPrice(clean.sale_price),
    cost_price: parseOptionalPrice(clean.cost_price),
    is_for_sale: clean.is_for_sale !== false,
    is_active: clean.is_active !== false,
    image_url: String(clean.image_url || '').trim().slice(0, 512),
    sku: String(clean.sku || '').trim().slice(0, 64),
    unit: String(clean.unit || 'unidade').trim().slice(0, 32) || 'unidade',
    minimum_level: Math.max(0, Math.trunc(Number(clean.minimum_level) || 0)),
    notes: String(clean.notes || '').trim().slice(0, 2048),
    last_updated: new Date().toISOString(),
  };

  if (isCreate) {
    const initialQty = Math.max(0, Math.trunc(Number(clean.initial_quantity ?? clean.current_quantity) || 0));
    payload.current_quantity = 0;
    // DEPRECATED: quantidade_* — não escrever; saldo via current_quantity + movimentações
    return { payload: sanitizeStockItemDocument(payload), initial_quantity: initialQty };
  }

  return { payload: sanitizeStockItemDocument(payload) };
}

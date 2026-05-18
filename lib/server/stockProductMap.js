import { mapStockProductDoc } from '../../src/lib/stockProducts.js';

export { mapStockProductDoc };

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
  const nome = String(body.nome || '').trim().slice(0, 128);
  const categoria = String(body.categoria || '').trim().slice(0, 64);
  if (!nome) return { error: 'nome obrigatório' };
  if (!categoria) return { error: 'categoria obrigatória' };

  const payload = {
    nome,
    categoria,
    descricao: String(body.descricao || '').trim().slice(0, 512),
    Tamanho: String(body.Tamanho ?? body.tamanho ?? '').trim().slice(0, 16),
    sale_price: parseOptionalPrice(body.sale_price),
    cost_price: parseOptionalPrice(body.cost_price),
    is_for_sale: body.is_for_sale !== false,
    is_active: body.is_active !== false,
    image_url: String(body.image_url || '').trim().slice(0, 512),
    sku: String(body.sku || '').trim().slice(0, 64),
    unit: String(body.unit || 'unidade').trim().slice(0, 32) || 'unidade',
    minimum_level: Math.max(0, Math.trunc(Number(body.minimum_level) || 0)),
    notes: String(body.notes || '').trim().slice(0, 2048),
    last_updated: new Date().toISOString(),
  };

  if (isCreate) {
    const initialQty = Math.max(0, Math.trunc(Number(body.initial_quantity ?? body.current_quantity) || 0));
    payload.current_quantity = 0;
    // DEPRECATED: quantidade_* — não escrever; saldo via current_quantity + movimentações
    return { payload: sanitizeStockItemDocument(payload), initial_quantity: initialQty };
  }

  return { payload: sanitizeStockItemDocument(payload) };
}

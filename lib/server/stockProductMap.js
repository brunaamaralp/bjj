import { mapStockProductDoc } from '../../src/lib/stockProducts.js';

export { mapStockProductDoc };

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
    payload.quantidade_total = 0;
    payload.quantidade_vendida = 0;
    payload.quantidade_alugada = 0;
    return { payload, initial_quantity: initialQty };
  }

  return { payload };
}

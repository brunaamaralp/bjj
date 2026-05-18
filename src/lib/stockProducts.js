import { computeStockStatus, itemCategory, itemDisplayName, resolveCurrentQuantity } from './stockInventory.js';

export const PRODUCT_UNIT_OPTIONS = [
  { value: 'unidade', label: 'Unidade' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'kg', label: 'Kg' },
  { value: 'litro', label: 'Litro' },
  { value: 'outro', label: 'Outro' },
];

/** Opções predefinidas para o campo sku (UI: Código / Referência). */
export const PRODUCT_SKU_PRESETS = [
  'PP',
  'P',
  'M',
  'G',
  'GG',
  'XGG',
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'Único',
];

export const PRODUCT_SKU_OTHER = '__other__';

export function parseSkuFormFields(sku) {
  const v = String(sku || '').trim();
  if (!v) return { skuSelect: '', skuOther: '' };
  if (PRODUCT_SKU_PRESETS.includes(v)) return { skuSelect: v, skuOther: '' };
  return { skuSelect: PRODUCT_SKU_OTHER, skuOther: v };
}

export function resolveSkuFromForm(skuSelect, skuOther) {
  if (skuSelect === PRODUCT_SKU_OTHER) return String(skuOther || '').trim().slice(0, 64);
  return String(skuSelect || '').trim().slice(0, 64);
}

const PRODUCT_API_KEYS = [
  'nome',
  'categoria',
  'Tamanho',
  'descricao',
  'sale_price',
  'cost_price',
  'is_for_sale',
  'is_active',
  'minimum_level',
  'unit',
  'sku',
  'image_url',
  'notes',
  'initial_quantity',
  'item_id',
];

const PRODUCT_API_FORBIDDEN = [
  'item_estoque_id',
  'venda_id',
  'quantidade',
  'preco_unitario',
  'action',
  'academy_id',
];

/** Remove campos de outras coleções (ex.: item_estoque_id de SALE_ITEMS). */
export function pickProductApiBody(payload, { isEdit = false } = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const out = {};
  for (const key of PRODUCT_API_KEYS) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  for (const key of PRODUCT_API_FORBIDDEN) {
    delete out[key];
  }
  if (!isEdit) delete out.item_id;
  return out;
}

export function productDisplayLabel(doc) {
  const nome = itemDisplayName(doc);
  const tam = String(doc?.Tamanho ?? doc?.tamanho ?? '').trim();
  return tam ? `${nome} · ${tam}` : nome;
}

export function mapStockProductDoc(doc) {
  const qty = resolveCurrentQuantity(doc);
  const min = Math.max(0, Number(doc.minimum_level || 0));
  const isActive = doc.is_active !== false;
  const isForSale = doc.is_for_sale !== false;
  const salePrice = doc.sale_price != null && doc.sale_price !== '' ? Number(doc.sale_price) : null;
  const costPrice = doc.cost_price != null && doc.cost_price !== '' ? Number(doc.cost_price) : null;

  let lifecycle = 'ativo';
  if (!isActive) lifecycle = 'inativo';
  else if (qty === 0) lifecycle = 'sem_estoque';

  return {
    id: doc.$id,
    nome: String(doc.nome || doc.name || '').trim(),
    descricao: String(doc.descricao || doc.description || '').trim(),
    categoria: itemCategory(doc),
    Tamanho: String(doc.Tamanho ?? doc.tamanho ?? '').trim(),
    display_label: productDisplayLabel(doc),
    sale_price: Number.isFinite(salePrice) ? salePrice : null,
    cost_price: Number.isFinite(costPrice) ? costPrice : null,
    is_for_sale: isForSale,
    is_active: isActive,
    image_url: String(doc.image_url || '').trim(),
    sku: String(doc.sku || '').trim(),
    unit: String(doc.unit || 'unidade').trim() || 'unidade',
    current_quantity: qty,
    minimum_level: min,
    status: computeStockStatus(qty, min),
    lifecycle,
    notes: String(doc.notes || '').trim(),
    last_updated: doc.last_updated || doc.$updatedAt || '',
    last_checked: doc.last_checked || '',
  };
}

export function filterProductsClient(items, { search, category, statusFilter, typeFilter }) {
  const q = String(search || '').trim().toLowerCase();
  return (items || []).filter((p) => {
    if (category && category !== 'all' && String(p.categoria) !== category) return false;
    if (typeFilter === 'for_sale' && !p.is_for_sale) return false;
    if (typeFilter === 'internal' && p.is_for_sale) return false;
    if (statusFilter === 'ativo' && p.lifecycle !== 'ativo') return false;
    if (statusFilter === 'inativo' && p.lifecycle !== 'inativo') return false;
    if (statusFilter === 'sem_estoque' && p.lifecycle !== 'sem_estoque') return false;
    if (q) {
      const hay = `${p.nome} ${p.categoria} ${p.Tamanho} ${p.sku} ${p.descricao}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

import { computeStockStatus, itemCategory, itemDisplayName, resolveCurrentQuantity } from './stockInventory.js';

export const PRODUCT_UNIT_OPTIONS = [
  { value: 'unidade', label: 'Unidade' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'kg', label: 'Kg' },
  { value: 'litro', label: 'Litro' },
  { value: 'outro', label: 'Outro' },
];

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

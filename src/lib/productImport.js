/** Utilitários para importação em lote de produtos via CSV. */

import { applyLojaImportRowDefaults } from './lojaProductScope.js';

export const MAX_IMPORT_ROWS = 500;

export const IMPORT_FIELD_OPTIONS = [
  { value: '', label: 'Ignorar' },
  { value: 'nome', label: 'Nome' },
  { value: 'categoria', label: 'Categoria' },
  { value: 'Tamanho', label: 'Tamanho' },
  { value: 'color', label: 'Cor' },
  { value: 'descricao', label: 'Descrição' },
  { value: 'sale_price', label: 'Preço de venda' },
  { value: 'cost_price', label: 'Preço de custo' },
  { value: 'initial_quantity', label: 'Qtd. inicial' },
  { value: 'minimum_level', label: 'Nível mínimo' },
  { value: 'unit', label: 'Unidade' },
  { value: 'sku', label: 'Código / SKU' },
  { value: 'is_for_sale', label: 'Para venda (sim/não)' },
];

const FIELD_LABEL = Object.fromEntries(
  IMPORT_FIELD_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

export function fieldLabel(field) {
  return FIELD_LABEL[field] || field;
}

/** Inverte mapping campo→coluna para coluna→campo. */
export function columnMappingFromAi(aiMapping, headers) {
  const out = {};
  for (const col of headers) out[col] = '';
  if (!aiMapping || typeof aiMapping !== 'object') return out;

  for (const [field, colName] of Object.entries(aiMapping)) {
    if (field === 'unmapped' || colName == null || colName === '') continue;
    const col = String(colName).trim();
    if (out[col] !== undefined) out[col] = field;
  }
  return out;
}

/** Confiança por coluna CSV a partir do mapping IA campo→coluna. */
export function columnConfidenceFromAi(confidence, aiMapping, headers) {
  const out = {};
  for (const col of headers) out[col] = 'unmapped';
  if (!confidence || !aiMapping) return out;

  for (const [field, colName] of Object.entries(aiMapping)) {
    if (field === 'unmapped' || !colName) continue;
    const col = String(colName).trim();
    if (headers.includes(col) && confidence[field]) {
      out[col] = confidence[field];
    }
  }
  for (const col of aiMapping.unmapped || []) {
    if (headers.includes(col)) out[col] = 'unmapped';
  }
  return out;
}

export function parseNumberCell(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let t = s.replace(/[R$\s]/gi, '');
  if (t.includes(',') && t.includes('.')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (t.includes(',')) {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseIntCell(raw) {
  const n = parseNumberCell(raw);
  if (n == null) return null;
  return Math.trunc(n);
}

export function parseBoolCell(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!s) return null;
  if (['sim', 's', 'yes', 'y', 'true', '1', 'venda', 'para venda'].includes(s)) return true;
  if (['nao', 'não', 'n', 'no', 'false', '0', 'insumo', 'interno'].includes(s)) return false;
  return null;
}

export function rowToProduct(rawRow, columnToField) {
  const product = {
    nome: '',
    categoria: '',
    Tamanho: '',
    color: '',
    descricao: '',
    sale_price: null,
    cost_price: null,
    initial_quantity: 0,
    minimum_level: 3,
    unit: 'unidade',
    sku: '',
    is_for_sale: true,
    is_active: true,
  };

  for (const [col, field] of Object.entries(columnToField)) {
    if (!field) continue;
    const val = rawRow[col];
    switch (field) {
      case 'nome':
      case 'categoria':
      case 'Tamanho':
      case 'color':
      case 'descricao':
      case 'unit':
      case 'sku':
        product[field] = String(val ?? '').trim();
        break;
      case 'sale_price':
      case 'cost_price': {
        const n = parseNumberCell(val);
        product[field] = n;
        break;
      }
      case 'initial_quantity':
      case 'minimum_level': {
        const n = parseIntCell(val);
        if (n != null) product[field] = Math.max(0, n);
        break;
      }
      case 'is_for_sale': {
        const b = parseBoolCell(val);
        if (b != null) product.is_for_sale = b;
        break;
      }
      default:
        break;
    }
  }

  return product;
}

/** @returns {'ready'|'incomplete'|'invalid'} */
export function classifyImportRow(product, { defaultProductType } = {}) {
  const nome = String(product.nome || '').trim();
  if (!nome) return 'invalid';

  const price =
    defaultProductType === 'rental'
      ? product.rental_price ?? product.sale_price
      : product.sale_price;
  const hasPrice = price != null && Number.isFinite(Number(price)) && Number(price) > 0;

  if (!hasPrice) return 'incomplete';
  return 'ready';
}

/** Chave estável para detectar duplicatas (CSV ou catálogo existente). */
export function importProductDedupKey(product) {
  const sku = String(product?.sku || '').trim().toLowerCase();
  if (sku) return `sku:${sku}`;
  const nome = String(product?.nome || product?.name || '').trim().toLowerCase();
  const tam = String(product?.Tamanho ?? product?.tamanho ?? '').trim().toLowerCase();
  const color = String(product?.color ?? product?.cor ?? '').trim().toLowerCase();
  return `nome:${nome}|tam:${tam}|color:${color}`;
}

/** Remove linhas repetidas no CSV (mantém a primeira). */
export function dedupeImportPreviewRows(rows) {
  const seen = new Set();
  return rows.map((row) => {
    const key = importProductDedupKey(row.data);
    if (!key || key === 'nome:|tam:|color:') return row;
    if (seen.has(key)) {
      return {
        ...row,
        status: 'invalid',
        selected: false,
        duplicateInFile: true,
        statusNote: 'Duplicado no arquivo (mesma combinação nome/tamanho/cor ou SKU)',
      };
    }
    seen.add(key);
    return row;
  });
}

export function buildImportPreviewRows(dataRows, columnToField, { defaultProductType } = {}) {
  const rows = dataRows.map((raw, index) => {
    let data = rowToProduct(raw, columnToField);
    if (defaultProductType) {
      data = applyLojaImportRowDefaults(data, defaultProductType);
    }
    const status = classifyImportRow(data, { defaultProductType });
    return {
      id: `row-${index}`,
      raw,
      data,
      status,
      selected: status === 'ready',
      editing: false,
    };
  });
  return dedupeImportPreviewRows(rows);
}

export function countByStatus(rows) {
  return rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { ready: 0, incomplete: 0, invalid: 0 }
  );
}

/** Agrupa linhas de importação pelo nome do produto (mesmo nome = mesmo pai). */
export function groupImportRowsByProductName(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const nome = String(row?.nome || row?.name || '').trim();
    if (!nome) continue;
    const key = nome.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.values());
}

/** Converte linhas agrupadas (mesmo nome) em body para createProductWithVariants. */
export function buildParentCreateBodyFromImportRows(rows, { defaultProductType } = {}) {
  const first = rows[0] || {};
  const nome = String(first.nome || first.name || '').trim();

  let type = defaultProductType || (first.is_for_sale === false ? 'supply' : 'sale');
  if (first.type) type = first.type;

  const variants = [];
  const seen = new Set();
  for (const r of rows || []) {
    const size = String(r.Tamanho ?? r.tamanho ?? '').trim() || 'Único';
    const color = String(r.color ?? r.cor ?? '').trim();
    const key = `${size.toLowerCase()}\0${color.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const initQty = Math.max(0, Math.trunc(Number(r.initial_quantity) || 0));
    const variant = {
      size,
      color,
      sku: String(r.sku ?? '').trim(),
      initial_quantity: initQty,
      minimum_level: Math.max(0, Math.trunc(Number(r.minimum_level) || 0)),
    };
    if (type === 'rental') {
      variant.initial_rental_quantity = initQty;
      variant.initial_sale_quantity = 0;
      variant.initial_quantity = 0;
    }
    variants.push(variant);
  }

  const salePrice = first.sale_price;
  const rentalPrice = first.rental_price ?? (type === 'rental' ? salePrice : null);

  return {
    name: nome,
    nome,
    description: String(first.descricao || '').trim(),
    descricao: String(first.descricao || '').trim(),
    category: String(first.categoria || 'Sem categoria').trim() || 'Sem categoria',
    categoria: String(first.categoria || 'Sem categoria').trim() || 'Sem categoria',
    sale_price: type === 'rental' ? null : salePrice,
    cost_price: first.cost_price,
    rental_price: rentalPrice,
    type,
    is_for_sale: type !== 'supply',
    is_active: first.is_active !== false,
    image_url: String(first.image_url || '').trim(),
    unit: String(first.unit || 'unidade').trim() || 'unidade',
    variants,
  };
}

/** Uma linha CSV → body de create com uma variante (modo parent_variant, upsert por nome). */
export function importRowToSingleCreateBody(row) {
  return buildParentCreateBodyFromImportRows([row]);
}

/** Utilitários para importação em lote de produtos via CSV. */

export const MAX_IMPORT_ROWS = 500;

export const IMPORT_FIELD_OPTIONS = [
  { value: '', label: 'Ignorar' },
  { value: 'nome', label: 'Nome' },
  { value: 'categoria', label: 'Categoria' },
  { value: 'Tamanho', label: 'Tamanho' },
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
export function classifyImportRow(product) {
  const nome = String(product.nome || '').trim();
  if (!nome) return 'invalid';

  const price = product.sale_price;
  const categoria = String(product.categoria || '').trim();
  const hasPrice = price != null && Number.isFinite(Number(price)) && Number(price) > 0;
  const hasCategory = Boolean(categoria);

  if (!hasPrice || !hasCategory) return 'incomplete';
  return 'ready';
}

export function buildImportPreviewRows(dataRows, columnToField) {
  return dataRows.map((raw, index) => {
    const data = rowToProduct(raw, columnToField);
    const status = classifyImportRow(data);
    return {
      id: `row-${index}`,
      raw,
      data,
      status,
      selected: status === 'ready',
      editing: false,
    };
  });
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

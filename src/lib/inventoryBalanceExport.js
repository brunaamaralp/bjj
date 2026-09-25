import { downloadCsv } from './reportsExport.js';
import { STOCK_STATUS_LABELS } from './stockInventory.js';
import { variantSizeLabel } from './inventoryCatalogMerge.js';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @param {Date} [date] */
export function inventoryBalanceFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `inventario-saldo-${y}-${m}-${d}.csv`;
}

/**
 * Flatten parents filtrados → 1 linha CSV por variante.
 * @param {object[]} parents
 */
export function inventoryParentsToCsvRows(parents) {
  const rows = [];
  for (const parent of parents || []) {
    const produto = String(parent?.nome || '').trim();
    const categoria = String(parent?.categoria || '').trim();
    const variants = Array.isArray(parent?.variants) ? parent.variants : [];
    for (const v of variants) {
      if (!v) continue;
      const minRaw = Number(v.minimum_level);
      const statusKey = String(v.status || '').trim();
      rows.push({
        produto,
        variante: variantSizeLabel(v),
        categoria,
        quantidade: Number(v.current_quantity) || 0,
        minimo: Number.isFinite(minRaw) && minRaw > 0 ? minRaw : '',
        status: STOCK_STATUS_LABELS[statusKey] || statusKey || '',
        unidade: String(v.unit || 'unidade').trim() || 'unidade',
      });
    }
  }
  return rows;
}

/**
 * Exporta saldo do inventário (lista filtrada da tela).
 * @param {object[]} filteredParents
 * @param {{ date?: Date }} [opts]
 */
export function exportInventoryBalanceCsv(filteredParents, opts = {}) {
  const rows = inventoryParentsToCsvRows(filteredParents);
  const filename = inventoryBalanceFilename(opts.date);
  if (!rows.length) {
    downloadCsv(
      [{ mensagem: 'Nenhum item no inventário com os filtros atuais' }],
      filename.replace(/\.csv$/, '-vazio.csv')
    );
    return;
  }
  downloadCsv(rows, filename);
}

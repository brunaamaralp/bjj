import { fetchInventoryMovements } from './inventoryMovementsApi.js';
import { downloadCsv } from './reportsExport.js';
import { formatSaleIdShort } from './salesHistory.js';

function formatMoveDateForExport(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function productSizeLabelForExport(row) {
  const parts = [row.product_name];
  const v = [row.variant_size, row.variant_color].filter(Boolean).join(' / ');
  if (v && v !== 'Único') parts.push(v);
  return parts.filter(Boolean).join(' · ') || '';
}

/** Busca todas as páginas de movimentações no período (respeita filtros ativos). */
export async function fetchAllInventoryMovementsInPeriod({
  from,
  to,
  academyId,
  product_id,
  movement_kind,
  usuario_id,
  cliente_q,
  onProgress,
}) {
  const all = [];
  let cursor = null;
  let page = 0;
  for (;;) {
    page += 1;
    const body = await fetchInventoryMovements({
      from,
      to,
      academyId,
      product_id,
      movement_kind,
      usuario_id,
      cliente_q,
      limit: 200,
      cursor,
    });
    const items = body.movements || [];
    all.push(...items);
    onProgress?.(all.length, body.totals?.registros);
    if (!body.pagination?.has_more || !body.pagination?.next_cursor) break;
    cursor = body.pagination.next_cursor;
    if (page > 100) break;
  }
  return all;
}

export function inventoryMovementToCsvRow(row) {
  return {
    data: formatMoveDateForExport(row.date),
    produto: productSizeLabelForExport(row),
    tipo: row.movement_kind_label || row.movement_kind,
    quantidade: row.quantidade,
    saldo_antes: row.quantity_before ?? '',
    saldo_depois: row.quantity_after ?? '',
    caixa: row.financial_tx_id || '',
    observacao: row.notes || '',
    cliente: row.cliente_nome,
    operador: row.operador_nome,
    valor_unitario: row.unit_price ?? '',
    total_linha: row.line_total ?? '',
    status_pagamento: row.payment_status_label || row.payment_status_at_move || '',
    venda: row.sale_id ? formatSaleIdShort(row.sale_id) : '',
  };
}

export function exportInventoryMovementsCsv(rows, { from = '', to = '' } = {}) {
  const slug = [from, to].filter(Boolean).join('_') || 'periodo';
  if (!rows.length) {
    downloadCsv([{ mensagem: 'Nenhuma movimentação no período com os filtros atuais' }], `movimentacoes-estoque-${slug}-vazio.csv`);
    return;
  }
  downloadCsv(rows.map(inventoryMovementToCsvRow), `movimentacoes-estoque-${slug}.csv`);
}

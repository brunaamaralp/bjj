/**
 * Exportação do Histórico de vendas (CSV no cliente; helpers compartilhados com PDF).
 */
import { downloadCsv } from './reportsExport.js';
import { channelLabel } from './salesSettings.js';
import {
  computeHistoryTotals,
  filterSalesList,
  formatDateTimeBr,
  formatSaleIdShort,
  saleStatusLabel,
} from './salesHistory.js';
import { formatBRL } from './moneyBr.js';

export const HISTORY_EXPORT_MAX_PAGES = 20;
export const HISTORY_EXPORT_PAGE_SIZE = 100;

/**
 * Pagina o histórico até esgotar ou atingir o cap.
 * @param {(args: { from: string, to: string, limit: number, cursor?: string|null }) => Promise<{ sales: object[], next_cursor?: string|null, has_more?: boolean }>} fetchPage
 */
export async function fetchAllSalesForPeriod(
  fetchPage,
  { from, to, pageLimit = HISTORY_EXPORT_PAGE_SIZE, maxPages = HISTORY_EXPORT_MAX_PAGES } = {}
) {
  const all = [];
  let cursor = null;
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    const body = await fetchPage({
      from,
      to,
      limit: pageLimit,
      cursor: cursor || undefined,
    });
    const list = body?.sales || [];
    all.push(...list);
    if (!body?.has_more || !body?.next_cursor) break;
    cursor = body.next_cursor;
    if (page === maxPages - 1 && body.has_more) truncated = true;
  }

  return { sales: all, truncated };
}

export function historyExportFilename(from, to, ext = 'csv') {
  const a = String(from || '').slice(0, 10) || 'inicio';
  const b = String(to || '').slice(0, 10) || 'fim';
  return `historico-vendas-${a}_${b}.${ext}`;
}

export function historyFilterSummary({ status = 'all', canal = 'all', search = '' } = {}) {
  const parts = [];
  const st = String(status || 'all');
  if (st && st !== 'all') {
    const labels = {
      em_aberto: 'Em aberto',
      pendente: 'Pendente',
      parcial: 'Parcial',
      concluida: 'Concluídas',
      cancelada: 'Canceladas',
      rascunho: 'Rascunhos',
    };
    parts.push(`Status: ${labels[st] || st}`);
  }
  const c = String(canal || 'all');
  if (c && c !== 'all') parts.push(`Canal: ${channelLabel(c)}`);
  const q = String(search || '').trim();
  if (q) parts.push(`Busca: ${q}`);
  return parts.length ? parts.join(' · ') : 'Sem filtros extras';
}

export function saleHistoryToCsvRow(sale) {
  return {
    data: formatDateTimeBr(sale?.created_at),
    id: sale?.id || '',
    id_curto: formatSaleIdShort(sale?.id),
    cliente: sale?.client_name || '',
    canal: sale?.canal_label || channelLabel(sale?.canal),
    itens: sale?.items_summary || '',
    total: sale?.total ?? '',
    total_formatado: sale?.total_label || formatBRL(sale?.total),
    pagamento: sale?.payment_label || '',
    status: saleStatusLabel(sale?.status),
  };
}

/**
 * @param {object[]} sales — já filtrados
 * @param {{ from?: string, to?: string, status?: string, canal?: string, search?: string }} meta
 */
export function buildSalesHistoryCsvRows(sales, meta = {}) {
  const list = sales || [];
  const totals = computeHistoryTotals(list);
  const rows = [
    { tipo: 'resumo', metrica: 'Período de', valor: meta.from || '' },
    { tipo: 'resumo', metrica: 'Período até', valor: meta.to || '' },
    { tipo: 'resumo', metrica: 'Filtros', valor: historyFilterSummary(meta) },
    { tipo: 'resumo', metrica: 'Vendas concluídas (qtd)', valor: totals.concludedCount },
    { tipo: 'resumo', metrica: 'Valor recebido (R$)', valor: totals.concludedReceived },
    { tipo: 'resumo', metrica: 'Em aberto (qtd)', valor: totals.openCount },
    { tipo: 'resumo', metrica: 'Saldo a receber (R$)', valor: totals.openRemaining },
    { tipo: 'resumo', metrica: 'Cancelamentos (qtd)', valor: totals.cancelCount },
    { tipo: 'resumo', metrica: 'Linhas exportadas', valor: list.length },
  ];

  for (const sale of list) {
    rows.push({ tipo: 'venda', ...saleHistoryToCsvRow(sale) });
  }
  return rows;
}

export function exportSalesHistoryCsv(sales, meta = {}) {
  const rows = buildSalesHistoryCsvRows(sales, meta);
  downloadCsv(rows, historyExportFilename(meta.from, meta.to, 'csv'));
}

/** Aplica filtros da UI sobre a lista carregada. */
export function filterSalesForHistoryExport(sales, filters) {
  return filterSalesList(sales, {
    status: filters?.status ?? 'all',
    canal: filters?.canal ?? 'all',
    search: filters?.search ?? '',
  });
}

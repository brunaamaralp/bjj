import { formatBRL } from '../../src/lib/moneyBr.js';
import {
  computeHistoryTotals,
  formatDateTimeBr,
  formatSaleIdShort,
  saleStatusLabel,
} from '../../src/lib/salesHistory.js';
import { channelLabel } from '../../src/lib/salesSettings.js';
import { historyFilterSummary } from '../../src/lib/salesHistoryExport.js';
import { renderReceiptPdf, receiptGeneratedAt, RECEIPT_CONTENT_W } from './receiptPdfLayout.js';

const CONTENT_W = RECEIPT_CONTENT_W;

function formatDateBrYmd(dateYmd) {
  const s = String(dateYmd || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

/**
 * @param {object} payload
 * @param {string} payload.academy_name
 * @param {string} payload.from
 * @param {string} payload.to
 * @param {object[]} payload.sales
 * @param {{ status?: string, canal?: string, search?: string }} payload.filters
 * @param {boolean} [payload.truncated]
 */
export async function renderSalesHistoryPdfBuffer(payload) {
  const sales = payload?.sales || [];
  const totals = computeHistoryTotals(sales);
  const academyName = String(payload?.academy_name || 'Academia').trim();
  const fromLabel = formatDateBrYmd(payload?.from);
  const toLabel = formatDateBrYmd(payload?.to);
  const periodLabel =
    payload?.from && payload?.from === payload?.to
      ? fromLabel
      : `${fromLabel} — ${toLabel}`;
  const filterLine = historyFilterSummary(payload?.filters || {});

  return renderReceiptPdf((ctx) => {
    ctx.drawHeader({
      academyName,
      docTitle: 'Histórico de vendas',
      metaLine: periodLabel,
    });

    ctx.sectionTitle('Resumo');
    ctx.keyValueRows([
      { label: 'Filtros', value: filterLine },
      {
        label: 'Vendas concluídas',
        value: `${totals.concludedCount} (${formatBRL(totals.concludedReceived)})`,
      },
      { label: 'Em aberto', value: `${totals.openCount} (${formatBRL(totals.openRemaining)})` },
      { label: 'Cancelamentos', value: String(totals.cancelCount) },
      { label: 'Linhas', value: String(sales.length) },
    ]);

    const rows = sales.map((s) => [
      formatDateTimeBr(s.created_at).slice(0, 16),
      formatSaleIdShort(s.id),
      String(s.client_name || '—').slice(0, 18),
      String(s.canal_label || channelLabel(s.canal) || '—').slice(0, 10),
      String(s.items_summary || '—').slice(0, 16),
      formatBRL(s.total),
      String(s.payment_label || '—').slice(0, 12),
      saleStatusLabel(s.status).slice(0, 10),
    ]);

    if (rows.length) {
      ctx.divider();
      ctx.sectionTitle('Vendas');
      ctx.itemsTable({
        columns: [
          { label: 'DATA', width: CONTENT_W * 0.14 },
          { label: 'ID', width: CONTENT_W * 0.08 },
          { label: 'CLIENTE', width: CONTENT_W * 0.16 },
          { label: 'CANAL', width: CONTENT_W * 0.1 },
          { label: 'ITENS', width: CONTENT_W * 0.14 },
          { label: 'TOTAL', width: CONTENT_W * 0.12, align: 'right' },
          { label: 'PAGTO', width: CONTENT_W * 0.14, align: 'right' },
          { label: 'STATUS', width: CONTENT_W * 0.12, align: 'right' },
        ],
        rows,
      });
    }

    if (payload?.truncated) {
      ctx.noteBlock(
        'Lista parcial — muitas vendas no período. Refine o intervalo ou exporte CSV.'
      );
    }

    ctx.footer({
      message: 'Exportação do Histórico de vendas — dados em tempo real.',
      generatedAt: receiptGeneratedAt(),
    });
  });
}

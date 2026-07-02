import { formatBRL } from '../../src/lib/moneyBr.js';
import { paymentFormLabel } from '../../src/lib/salePayments.js';
import { formatSaleIdShort } from '../../src/lib/salesHistory.js';
import { formatPaymentIdShort } from './paymentReceiptText.js';
import { renderReceiptPdf, receiptGeneratedAt, RECEIPT_CONTENT_W } from './receiptPdfLayout.js';

const CONTENT_W = RECEIPT_CONTENT_W;

function formatDateBrYmd(dateYmd) {
  const s = String(dateYmd || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

function formatTimeBr(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatReferenceMonthShort(ym) {
  const s = String(ym || '').trim();
  const [y, m] = s.split('-');
  if (!y || !m) return s || '—';
  return `${m}/${y}`;
}

/**
 * @param {object} report — payload daily_report
 */
export async function renderDailyReportPdfBuffer(report) {
  const summary = report?.summary || {};
  const academyName = String(report?.academy_name || 'Academia').trim();
  const dateLabel = formatDateBrYmd(report?.date);

  return renderReceiptPdf((ctx) => {
    ctx.drawHeader({
      academyName,
      docTitle: 'Fechamento do dia',
      metaLine: `${dateLabel} · recepção`,
    });

    ctx.sectionTitle('Resumo');
    ctx.keyValueRows([
      { label: 'Vendas concluídas', value: `${summary.concluded_count || 0} (${formatBRL(summary.concluded_total)})` },
      { label: 'Mensalidades recebidas', value: `${summary.payments_count || 0} (${formatBRL(summary.payments_total)})` },
      { label: 'Total recepção', value: formatBRL(summary.reception_total) },
      { label: 'Ticket médio (vendas)', value: formatBRL(summary.ticket_medio) },
      { label: 'Cancelamentos', value: String(summary.cancel_count || 0) },
    ]);

    if (Number(summary.pending_count) > 0) {
      ctx.keyValueRows([
        { label: 'Vendas a receber', value: `${summary.pending_count} (${formatBRL(summary.pending_total)})` },
      ]);
    }

    const paymentKeys = Object.entries(report.totals_by_payment || {}).filter(
      ([, v]) => Number(v) !== 0
    );
    if (paymentKeys.length) {
      ctx.divider();
      ctx.sectionTitle('Por forma de pagamento');
      ctx.keyValueRows(
        paymentKeys
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([forma, val]) => ({
            label: paymentFormLabel(forma),
            value: formatBRL(val),
          }))
      );
    }

    const salesRows = (report.sales_concluded || []).map((s) => [
      formatTimeBr(s.created_at),
      formatSaleIdShort(s.id),
      String(s.client_name || '—').slice(0, 28),
      formatBRL(s.total),
      String(s.payment_label || '—').slice(0, 16),
    ]);

    if (salesRows.length) {
      ctx.divider();
      ctx.sectionTitle('Vendas concluídas');
      ctx.itemsTable({
        columns: [
          { label: 'HORA', width: CONTENT_W * 0.12 },
          { label: 'ID', width: CONTENT_W * 0.12 },
          { label: 'CLIENTE', width: CONTENT_W * 0.34 },
          { label: 'TOTAL', width: CONTENT_W * 0.18, align: 'right' },
          { label: 'PAGTO', width: CONTENT_W * 0.24, align: 'right' },
        ],
        rows: salesRows,
      });
    }

    const paymentRows = (report.payments_received || []).map((p) => [
      formatTimeBr(p.paid_at),
      formatPaymentIdShort(p.id),
      String(p.student_name || '—').slice(0, 24),
      formatReferenceMonthShort(p.reference_month),
      formatBRL(p.amount),
      String(p.payment_label || '—').slice(0, 14),
    ]);

    if (paymentRows.length) {
      ctx.divider();
      ctx.sectionTitle('Mensalidades recebidas');
      ctx.itemsTable({
        columns: [
          { label: 'HORA', width: CONTENT_W * 0.11 },
          { label: 'ID', width: CONTENT_W * 0.11 },
          { label: 'ALUNO', width: CONTENT_W * 0.28 },
          { label: 'REF.', width: CONTENT_W * 0.12 },
          { label: 'VALOR', width: CONTENT_W * 0.16, align: 'right' },
          { label: 'PAGTO', width: CONTENT_W * 0.22, align: 'right' },
        ],
        rows: paymentRows,
      });
    }

    if (report.truncated || report.payments_truncated) {
      ctx.noteBlock(
        'Lista parcial — muitos registros no dia. Exporte CSV para detalhes completos.'
      );
    }

    ctx.footer({
      message: 'Dados em tempo real — alterações posteriores refletem neste relatório.',
      generatedAt: receiptGeneratedAt(),
    });
  });
}

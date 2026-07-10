import { formatBRL } from '../../src/lib/moneyBr.js';
import { formatPeriodRangeBr, monthPeriodBounds } from '../../src/lib/financeiroOverview.js';
import { CASCADE_DISPLAY_ROWS, cascadeRowAmount } from '../../src/lib/financeCascadeDisplay.js';
import { renderReceiptPdf } from './receiptPdfLayout.js';

function formatMonthLabel(month) {
  const ym = String(month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) return '';
  const { from, to } = monthPeriodBounds(ym);
  return formatPeriodRangeBr(from, to, false);
}

/**
 * @param {{ month?: string, period?: object, statement?: object }} payload
 */
export async function renderCashFlowCascadePdfBuffer(payload) {
  const statement = payload?.statement;
  const periodLabel = payload?.month
    ? formatMonthLabel(payload.month)
    : formatPeriodRangeBr(statement?.period?.from, statement?.period?.to, false);

  return renderReceiptPdf((ctx) => {
    ctx.drawHeader({
      academyName: 'Fluxo de caixa gerencial',
      docTitle: 'Cascata',
      metaLine: `${periodLabel} · regime de caixa`,
    });

    ctx.sectionTitle('Demonstrativo');
    const rows = CASCADE_DISPLAY_ROWS.map((row) => ({
      label: row.label,
      value: formatBRL(cascadeRowAmount(statement, row)),
    }));
    ctx.keyValueRows(rows);

    const recon = statement?.bankReconciliation || {};
    if (recon.saldoInicial != null) {
      ctx.divider();
      ctx.sectionTitle('Conciliação bancária');
      ctx.keyValueRows([
        { label: 'Saldo inicial', value: formatBRL(recon.saldoInicial) },
        { label: 'Saldo final', value: formatBRL(recon.saldoFinal) },
        { label: 'Gap (classificado − contas)', value: formatBRL(recon.gap) },
        {
          label: 'Status',
          value: recon.matches === true ? 'Confere' : recon.matches === false ? 'Divergente' : '—',
        },
      ]);
    }
  });
}

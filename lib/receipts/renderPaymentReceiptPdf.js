import { formatBRL } from '../../src/lib/moneyBr.js';
import { paymentLabel } from '../../src/lib/salesSettings.js';
import { readSalesSettings } from '../../src/lib/salesSettings.js';
import { parseAcademySettings } from '../../src/lib/stockSettings.js';
import {
  PAYMENT_CATEGORY,
  normalizePaymentCategory,
  isBundleAnchorPayment,
} from '../../src/lib/paymentCategories.js';
import {
  enumerateCoverageMonths,
  formatReferenceMonthLong,
} from '../../src/lib/bundleCoverage.js';
import { academyDisplayName } from './saleReceiptPdf.js';
import {
  formatPaymentIdShort,
  isPaymentReceiptEligible,
  paymentCategoryLabel,
  bundleReceiptPlanLine,
} from './paymentReceiptText.js';
import { renderReceiptPdf, receiptGeneratedAt } from './receiptPdfLayout.js';

function formatPaidAtBr(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function bundleMonthLabels(payment, bundlePayments) {
  const months = Number(payment.bundle_months) || 0;
  const startYm = String(payment.reference_month || '').trim();
  if (!months || !startYm) return [];

  const listed =
    Array.isArray(bundlePayments) && bundlePayments.length
      ? bundlePayments
          .map((p) => String(p.reference_month || '').trim())
          .filter(Boolean)
          .sort()
      : enumerateCoverageMonths(startYm, months);

  return listed.map((ym) => formatReferenceMonthLong(ym));
}

/**
 * PDF de pagamento (mensalidade/plano/taxa) com layout fixo.
 */
export async function renderPaymentReceiptPdfBuffer({
  payment,
  studentDoc,
  academyDoc,
  bundlePayments = [],
}) {
  const eligible = isPaymentReceiptEligible(payment);
  if (!eligible.ok) {
    const err = new Error(eligible.reason || 'payment_not_eligible');
    err.code = eligible.reason;
    throw err;
  }

  const settings = readSalesSettings(parseAcademySettings(academyDoc?.settings));
  const academyName = academyDisplayName(academyDoc);
  const studentName = String(studentDoc?.name || studentDoc?.nome || 'Aluno').trim() || 'Aluno';
  const st = String(payment.status || '').toLowerCase();
  const amount =
    st === 'partial'
      ? Number(payment.paid_amount ?? payment.amount)
      : Number(payment.paid_amount ?? payment.amount);

  const refYm = String(payment.reference_month || '').trim();
  const referenceMonth = refYm ? formatReferenceMonthLong(refYm) : '—';

  let planName = String(payment.plan_name || '').trim() || '—';
  const cat = normalizePaymentCategory(payment.payment_category);
  if (cat === PAYMENT_CATEGORY.BUNDLE) {
    const bundleLine = bundleReceiptPlanLine(payment);
    if (bundleLine) planName = bundleLine;
  }

  const payRef = formatPaymentIdShort(payment.$id || payment.id);
  const statusNote = st === 'partial' ? 'Pagamento parcial' : null;

  return renderReceiptPdf((ctx) => {
    ctx.drawHeader({
      academyName,
      docTitle: 'Comprovante de pagamento',
      metaLine: `${payRef} · ${formatPaidAtBr(payment.paid_at || payment.$createdAt)}`,
    });

    ctx.sectionTitle('Aluno');
    ctx.keyValueRows([
      { label: 'Nome', value: studentName },
      { label: 'Categoria', value: paymentCategoryLabel(payment.payment_category) },
      { label: 'Plano / descrição', value: planName },
      { label: 'Competência', value: referenceMonth },
    ]);

    ctx.divider();
    ctx.sectionTitle('Recebimento');
    ctx.keyValueRows([
      { label: 'Valor recebido', value: formatBRL(amount) },
      { label: 'Forma', value: paymentLabel(payment.method) },
      {
        label: 'Registrado por',
        value: String(payment.registered_by_name || payment.registered_by || '—').trim() || '—',
      },
    ]);

    if (isBundleAnchorPayment(payment)) {
      const months = bundleMonthLabels(payment, bundlePayments);
      if (months.length) {
        ctx.divider();
        ctx.bulletList('Meses cobertos pelo plano', months);
      }
    }

    ctx.divider();
    ctx.totalBox({
      label: statusNote || 'Valor confirmado',
      amount: formatBRL(amount),
      subtitle: statusNote ? `Total do lançamento: ${formatBRL(Number(payment.amount) || amount)}` : null,
    });

    ctx.noteBlock(payment.note);
    ctx.footer({
      message: settings.receiptFooter,
      generatedAt: receiptGeneratedAt(),
    });
  });
}

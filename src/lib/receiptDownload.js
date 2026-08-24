import { createSessionJwt } from './appwrite.js';
import { useLeadStore } from '../store/useLeadStore.js';
import { authedFetch } from './authInterceptor.js';
import { isPaymentReceiptEligible } from '../../lib/receipts/paymentReceiptText.js';

export { isPaymentReceiptEligible };

export class ReceiptDownloadError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'ReceiptDownloadError';
    this.status = status;
  }
}

async function receiptPdfFetch(url) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new ReceiptDownloadError('session_required', { status: 401 });

  const academyId = useLeadStore.getState().academyId;
  if (!academyId) throw new ReceiptDownloadError('academy_required', { status: 400 });

  const res = await authedFetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': academyId,
    },
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      throw new ReceiptDownloadError(
        data.erro || data.error || `HTTP ${res.status}`,
        { status: res.status }
      );
    }
    throw new ReceiptDownloadError(`HTTP ${res.status}`, { status: res.status });
  }

  if (!contentType.includes('application/pdf')) {
    const data = await res.json().catch(() => ({}));
    throw new ReceiptDownloadError(data.erro || 'Resposta inválida', { status: res.status });
  }

  return res.blob();
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** @param {string} saleId */
export async function downloadSaleReceiptPdf(saleId) {
  const id = String(saleId || '').trim();
  if (!id) throw new ReceiptDownloadError('sale_id_required');

  const blob = await receiptPdfFetch(`/api/sales?id=${encodeURIComponent(id)}&format=pdf`);
  const filename = `recibo-venda-${id.slice(-4).toUpperCase()}.pdf`;
  triggerBrowserDownload(blob, filename);
}

/** @param {string} paymentId */
export async function downloadPaymentReceiptPdf(paymentId) {
  const id = String(paymentId || '').trim();
  if (!id) throw new ReceiptDownloadError('payment_id_required');

  const blob = await receiptPdfFetch(
    `/api/student-payments?id=${encodeURIComponent(id)}&format=pdf`
  );
  const filename = `recibo-pagamento-${id.slice(-4).toUpperCase()}.pdf`;
  triggerBrowserDownload(blob, filename);
}

/** Venda concluída pode gerar PDF. */
export function canDownloadSaleReceipt(sale) {
  return String(sale?.status || '').toLowerCase() === 'concluida';
}

/** Pagamento elegível para PDF (pago/parcial com valor). */
export function canDownloadPaymentReceipt(payment) {
  return isPaymentReceiptEligible(payment).ok;
}

/** @param {string} dateYmd — YYYY-MM-DD */
export async function downloadSalesDailyReportPdf(dateYmd) {
  const date = String(dateYmd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ReceiptDownloadError('invalid_date');
  }

  const blob = await receiptPdfFetch(
    `/api/sales?action=daily_report&date=${encodeURIComponent(date)}&format=pdf`
  );
  triggerBrowserDownload(blob, `fechamento-dia-${date}.pdf`);
}

/**
 * PDF do Histórico de vendas (período + filtros).
 * @param {{ from: string, to: string, status?: string, canal?: string, search?: string }} opts
 */
export async function downloadSalesHistoryPdf({ from, to, status = 'all', canal = 'all', search = '' } = {}) {
  const fromYmd = String(from || '').trim().slice(0, 10);
  const toYmd = String(to || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) {
    throw new ReceiptDownloadError('invalid_period');
  }

  const params = new URLSearchParams({
    action: 'history_export',
    from: fromYmd,
    to: toYmd,
    format: 'pdf',
    status: String(status || 'all'),
    canal: String(canal || 'all'),
  });
  const q = String(search || '').trim();
  if (q) params.set('search', q);

  const blob = await receiptPdfFetch(`/api/sales?${params.toString()}`);
  triggerBrowserDownload(blob, `historico-vendas-${fromYmd}_${toYmd}.pdf`);
}

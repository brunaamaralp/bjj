import { Query } from 'node-appwrite';

/** Limite padrão quando academia não tem pagbank_max_retries ou API falhou no setup. */
export const PAGBANK_DEFAULT_MAX_RETRIES = 3;

/**
 * Extrai contexto de fatura do payload do webhook.
 * Formato oficial PagBank: `body.resource` (assinatura) — sem invoice aninhada no exemplo documentado.
 * Formatos alternativos: `body.data.invoice`, `body.data.payment.invoice`, `body.resource.invoice`.
 */
export function extractInvoiceContext(body) {
  const data = body?.data && typeof body.data === 'object' ? body.data : {};
  const resource = body?.resource && typeof body.resource === 'object' ? body.resource : {};
  const payment = data.payment || resource.payment || {};
  const invoice = data.invoice || resource.invoice || payment.invoice || {};

  const invoiceId = String(
    invoice.id || data.invoice_id || resource.invoice_id || payment.invoice_id || ''
  ).trim();

  const invoiceStatus = String(invoice.status || data.invoice_status || '').trim().toUpperCase();

  return { invoiceId, invoiceStatus };
}

/**
 * Interpreta GET /preferences/retries.
 * API documentada usa first_try / second_try / third_try (intervalos em dias), não max_retries.
 */
export function parsePagbankMaxRetries(retriesData) {
  if (!retriesData || typeof retriesData !== 'object') {
    return PAGBANK_DEFAULT_MAX_RETRIES;
  }

  const explicit = Number(retriesData.max_retries);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.floor(explicit);
  }

  const tryKeys = ['first_try', 'second_try', 'third_try'];
  const configured = tryKeys.filter(
    (key) => retriesData[key] != null && String(retriesData[key]).trim() !== ''
  );
  if (configured.length > 0) {
    return configured.length;
  }

  if (Array.isArray(retriesData.retries) && retriesData.retries.length > 0) {
    return retriesData.retries.length;
  }

  return PAGBANK_DEFAULT_MAX_RETRIES;
}

export function resolveAcademyMaxRetries(academyDoc) {
  const raw = academyDoc?.pagbank_max_retries;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    return Math.floor(n);
  }
  return PAGBANK_DEFAULT_MAX_RETRIES;
}

/**
 * @param {{ priorDeclinedCount: number, maxRetries: number, invoiceStatus: string }} input
 */
export function resolveDeclineOutcome({ priorDeclinedCount, maxRetries, invoiceStatus }) {
  const attemptNumber = (Number(priorDeclinedCount) || 0) + 1;
  const isPendingAction = String(invoiceStatus || '').trim().toUpperCase() === 'PENDING_ACTION';
  const limit = Math.max(1, Number(maxRetries) || PAGBANK_DEFAULT_MAX_RETRIES);
  const isFinalAttempt = isPendingAction || attemptNumber >= limit;
  const subscriptionStatus = isFinalAttempt ? 'overdue' : 'retrying';

  return { attemptNumber, isFinalAttempt, isPendingAction, subscriptionStatus };
}

/** Queries Appwrite para contar declined anteriores na mesma fatura (ou ciclo). */
export function buildPriorDeclinedQueries({ invoiceId, subscriptionId, referenceMonth }) {
  if (invoiceId) {
    return [Query.equal('invoice_id', invoiceId), Query.equal('status', 'declined')];
  }
  const month = String(referenceMonth || '').trim();
  if (month) {
    return [
      Query.equal('subscription_id', subscriptionId),
      Query.equal('reference_month', month),
      Query.equal('status', 'declined'),
    ];
  }
  return [Query.equal('subscription_id', subscriptionId), Query.equal('status', 'declined')];
}

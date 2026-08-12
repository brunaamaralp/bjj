const COMPENSATE_MOTIVO = 'Checkout misto: falha ao registrar cobrança';

function saleIdFromResult(sale) {
  if (!sale || typeof sale !== 'object') return '';
  return String(sale.$id || sale.id || sale.venda_id || '').trim();
}

/**
 * Orquestra venda + student_payments. Compensa a venda se cobrança falhar.
 * @param {{
 *   deps: { createSale: Function, createPayment: Function, cancelSale: Function },
 *   salePayload: object|null,
 *   paymentPayloads: object[],
 *   createPaymentOpts?: object,
 * }} args
 */
export async function submitMixedCheckout({
  deps,
  salePayload = null,
  paymentPayloads = [],
  createPaymentOpts = {},
} = {}) {
  const createSale = deps?.createSale;
  const createPayment = deps?.createPayment;
  const cancelSale = deps?.cancelSale;
  const paymentsIn = Array.isArray(paymentPayloads) ? paymentPayloads : [];
  const hasSale = Boolean(salePayload && Array.isArray(salePayload.itens) && salePayload.itens.length > 0);
  const hasPayments = paymentsIn.length > 0;

  if (!hasSale && !hasPayments) {
    return { ok: false, error: 'empty', message: 'Nada para registrar.' };
  }

  let sale = null;
  if (hasSale) {
    if (typeof createSale !== 'function') {
      return { ok: false, error: 'missing_create_sale', message: 'createSale indisponível.' };
    }
    try {
      sale = await createSale(salePayload);
    } catch (e) {
      return {
        ok: false,
        error: 'sale_failed',
        message: e?.message || 'Falha ao registrar a venda.',
        cause: e,
      };
    }
    const sid = saleIdFromResult(sale);
    if (!sid) {
      // createSale do store pode retornar null e setar error no state
      return {
        ok: false,
        error: 'sale_failed',
        message: 'Falha ao registrar a venda.',
        sale,
      };
    }
  }

  const payments = [];
  if (hasPayments) {
    if (typeof createPayment !== 'function') {
      if (sale && typeof cancelSale === 'function') {
        await cancelSale({ venda_id: saleIdFromResult(sale), motivo: COMPENSATE_MOTIVO }).catch(() => {});
      }
      return { ok: false, error: 'missing_create_payment', message: 'createPayment indisponível.', sale };
    }
    try {
      for (const payload of paymentsIn) {
        const doc = await createPayment(payload, createPaymentOpts);
        payments.push(doc);
      }
    } catch (e) {
      const sid = saleIdFromResult(sale);
      let compensated = false;
      if (sid && typeof cancelSale === 'function') {
        try {
          await cancelSale({ venda_id: sid, motivo: COMPENSATE_MOTIVO });
          compensated = true;
        } catch {
          compensated = false;
        }
      }
      return {
        ok: false,
        error: 'payment_failed',
        message: e?.message || 'Falha ao registrar cobrança.',
        cause: e,
        sale,
        payments,
        compensated,
      };
    }
  }

  return { ok: true, sale, payments };
}

export { COMPENSATE_MOTIVO };

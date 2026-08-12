const COMPENSATE_MOTIVO = 'Checkout misto: falha ao registrar cobrança';

function saleIdFromResult(sale) {
  if (!sale || typeof sale !== 'object') return '';
  return String(sale.$id || sale.id || sale.venda_id || '').trim();
}

function paymentStageLabel(payload, index, total) {
  const cat = String(payload?.payment_category || '').trim();
  const base =
    cat === 'plan'
      ? 'mensalidade'
      : cat === 'bundle'
        ? 'pacote'
        : cat === 'fee'
          ? 'taxa'
          : 'cobrança';
  if (total > 1) {
    return `Registrando ${base} (${index + 1}/${total})…`;
  }
  return `Registrando ${base}…`;
}

/**
 * Orquestra venda + student_payments. Compensa a venda se cobrança falhar.
 * @param {{
 *   deps: { createSale: Function, createPayment: Function, cancelSale: Function },
 *   salePayload: object|null,
 *   paymentPayloads: object[],
 *   createPaymentOpts?: object,
 *   onProgress?: (evt: { stage: string, label: string, index?: number, total?: number }) => void,
 * }} args
 */
export async function submitMixedCheckout({
  deps,
  salePayload = null,
  paymentPayloads = [],
  createPaymentOpts = {},
  onProgress,
} = {}) {
  const createSale = deps?.createSale;
  const createPayment = deps?.createPayment;
  const cancelSale = deps?.cancelSale;
  const paymentsIn = Array.isArray(paymentPayloads) ? paymentPayloads : [];
  const hasSale = Boolean(salePayload && Array.isArray(salePayload.itens) && salePayload.itens.length > 0);
  const hasPayments = paymentsIn.length > 0;
  const emit = (evt) => {
    try {
      onProgress?.(evt);
    } catch {
      /* ignore UI progress errors */
    }
  };

  if (!hasSale && !hasPayments) {
    return { ok: false, error: 'empty', message: 'Nada para registrar.' };
  }

  let sale = null;
  if (hasSale) {
    if (typeof createSale !== 'function') {
      return { ok: false, error: 'missing_create_sale', message: 'createSale indisponível.' };
    }
    emit({ stage: 'sale', label: 'Registrando venda…' });
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
        emit({ stage: 'compensate', label: 'Desfazendo venda…' });
        await cancelSale({ venda_id: saleIdFromResult(sale), motivo: COMPENSATE_MOTIVO }).catch(() => {});
      }
      return { ok: false, error: 'missing_create_payment', message: 'createPayment indisponível.', sale };
    }
    try {
      const total = paymentsIn.length;
      for (let i = 0; i < paymentsIn.length; i += 1) {
        const payload = paymentsIn[i];
        emit({
          stage: 'payment',
          index: i,
          total,
          label: paymentStageLabel(payload, i, total),
        });
        const doc = await createPayment(payload, createPaymentOpts);
        payments.push(doc);
      }
    } catch (e) {
      const sid = saleIdFromResult(sale);
      let compensated = false;
      if (sid && typeof cancelSale === 'function') {
        emit({ stage: 'compensate', label: 'Desfazendo venda…' });
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

  emit({ stage: 'done', label: 'Concluído' });
  return { ok: true, sale, payments };
}

export { COMPENSATE_MOTIVO, paymentStageLabel };

import { parseAcademySettings } from './stockSettings.js';
import { DEFAULT_CANCEL_RECEIPT_TEMPLATE } from './salesHistory.js';

export const DEFAULT_SALES_RECEIPT_TEMPLATE = `*{academy_name}*
Venda #{sale_id} — {date}

{items_lines}

*Total: {total}*
Pagamento: {payment}

{footer}`;

export const DEFAULT_SALES_FOOTER = 'Obrigado!';

export const SALES_CHANNEL_OPTIONS = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'whatsapp_retirada', label: 'WhatsApp — retirada' },
];

export function readSalesSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const sales = settings?.sales && typeof settings.sales === 'object' ? settings.sales : {};
  const template = String(sales.receiptTemplate || '').trim();
  const cancelTemplate = String(sales.cancelReceiptTemplate || '').trim();
  const saleIncomeCategory = String(sales.saleIncomeCategory || '').trim();
  return {
    receiptTemplate: template || DEFAULT_SALES_RECEIPT_TEMPLATE,
    receiptFooter: String(sales.receiptFooter ?? DEFAULT_SALES_FOOTER).trim() || DEFAULT_SALES_FOOTER,
    cancelReceiptTemplate: cancelTemplate || DEFAULT_CANCEL_RECEIPT_TEMPLATE,
    lockPriceEdit: sales.lockPriceEdit === true,
    saleIncomeCategory,
  };
}

export function mergeSalesIntoSettings(settingsRaw, salesPatch) {
  const base = parseAcademySettings(settingsRaw);
  const prev = base?.sales && typeof base.sales === 'object' ? base.sales : {};
  return {
    ...base,
    sales: {
      ...prev,
      receiptTemplate: String(salesPatch.receiptTemplate ?? '').trim() || DEFAULT_SALES_RECEIPT_TEMPLATE,
      receiptFooter: String(salesPatch.receiptFooter ?? DEFAULT_SALES_FOOTER).trim() || DEFAULT_SALES_FOOTER,
      lockPriceEdit: salesPatch.lockPriceEdit === true,
    },
  };
}

export function channelLabel(canal) {
  const v = String(canal || 'presencial').trim();
  return SALES_CHANNEL_OPTIONS.find((o) => o.value === v)?.label || v || 'Presencial';
}

export function paymentLabel(forma) {
  const map = {
    pix: 'PIX',
    debito: 'Débito',
    credito: 'Crédito',
    cartao_credito: 'Cartão de crédito',
    cartao_debito: 'Cartão de débito',
    dinheiro: 'Dinheiro',
    transferencia: 'Transferência',
    outro: 'Outro',
  };
  return map[String(forma || '').toLowerCase()] || forma || '—';
}

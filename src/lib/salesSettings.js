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

/** Origem da venda — alinha política de turno de caixa (UI ↔ API). */
export const SALE_SOURCES = ['pdv', 'modal', 'student', 'nl'];

export function normalizeSaleSource(raw) {
  const s = String(raw || 'pdv').toLowerCase();
  return SALE_SOURCES.includes(s) ? s : 'pdv';
}

export function readSalesSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const sales = settings?.sales && typeof settings.sales === 'object' ? settings.sales : {};
  const saleIncomeCategory = String(sales.saleIncomeCategory || '').trim();
  const requiredRaw = sales.cashShiftRequiredFor;
  const cashShiftRequiredFor =
    Array.isArray(requiredRaw) && requiredRaw.length
      ? requiredRaw.map((x) => String(x).toLowerCase()).filter((x) => SALE_SOURCES.includes(x))
      : ['pdv'];
  return {
    receiptTemplate: DEFAULT_SALES_RECEIPT_TEMPLATE,
    receiptFooter: DEFAULT_SALES_FOOTER,
    cancelReceiptTemplate: DEFAULT_CANCEL_RECEIPT_TEMPLATE,
    lockPriceEdit: sales.lockPriceEdit === true,
    autoPrintReceipt: sales.autoPrintReceipt === true,
    requireCashShift: sales.requireCashShift === true,
    cashShiftRequiredFor: cashShiftRequiredFor.length ? cashShiftRequiredFor : ['pdv'],
    saleIncomeCategory,
  };
}

export function mergeSalesIntoSettings(settingsRaw, salesPatch) {
  const base = parseAcademySettings(settingsRaw);
  const prev = base?.sales && typeof base.sales === 'object' ? base.sales : {};
  const { receiptTemplate: _rt, receiptFooter: _rf, cancelReceiptTemplate: _crt, ...salesRest } = prev;
  return {
    ...base,
    sales: {
      ...salesRest,
      lockPriceEdit: salesPatch.lockPriceEdit === true,
      autoPrintReceipt: salesPatch.autoPrintReceipt === true,
      requireCashShift: salesPatch.requireCashShift === true,
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

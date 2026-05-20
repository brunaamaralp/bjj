import { channelLabel, paymentLabel } from './salesSettings.js';
import { formatBRL } from './moneyBr.js';
import { formatSaleIdShort } from './salesHistory.js';

/** Escapa asteriscos em trechos dinâmicos para não quebrar negrito no WhatsApp. */
export function escapeWhatsappBold(text) {
  return String(text || '').replace(/\*/g, '\\*');
}

/** Remove placeholders {chave} não substituídos do texto final. */
export function stripUnusedPlaceholders(text) {
  return String(text || '').replace(/\{[a-z_]+\}/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildReceiptText({
  template,
  footer,
  academyName,
  saleId,
  date,
  time,
  channel,
  clientName,
  clientPhone,
  items,
  total,
  payment,
}) {
  const itemsLines = (items || [])
    .map((it) => {
      const qty = Number(it.quantidade) || 0;
      const name = escapeWhatsappBold(String(it.display_label || it.nome || 'Item').trim());
      const sub = formatBRL(Number(it.subtotal ?? qty * Number(it.preco_unitario)));
      return `${qty}x ${name} — ${sub}`;
    })
    .join('\n');

  const phoneLine = String(clientPhone || '').trim();
  const clientDisplay = escapeWhatsappBold(String(clientName || 'Cliente').trim());
  const clientWithPhone = phoneLine ? `${clientDisplay} — ${phoneLine}` : clientDisplay;

  const vars = {
    academy_name: escapeWhatsappBold(String(academyName || 'Academia').trim()),
    sale_id: formatSaleIdShort(saleId),
    date: String(date || '').trim(),
    time: String(time || '').trim(),
    channel: channelLabel(channel),
    client_name: clientWithPhone,
    items_lines: itemsLines,
    total: formatBRL(total),
    payment: paymentLabel(payment),
    footer: String(footer || '').trim(),
  };

  let out = String(template || '');
  for (const [key, val] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return stripUnusedPlaceholders(out);
}

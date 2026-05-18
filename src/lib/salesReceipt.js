import { channelLabel, paymentLabel } from './salesSettings.js';
import { formatBRL } from './moneyBr.js';

export function buildReceiptText({
  template,
  footer,
  academyName,
  saleId,
  date,
  time,
  channel,
  clientName,
  items,
  total,
  payment,
}) {
  const itemsLines = (items || [])
    .map((it) => {
      const qty = Number(it.quantidade) || 0;
      const name = String(it.display_label || it.nome || 'Item').trim();
      const sub = formatBRL(Number(it.subtotal ?? qty * Number(it.preco_unitario)));
      return `${qty}x ${name} — ${sub}`;
    })
    .join('\n');

  const vars = {
    academy_name: String(academyName || 'Academia').trim(),
    sale_id: String(saleId || '—').trim(),
    date: String(date || '').trim(),
    time: String(time || '').trim(),
    channel: channelLabel(channel),
    client_name: String(clientName || 'Cliente').trim(),
    items_lines: itemsLines,
    total: formatBRL(total),
    payment: paymentLabel(payment),
    footer: String(footer || '').trim(),
  };

  let out = String(template || '');
  for (const [key, val] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return out.trim();
}

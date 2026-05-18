import React, { useMemo } from 'react';
import { Copy } from 'lucide-react';
import { buildReceiptText } from '../../lib/salesReceipt';
import { formatBRL } from '../../lib/moneyBr';
import { channelLabel, paymentLabel } from '../../lib/salesSettings';

export default function SalesReceiptPanel({ receipt, settings, academyName, onCopy }) {
  const whatsappText = useMemo(() => {
    if (!receipt) return '';
    return buildReceiptText({
      template: settings?.receiptTemplate,
      footer: settings?.receiptFooter,
      academyName,
      saleId: receipt.vendaId,
      date: receipt.date,
      time: receipt.time,
      channel: receipt.canal,
      clientName: receipt.clientName,
      items: receipt.items,
      total: receipt.total,
      payment: receipt.forma,
    });
  }, [receipt, settings, academyName]);

  if (!receipt) return null;

  return (
    <div className="card mt-3">
      <h4 className="navi-section-heading">Comprovante</h4>
      <div className="text-small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        <div><strong>Venda:</strong> {receipt.vendaId || '—'}</div>
        <div><strong>Data:</strong> {receipt.date} {receipt.time}</div>
        <div><strong>Canal:</strong> {channelLabel(receipt.canal)}</div>
        <div><strong>Cliente:</strong> {receipt.clientName}</div>
        <div style={{ marginTop: 8 }}>
          {receipt.items.map((it, i) => (
            <div key={i}>
              {it.quantidade}x {it.display_label} — {formatBRL(it.subtotal)}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <div><strong>Total:</strong> {formatBRL(receipt.total)}</div>
          <div><strong>Pagamento:</strong> {paymentLabel(receipt.forma)}</div>
        </div>
      </div>
      <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" onClick={() => onCopy(whatsappText)}>
          <Copy size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          Copiar comprovante
        </button>
        <button type="button" className="btn-outline" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      <pre
        className="text-small mt-3"
        style={{
          whiteSpace: 'pre-wrap',
          background: 'var(--surface-2)',
          padding: 12,
          borderRadius: 8,
          marginBottom: 0,
        }}
      >
        {whatsappText}
      </pre>
    </div>
  );
}



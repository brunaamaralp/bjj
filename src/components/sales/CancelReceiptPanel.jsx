import React, { useMemo } from 'react';
import { Copy } from 'lucide-react';
import { buildCancelReceiptText, formatSaleIdShort } from '../../lib/salesHistory';
import { formatBRL } from '../../lib/moneyBr';

export default function CancelReceiptPanel({ receipt, settings, academyName, onCopy }) {
  const whatsappText = useMemo(() => {
    if (!receipt) return '';
    return buildCancelReceiptText({
      template: settings?.cancelReceiptTemplate,
      footer: settings?.receiptFooter,
      academyName,
      saleId: receipt.saleId,
      cancelDate: receipt.cancelDate,
      cancelReason: receipt.cancelReason,
      items: receipt.items,
      refundTotal: receipt.refundTotal,
    });
  }, [receipt, settings, academyName]);

  if (!receipt) return null;

  return (
    <div className="card mt-3">
      <h4 className="navi-section-heading">Comprovante de cancelamento</h4>
      <div className="text-small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        <div><strong>Venda:</strong> {formatSaleIdShort(receipt.saleId)}</div>
        <div><strong>Cancelada em:</strong> {receipt.cancelDate}</div>
        <div><strong>Motivo:</strong> {receipt.cancelReason}</div>
        <div style={{ marginTop: 8 }}>
          {(receipt.items || []).map((it, i) => (
            <div key={i}>
              {it.quantidade}x {it.display_label}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <strong>Valor estornado:</strong> {formatBRL(receipt.refundTotal)}
        </div>
      </div>
      <button type="button" className="btn-secondary mt-3" onClick={() => onCopy(whatsappText)}>
        <Copy size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
        Copiar para WhatsApp
      </button>
    </div>
  );
}



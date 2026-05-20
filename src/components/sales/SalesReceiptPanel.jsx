import React, { useMemo } from 'react';
import { Copy } from 'lucide-react';
import { buildReceiptText } from '../../lib/salesReceipt';
import { formatBRL } from '../../lib/moneyBr';
import { channelLabel, paymentLabel } from '../../lib/salesSettings';
import { formatSaleIdShort } from '../../lib/salesHistory';
import { buildReceiptPaymentsText, paymentFormLabel } from '../../lib/salePayments';

export default function SalesReceiptPanel({ receipt, settings, academyName, onCopy }) {
  const saleIdShort = formatSaleIdShort(receipt?.vendaId);

  const whatsappText = useMemo(() => {
    if (!receipt) return '';
    const paymentSection = receipt.pagamentos?.length
      ? buildReceiptPaymentsText(receipt.pagamentos, receipt.total)
      : '';
    const base = buildReceiptText({
      template: settings?.receiptTemplate,
      footer: settings?.receiptFooter,
      academyName,
      saleId: receipt.vendaId,
      date: receipt.date,
      time: receipt.time,
      channel: receipt.canal,
      clientName: receipt.clientName,
      clientPhone: receipt.clientPhone,
      items: receipt.items,
      total: receipt.total,
      payment: receipt.forma,
    });
    if (!paymentSection) return base;
    return `${base}\n\n${paymentSection}`.trim();
  }, [receipt, settings, academyName]);

  if (!receipt) return null;

  const pagamentos = Array.isArray(receipt.pagamentos) ? receipt.pagamentos : [];

  return (
    <div className="card mt-3">
      <h4 className="navi-section-heading">Comprovante</h4>
      <div className="text-small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        <div><strong>Venda:</strong> {saleIdShort}</div>
        <div><strong>Data:</strong> {receipt.date} {receipt.time}</div>
        <div><strong>Canal:</strong> {channelLabel(receipt.canal)}</div>
        <div><strong>Cliente:</strong> {receipt.clientName}</div>
        {receipt.clientPhone ? (
          <div><strong>Telefone:</strong> {receipt.clientPhone}</div>
        ) : null}
        <div style={{ marginTop: 8 }}>
          {receipt.items.map((it, i) => (
            <div key={i}>
              {it.quantidade}x {it.display_label} - {formatBRL(it.subtotal)}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <div><strong>Valor da venda:</strong> {formatBRL(receipt.total)}</div>
          {pagamentos.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div><strong>Pagamentos:</strong></div>
              {pagamentos.map((p, i) => (
                <div key={i} style={{ marginTop: 6, paddingLeft: 4 }}>
                  <div>
                    {paymentFormLabel(p.forma)} - {formatBRL(p.valor)}
                  </div>
                  {p.forma === 'dinheiro' && Number(p.troco) > 0 ? (
                    <>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        Valor recebido: {formatBRL(Number(p.valor) + Number(p.troco))}
                      </div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        Troco ({paymentFormLabel(p.forma_troco || 'pix')}): - {formatBRL(p.troco)}
                      </div>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <strong>Pagamento:</strong> {paymentLabel(receipt.forma)}
            </div>
          )}
        </div>
        {receipt.trocoWarnings?.length ? (
          <p style={{ marginTop: 10, color: 'var(--warning, #b8860b)' }}>
            Aviso: {receipt.trocoWarnings.join(' ')}
          </p>
        ) : null}
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

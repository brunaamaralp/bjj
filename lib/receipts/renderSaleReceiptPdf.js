import { formatBRL } from '../../src/lib/moneyBr.js';
import { channelLabel } from '../../src/lib/salesSettings.js';
import { parsePagamentosJson } from '../../src/lib/salePayments.js';
import { resolveClientName } from '../../src/lib/salesHistory.js';
import { formatSaleIdShort } from '../../src/lib/salesHistory.js';
import { readSalesSettings } from '../../src/lib/salesSettings.js';
import { parseAcademySettings } from '../../src/lib/stockSettings.js';
import { academyDisplayName, formatBrDateTimeFromIso } from './saleReceiptPdf.js';
import { renderReceiptPdf, receiptGeneratedAt, RECEIPT_CONTENT_W } from './receiptPdfLayout.js';

/**
 * PDF de venda com layout fixo (recibo institucional).
 */
export async function renderSaleReceiptPdfBuffer(doc, items, leadNames, academyDoc) {
  const settings = readSalesSettings(parseAcademySettings(academyDoc?.settings));
  const academyName = academyDisplayName(academyDoc);
  const { date, time } = formatBrDateTimeFromIso(doc.$createdAt || doc.created_at);
  const saleRef = formatSaleIdShort(doc.$id);
  const pagamentos = parsePagamentosJson(doc.pagamentos_json);
  const clientName = resolveClientName(
    { cliente_nome: doc.cliente_nome, aluno_id: doc.aluno_id },
    leadNames
  );
  const clientPhone = String(doc.cliente_telefone || '').trim();
  const total = Number(doc.total) || 0;

  const itemRows = (items || []).map((it) => {
    const qty = Number(it.quantidade) || 0;
    const unit = Number(it.preco_unitario) || 0;
    const sub = Number(it.subtotal ?? qty * unit);
    return [
      String(it.display_label || 'Item').trim(),
      String(qty),
      formatBRL(unit),
      formatBRL(sub),
    ];
  });

  return renderReceiptPdf((ctx) => {
    ctx.drawHeader({
      academyName,
      docTitle: 'Comprovante de venda',
      metaLine: `${saleRef} · ${date} às ${time}`,
    });

    ctx.sectionTitle('Cliente');
    const clientRows = [{ label: 'Nome', value: clientName }];
    if (clientPhone) clientRows.push({ label: 'Telefone', value: clientPhone });
    clientRows.push({ label: 'Canal', value: channelLabel(doc.canal || 'presencial') });
    ctx.keyValueRows(clientRows);

    if (itemRows.length) {
      ctx.divider();
      ctx.sectionTitle('Itens');
      ctx.itemsTable({
        columns: [
          { label: 'PRODUTO', width: CONTENT_W * 0.46 },
          { label: 'QTD', width: CONTENT_W * 0.1, align: 'center' },
          { label: 'UNIT.', width: CONTENT_W * 0.22, align: 'right' },
          { label: 'SUBTOTAL', width: CONTENT_W * 0.22, align: 'right' },
        ],
        rows: itemRows,
      });
    }

    if (pagamentos.length) {
      ctx.divider();
      ctx.paymentRows(pagamentos);
    }

    ctx.divider();
    ctx.totalBox({
      label: 'Total da venda',
      amount: formatBRL(total),
    });

    ctx.footer({
      message: settings.receiptFooter,
      generatedAt: receiptGeneratedAt(),
    });
  });
}

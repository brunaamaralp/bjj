import PDFDocument from 'pdfkit';
import { formatBRL } from '../../src/lib/moneyBr.js';
import { paymentFormLabel } from '../../src/lib/salePayments.js';

/** Paleta alinhada ao app (recibo institucional, sem template editável). */
export const RECEIPT_COLORS = {
  headerBg: '#000435',
  headerText: '#FFFFFF',
  titleMuted: '#C4B5FD',
  body: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  accent: 'var(--petroleo)',
  success: '#166534',
  totalBg: '#EEF2FF',
  totalBorder: '#C7D2FE',
};

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
export const RECEIPT_CONTENT_W = PAGE.width - MARGIN * 2;
const CONTENT_W = RECEIPT_CONTENT_W;

/**
 * @param {(ctx: ReturnType<typeof createReceiptLayout>) => void} draw
 */
export function renderReceiptPdf(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ctx = createReceiptLayout(doc);
    draw(ctx);
    doc.end();
  });
}

function createReceiptLayout(doc) {
  let y = MARGIN;

  const ensureSpace = (height) => {
    if (y + height > PAGE.height - MARGIN - 40) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const rule = (gap = 12) => {
    ensureSpace(gap + 4);
    doc.strokeColor(RECEIPT_COLORS.border).lineWidth(0.75);
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).stroke();
    y += gap;
  };

  return {
    doc,
    get y() {
      return y;
    },

    drawHeader({ academyName, docTitle, metaLine }) {
      const headerH = 88;
      ensureSpace(headerH + 20);
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_W, headerH, 6).fill(RECEIPT_COLORS.headerBg);
      doc.fillColor(RECEIPT_COLORS.headerText);
      doc.font('Helvetica-Bold').fontSize(17);
      doc.text(String(academyName || 'Academia').trim(), MARGIN + 18, y + 16, {
        width: CONTENT_W - 36,
        lineGap: 2,
      });
      doc.font('Helvetica').fontSize(9).fillColor(RECEIPT_COLORS.titleMuted);
      doc.text(String(docTitle || 'COMPROVANTE').toUpperCase(), MARGIN + 18, y + 42, {
        width: CONTENT_W - 36,
        characterSpacing: 1.2,
      });
      if (metaLine) {
        doc.fontSize(8.5).fillColor('#E2E8F0');
        doc.text(metaLine, MARGIN + 18, y + 58, { width: CONTENT_W - 36 });
      }
      doc.restore();
      y += headerH + 20;
    },

    sectionTitle(label) {
      ensureSpace(28);
      doc.fillColor(RECEIPT_COLORS.accent);
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text(String(label).toUpperCase(), MARGIN, y, { characterSpacing: 0.8 });
      y += 16;
    },

    keyValueRows(rows) {
      for (const { label, value } of rows) {
        if (value == null || value === '') continue;
        ensureSpace(20);
        doc.font('Helvetica').fontSize(9).fillColor(RECEIPT_COLORS.muted);
        doc.text(String(label), MARGIN, y, { width: 130 });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(RECEIPT_COLORS.body);
        doc.text(String(value), MARGIN + 132, y, { width: CONTENT_W - 132 });
        y += 18;
      }
      y += 4;
    },

    itemsTable({ columns, rows }) {
      const colWidths = columns.map((c) => c.width);
      const rowH = 22;
      const headerH = 26;
      ensureSpace(headerH + Math.min(rows.length, 12) * rowH + 8);

      doc.save();
      doc.rect(MARGIN, y, CONTENT_W, headerH).fill(RECEIPT_COLORS.surface);
      let x = MARGIN + 10;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(RECEIPT_COLORS.muted);
      for (let i = 0; i < columns.length; i += 1) {
        doc.text(columns[i].label, x, y + 8, {
          width: colWidths[i] - 8,
          align: columns[i].align || 'left',
        });
        x += colWidths[i];
      }
      y += headerH;

      doc.font('Helvetica').fontSize(9).fillColor(RECEIPT_COLORS.body);
      for (let r = 0; r < rows.length; r += 1) {
        ensureSpace(rowH);
        if (r % 2 === 1) {
          doc.rect(MARGIN, y, CONTENT_W, rowH).fill('#FAFAFA');
        }
        x = MARGIN + 10;
        const cells = rows[r];
        for (let i = 0; i < cells.length; i += 1) {
          doc.fillColor(RECEIPT_COLORS.body);
          if (i === cells.length - 1) doc.font('Helvetica-Bold');
          else doc.font('Helvetica');
          doc.text(String(cells[i] ?? ''), x, y + 6, {
            width: colWidths[i] - 8,
            align: columns[i].align || 'left',
            ellipsis: true,
          });
          x += colWidths[i];
        }
        y += rowH;
      }
      doc.restore();
      y += 8;
    },

    paymentRows(pagamentos) {
      if (!pagamentos?.length) return;
      this.sectionTitle('Pagamento');
      for (const p of pagamentos) {
        ensureSpace(36);
        doc.font('Helvetica').fontSize(10).fillColor(RECEIPT_COLORS.body);
        doc.text(paymentFormLabel(p.forma), MARGIN, y, { width: CONTENT_W * 0.55 });
        doc.font('Helvetica-Bold').text(formatBRL(p.valor), MARGIN, y, {
          width: CONTENT_W,
          align: 'right',
        });
        y += 16;
        if (p.forma === 'dinheiro' && Number(p.troco) > 0) {
          const recebido = Number(p.valor) + Number(p.troco);
          doc.font('Helvetica').fontSize(8.5).fillColor(RECEIPT_COLORS.muted);
          doc.text(`Recebido: ${formatBRL(recebido)} · Troco: ${formatBRL(p.troco)}`, MARGIN + 8, y);
          y += 14;
        }
      }
      y += 4;
    },

    totalBox({ label, amount, subtitle }) {
      const boxH = subtitle ? 56 : 48;
      ensureSpace(boxH + 16);
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 4).fill(RECEIPT_COLORS.totalBg);
      doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 4).lineWidth(1).stroke(RECEIPT_COLORS.totalBorder);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(RECEIPT_COLORS.muted);
      doc.text(String(label).toUpperCase(), MARGIN + 16, y + 12, { characterSpacing: 0.6 });
      doc.font('Helvetica-Bold').fontSize(20).fillColor(RECEIPT_COLORS.accent);
      doc.text(String(amount), MARGIN + 16, y + (subtitle ? 24 : 26), {
        width: CONTENT_W - 32,
        align: 'right',
      });
      if (subtitle) {
        doc.font('Helvetica').fontSize(8.5).fillColor(RECEIPT_COLORS.muted);
        doc.text(subtitle, MARGIN + 16, y + 42, { width: CONTENT_W - 32, align: 'right' });
      }
      doc.restore();
      y += boxH + 16;
    },

    bulletList(title, items) {
      if (!items?.length) return;
      this.sectionTitle(title);
      for (const line of items) {
        ensureSpace(18);
        doc.font('Helvetica').fontSize(9).fillColor(RECEIPT_COLORS.body);
        doc.text(`•  ${line}`, MARGIN + 6, y, { width: CONTENT_W - 12 });
        y += 16;
      }
      y += 4;
    },

    noteBlock(text) {
      const t = String(text || '').trim();
      if (!t) return;
      doc.font('Helvetica').fontSize(9);
      const h = doc.heightOfString(t, { width: CONTENT_W - 24, lineGap: 3 });
      ensureSpace(h + 36);
      doc.roundedRect(MARGIN, y, CONTENT_W, h + 32, 4).fill(RECEIPT_COLORS.surface);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(RECEIPT_COLORS.muted);
      doc.text('OBSERVAÇÕES', MARGIN + 12, y + 10);
      doc.font('Helvetica').fontSize(9).fillColor(RECEIPT_COLORS.body);
      doc.text(t, MARGIN + 12, y + 24, { width: CONTENT_W - 24, lineGap: 3 });
      y += h + 40;
    },

    footer({ message, generatedAt }) {
      rule(10);
      const footerMsg = String(message || '').trim();
      if (footerMsg) {
        ensureSpace(30);
        doc.font('Helvetica').fontSize(9).fillColor(RECEIPT_COLORS.body);
        doc.text(footerMsg, MARGIN, y, { width: CONTENT_W, align: 'center', lineGap: 3 });
        y += doc.heightOfString(footerMsg, { width: CONTENT_W }) + 8;
      }
      doc.font('Helvetica').fontSize(7.5).fillColor(RECEIPT_COLORS.muted);
      doc.text(
        `Documento gerado em ${generatedAt} · Nave`,
        MARGIN,
        y,
        { width: CONTENT_W, align: 'center' }
      );
    },

    divider: rule,
  };
}

export function receiptGeneratedAt() {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

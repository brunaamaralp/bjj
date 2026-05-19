import PDFDocument from 'pdfkit';
import { convert } from 'html-to-text';

/** Gera PDF simples a partir de HTML (texto formatado) para envio à Autentique. */
export function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const text = convert(String(html || ''), {
    wordwrap: 90,
    selectors: [
      { selector: 'h1', options: { uppercase: false } },
      { selector: 'h2', options: { uppercase: false } },
      { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
    ],
  }).trim();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(11).text(text || '(documento vazio)', { align: 'left', lineGap: 4 });
    doc.end();
  });
}

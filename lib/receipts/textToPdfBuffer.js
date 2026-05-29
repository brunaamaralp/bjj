import PDFDocument from 'pdfkit';

/** Gera PDF A4 simples a partir de texto plano (comprovantes). */
export function textToPdfBuffer(text) {
  const body = String(text || '').trim() || '(documento vazio)';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(11).text(body, { align: 'left', lineGap: 4 });
    doc.end();
  });
}

import { convert } from 'html-to-text';
import { textToPdfBuffer } from '../receipts/textToPdfBuffer.js';

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

  return textToPdfBuffer(text);
}

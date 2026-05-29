import { PDFDocument } from 'pdf-lib';
import { buildContractPreviewDocument } from './contractPreviewHtml.js';
import { htmlToPdfBuffer } from './htmlToPdf.js';

export interface RenderContractPdfResult {
  buffer: Buffer;
  pageCount: number;
}

async function countPdfPages(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer);
  return doc.getPageCount();
}

function shouldUseChromium(): boolean {
  return process.env.VERCEL === '1' || process.env.CHROMIUM_LOCAL === '1';
}

async function renderWithChromium(html: string): Promise<Buffer> {
  const chromium = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');

  const browser = await puppeteer.default.launch({
    args: chromium.default.args,
    defaultViewport: chromium.default.defaultViewport,
    executablePath: await chromium.default.executablePath(),
    headless: chromium.default.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45_000 });
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '16mm', left: '12mm' },
    });
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}

/** Gera PDF A4 fiel ao HTML do contrato (Chromium em produção; fallback texto em dev). */
export async function renderContractHtmlToPdf(html: string): Promise<RenderContractPdfResult> {
  const docHtml = buildContractPreviewDocument(html, { forPrint: true });

  let buffer: Buffer;
  if (shouldUseChromium()) {
    try {
      buffer = await renderWithChromium(docHtml);
    } catch (err) {
      console.error('[contracts] chromium_pdf_failed', err);
      buffer = await htmlToPdfBuffer(html);
    }
  } else {
    buffer = await htmlToPdfBuffer(html);
  }

  if (!buffer.length) throw new Error('contract_template_render_empty');

  const pageCount = await countPdfPages(buffer);
  return { buffer, pageCount: Math.max(1, pageCount) };
}

export async function countPdfBufferPages(buffer: Buffer): Promise<number> {
  return Math.max(1, await countPdfPages(buffer));
}

import { CONTRACT_SIGNATURE_FOOTER_CSS } from './contractSignatureFooter.js';

const CONTRACT_VAR_TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function highlightContractVariableTokens(html: string): string {
  return String(html || '').replace(CONTRACT_VAR_TOKEN_RE, (match) => {
    return `<span class="contract-var-token" data-contract-var="1">${match}</span>`;
  });
}

export function stripContractVariableHighlights(html: string): string {
  return String(html || '').replace(
    /<span[^>]*\bdata-contract-var=["']1["'][^>]*>([\s\S]*?)<\/span>/gi,
    '$1'
  );
}

const PREVIEW_RESPONSIVE_CSS = `
  html, body {
    margin: 0;
    padding: 12px;
    font-family: Georgia, 'Times New Roman', Times, serif;
    font-size: 14px;
    line-height: 1.6;
    color: var(--cosmos);
    overflow-x: hidden;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  img, table, svg, video, canvas {
    max-width: 100%;
    height: auto;
  }
  table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed;
    border-collapse: collapse;
  }
  td, th {
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  [style*="width"] {
    max-width: 100% !important;
  }
  pre {
    white-space: pre-wrap;
    max-width: 100%;
    overflow-x: auto;
  }
  .contract-var-token {
    display: inline;
    padding: 1px 6px;
    margin: 0 1px;
    border-radius: 4px;
    background: rgba(123, 99, 212, 0.14);
    color: #5b45b5;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
    font-weight: 700;
    border: 1px solid rgba(123, 99, 212, 0.35);
    white-space: nowrap;
  }
  @media print {
    html, body { padding: 0; }
  }
  ${CONTRACT_SIGNATURE_FOOTER_CSS}
`;

export function extractContractPreviewParts(html: string): { body: string; styles: string[] } {
  const raw = String(html || '').trim();
  const styles: string[] = [];

  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(raw)) !== null) {
    styles.push(match[1]);
  }

  let body = raw;
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    body = bodyMatch[1];
  }

  body = body
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .trim();

  return { body, styles };
}

export function prepareVisualEditorHtml(html: string): string {
  const { body, styles } = extractContractPreviewParts(html);
  if (!body && styles.length === 0) return '';
  const styleTag = styles.length > 0 ? `<style>${styles.join('\n')}</style>` : '';
  const normalizedBody = stripContractVariableHighlights(body);
  return `${styleTag}${highlightContractVariableTokens(normalizedBody)}`;
}

function isFullHtmlDocument(html: string): boolean {
  return /<!DOCTYPE|<html[\s>]/i.test(html);
}

export function mergeVisualIntoSource(sourceHtml: string, visualInnerHtml: string): string {
  const source = String(sourceHtml || '').trim();
  const visualParts = extractContractPreviewParts(stripContractVariableHighlights(visualInnerHtml));
  const sourceParts = extractContractPreviewParts(source);

  const styles = visualParts.styles.length > 0 ? visualParts.styles : sourceParts.styles;
  const body = visualParts.body;
  const styleBlock = styles.map((s) => `<style>${s}</style>`).join('\n');

  if (isFullHtmlDocument(source)) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
${styleBlock}
</head>
<body>${body}</body>
</html>`;
  }

  return styleBlock ? `${styleBlock}\n${body}` : body;
}

export function buildContractPreviewDocument(
  html: string,
  opts: { forPrint?: boolean } = {}
): string {
  const { body, styles } = extractContractPreviewParts(html);
  const userCss = styles.join('\n');
  const bodyContent = opts.forPrint
    ? body || '<p><em>(documento vazio)</em></p>'
    : highlightContractVariableTokens(body) || '<p><em>(documento vazio)</em></p>';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${userCss}\n${PREVIEW_RESPONSIVE_CSS}</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

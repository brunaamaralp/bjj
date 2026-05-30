/** Rodapé visual de assinaturas — alinhado aos slots padrão da Autentique (25% / 75%, última página). */

export const CONTRACT_SIGNATURE_FOOTER_ATTR = 'data-contract-signature-footer';

export const CONTRACT_SIGNATURE_FOOTER_CSS = `
.contract-sig-footer {
  display: flex;
  justify-content: space-between;
  gap: 32px;
  margin-top: 56px;
  padding-top: 8px;
  page-break-inside: avoid;
}
.contract-sig-footer__col {
  flex: 1 1 0;
  max-width: 46%;
  text-align: center;
}
.contract-sig-footer__box {
  min-height: 56px;
  margin-bottom: 8px;
  border-bottom: 1px solid #12102a;
}
.contract-sig-footer__label {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.contract-sig-footer__hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #6b6880;
}
@media screen {
  .contract-sig-footer__box {
    border: 2px dashed #8b5cf6;
    border-radius: 6px;
    background: rgba(139, 92, 246, 0.07);
    position: relative;
  }
  .contract-sig-footer__box::after {
    content: 'Assinatura digital';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: #6d28d9;
    font-family: system-ui, sans-serif;
    pointer-events: none;
  }
}
@media print {
  .contract-sig-footer__box {
    border-bottom: 1px solid #12102a;
    border-top: none;
    border-left: none;
    border-right: none;
    border-radius: 0;
    background: transparent;
  }
  .contract-sig-footer__box::after {
    content: none;
  }
}
`;

export type ContractSignatureFooterOptions = {
  leftLabel?: string;
  rightLabel?: string;
  leftHint?: string;
  rightHint?: string;
  includeAcademy?: boolean;
};

export function buildContractSignatureFooterHtml(
  opts: ContractSignatureFooterOptions = {}
): string {
  const leftLabel = String(opts.leftLabel || 'Contratante').trim();
  const rightLabel = String(opts.rightLabel || 'Contratada').trim();
  const leftHint = String(opts.leftHint || 'Aluno ou responsável').trim();
  const rightHint = String(opts.rightHint || 'Academia').trim();
  const includeAcademy = opts.includeAcademy !== false;

  const rightCol = includeAcademy
    ? `<div class="contract-sig-footer__col">
    <div class="contract-sig-footer__box" aria-hidden="true"></div>
    <p class="contract-sig-footer__label">${rightLabel}</p>
    <p class="contract-sig-footer__hint">${rightHint}</p>
  </div>`
    : '';

  return `<style>${CONTRACT_SIGNATURE_FOOTER_CSS}</style>
<div class="contract-sig-footer" ${CONTRACT_SIGNATURE_FOOTER_ATTR}="1">
  <div class="contract-sig-footer__col">
    <div class="contract-sig-footer__box" aria-hidden="true"></div>
    <p class="contract-sig-footer__label">${leftLabel}</p>
    <p class="contract-sig-footer__hint">${leftHint}</p>
  </div>
  ${rightCol}
</div>`;
}

export function hasContractSignatureFooter(html: string): boolean {
  const raw = String(html || '');
  if (raw.includes(CONTRACT_SIGNATURE_FOOTER_ATTR)) return true;
  if (/\bclass=["'][^"']*contract-sig-footer/.test(raw)) return true;
  return false;
}

/** Remove rodapé legado (linha + texto) antes de inserir o bloco padrão. */
export function stripLegacySignatureLines(html: string): string {
  let out = String(html || '');
  out = out.replace(
    /<p>\s*_{5,}\s*<\/p>\s*<p>\s*Assinatura[^<]*<\/p>\s*/gi,
    ''
  );
  return out.trim();
}

export function ensureContractSignatureFooter(
  html: string,
  opts: ContractSignatureFooterOptions = {}
): { html: string; added: boolean } {
  if (hasContractSignatureFooter(html)) {
    return { html: String(html || ''), added: false };
  }
  const cleaned = stripLegacySignatureLines(html);
  const footer = buildContractSignatureFooterHtml(opts);
  const spacer = cleaned ? '\n' : '';
  return { html: `${cleaned}${spacer}${footer}`, added: true };
}

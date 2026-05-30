import { describe, expect, it } from 'vitest';
import {
  buildContractSignatureFooterHtml,
  ensureContractSignatureFooter,
  hasContractSignatureFooter,
  stripLegacySignatureLines,
} from '../../lib/contracts/contractSignatureFooter.js';

describe('contractSignatureFooter', () => {
  it('builds footer with marker attribute', () => {
    const html = buildContractSignatureFooterHtml();
    expect(html).toContain('data-contract-signature-footer="1"');
    expect(html).toContain('Contratante');
    expect(html).toContain('Contratada');
  });

  it('detects existing footer', () => {
    const html = buildContractSignatureFooterHtml();
    expect(hasContractSignatureFooter(html)).toBe(true);
    expect(hasContractSignatureFooter('<p>Sem rodapé</p>')).toBe(false);
  });

  it('appends footer when missing', () => {
    const { html, added } = ensureContractSignatureFooter('<h1>Contrato</h1>');
    expect(added).toBe(true);
    expect(hasContractSignatureFooter(html)).toBe(true);
  });

  it('replaces legacy underscore signature lines', () => {
    const legacy = `<p>Texto</p><p>_________________________________________</p><p>Assinatura do aluno ou responsável</p>`;
    const cleaned = stripLegacySignatureLines(legacy);
    expect(cleaned).not.toContain('_____');
    expect(cleaned).toBe('<p>Texto</p>');
  });
});

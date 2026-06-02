import { describe, it, expect } from 'vitest';
import {
  highlightContractVariableTokens,
  stripContractVariableHighlights,
  prepareVisualEditorHtml,
} from '../../lib/contracts/contractPreviewHtml.js';

describe('contractPreviewHtml', () => {
  it('highlightContractVariableTokens wraps placeholders without contenteditable=false', () => {
    const html = highlightContractVariableTokens('<p>Olá {{nome_aluno}}</p>');
    expect(html).toContain('class="contract-var-token"');
    expect(html).toContain('{{nome_aluno}}');
    expect(html).not.toContain('contenteditable="false"');
  });

  it('prepareVisualEditorHtml does not nest token spans', () => {
    const once = prepareVisualEditorHtml('<p>Plano {{plano}}</p>');
    const twice = prepareVisualEditorHtml(once);
    expect((twice.match(/data-contract-var="1"/g) || []).length).toBe(1);
  });

  it('stripContractVariableHighlights restores plain tokens', () => {
    const highlighted = highlightContractVariableTokens('{{cpf_aluno}}');
    expect(stripContractVariableHighlights(highlighted)).toBe('{{cpf_aluno}}');
  });
});

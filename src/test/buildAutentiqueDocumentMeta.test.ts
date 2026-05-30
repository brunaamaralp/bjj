import { describe, expect, it } from 'vitest';
import {
  buildAutentiqueDocumentName,
  buildAutentiqueSignerMessage,
} from '../../lib/contracts/buildAutentiqueDocumentMeta.js';

describe('buildAutentiqueDocumentMeta', () => {
  it('prefixes academy name when missing', () => {
    expect(
      buildAutentiqueDocumentName({
        academyName: 'Gracie Barra Lagoa da Prata',
        baseName: 'Contrato — Bruna',
      })
    ).toBe('Gracie Barra Lagoa da Prata — Contrato — Bruna');
  });

  it('does not duplicate academy prefix', () => {
    expect(
      buildAutentiqueDocumentName({
        academyName: 'Gracie Barra Lagoa da Prata',
        baseName: 'Gracie Barra Lagoa da Prata — Contrato — Bruna',
      })
    ).toBe('Gracie Barra Lagoa da Prata — Contrato — Bruna');
  });

  it('builds rescission message with academy name', () => {
    const msg = buildAutentiqueSignerMessage({
      academyName: 'Gracie Barra Lagoa da Prata',
      purpose: 'rescission',
    });
    expect(msg).toContain('Gracie Barra Lagoa da Prata');
    expect(msg).toContain('termo de rescisão');
  });

  it('builds enrollment message', () => {
    const msg = buildAutentiqueSignerMessage({
      academyName: 'Academia Teste',
      purpose: 'enrollment',
    });
    expect(msg).toContain('contrato de matrícula');
  });
});

import { describe, it, expect } from 'vitest';
import { financeTxMetadataNormalizationPatch } from '../../lib/server/financeTxFields.js';

describe('financeTxMetadataNormalizationPatch', () => {
  it('returns null when note has no prefixes', () => {
    expect(financeTxMetadataNormalizationPatch({ note: 'Pagamento aluno' })).toBeNull();
  });

  it('extracts category and bank from note prefixes', () => {
    const patch = financeTxMetadataNormalizationPatch({
      note: '@cat:Mensalidade\n@bank:Nubank\nPix recebido',
      type: 'plan',
    });
    expect(patch).not.toBeNull();
    expect(patch.category).toBeTruthy();
    expect(patch.bank_account).toBe('Nubank');
    expect(patch.note).toBe('Pix recebido');
  });

  it('is idempotent when attributes already set', () => {
    const doc = {
      category: 'Mensalidade',
      bank_account: 'Nubank',
      note: 'Sem prefixo',
    };
    expect(financeTxMetadataNormalizationPatch(doc)).toBeNull();
  });
});

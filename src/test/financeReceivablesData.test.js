import { describe, expect, it } from 'vitest';
import { shouldContinueDocumentsPagination } from '../../lib/server/financeReceivablesData.js';

describe('financeReceivablesData pagination', () => {
  it('shouldContinueDocumentsPagination usa tamanho bruto da página', () => {
    expect(shouldContinueDocumentsPagination(100, 100)).toBe(true);
    expect(shouldContinueDocumentsPagination(99, 100)).toBe(false);
    // Página cheia no Appwrite mesmo com poucos grid após filtro → continua
    expect(shouldContinueDocumentsPagination(100, 100)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  resolveBorrowerFromSale,
  resolveBorrowerFromStockMove,
} from '../lib/kimonoLoanBorrower.js';
import { KIMONO_BORROWER_TYPES } from '../lib/kimonoLoanCore.js';

describe('kimonoLoanRecords', () => {
  it('resolveBorrowerFromSale uses student type for student profile sales', () => {
    const b = resolveBorrowerFromSale({
      aluno_id: 'stu1',
      cliente_nome: 'João',
      saleId: 'sale1',
      saleSource: 'student',
    });
    expect(b.borrower_type).toBe(KIMONO_BORROWER_TYPES.STUDENT);
    expect(b.borrower_id).toBe('stu1');
  });

  it('resolveBorrowerFromSale uses client for walk-in PDV', () => {
    const b = resolveBorrowerFromSale({
      aluno_id: null,
      cliente_nome: 'Maria',
      saleId: 'sale2',
      saleSource: 'pos',
    });
    expect(b.borrower_type).toBe(KIMONO_BORROWER_TYPES.CLIENT);
    expect(b.borrower_id).toBe('sale2');
    expect(b.borrower_name).toBe('Maria');
  });

  it('resolveBorrowerFromStockMove reads sale_id from POS move', () => {
    const b = resolveBorrowerFromStockMove({
      $id: 'move1',
      sale_id: 'sale9',
      tipo: 'saida',
      movement_kind: 'rental',
      motivo: 'aluguel',
    });
    expect(b.borrower_type).toBe(KIMONO_BORROWER_TYPES.CLIENT);
    expect(b.borrower_id).toBe('sale9');
  });
});

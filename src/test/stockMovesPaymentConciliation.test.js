import { describe, it, expect } from 'vitest';
import {
  comparePaymentConciliation,
  deriveStatusAtualVenda,
  normalizeSnapshotStatus,
} from '../../lib/server/stockMovesPaymentConciliation.js';

describe('stockMovesPaymentConciliation', () => {
  it('normalizeSnapshotStatus maps paid to settled', () => {
    expect(normalizeSnapshotStatus('paid')).toBe('settled');
    expect(normalizeSnapshotStatus('pending')).toBe('pending');
  });

  it('deriveStatusAtualVenda respects cancelled sale', () => {
    expect(deriveStatusAtualVenda({ $id: 's1', status: 'cancelada' }, [])).toBe('cancelled');
  });

  it('deriveStatusAtualVenda from settled finance tx', () => {
    expect(
      deriveStatusAtualVenda(
        { $id: 's1', status: 'concluida', total: 100 },
        [{ saleId: 's1', type: 'product_sale', status: 'settled' }]
      )
    ).toBe('settled');
  });

  it('comparePaymentConciliation detects settled_after', () => {
    expect(comparePaymentConciliation('pending', 'settled')).toBe('settled_after');
  });

  it('comparePaymentConciliation detects reversed', () => {
    expect(comparePaymentConciliation('paid', 'cancelled')).toBe('reversed');
  });

  it('comparePaymentConciliation ok when aligned', () => {
    expect(comparePaymentConciliation('paid', 'settled')).toBe('ok');
    expect(comparePaymentConciliation('pending', 'pending')).toBe('ok');
  });
});

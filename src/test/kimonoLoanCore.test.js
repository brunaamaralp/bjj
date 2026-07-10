import { describe, it, expect } from 'vitest';
import {
  isKimonoLoanOverdue,
  formatKimonoLoanElapsed,
  isRentalEligibleParent,
  mapKimonoLoanDoc,
  KIMONO_LOAN_STATUS,
} from '../lib/kimonoLoanCore.js';

describe('kimonoLoanCore', () => {
  it('isKimonoLoanOverdue respects hours threshold', () => {
    const now = new Date('2026-07-06T18:00:00.000Z');
    const lent = '2026-07-06T12:00:00.000Z';
    expect(isKimonoLoanOverdue(lent, 4, now)).toBe(true);
    expect(isKimonoLoanOverdue(lent, 8, now)).toBe(false);
  });

  it('formatKimonoLoanElapsed', () => {
    const now = new Date('2026-07-06T13:30:00.000Z');
    expect(formatKimonoLoanElapsed('2026-07-06T12:00:00.000Z', now)).toBe('1h 30min');
  });

  it('isRentalEligibleParent detects kimono by name', () => {
    expect(isRentalEligibleParent({ type: 'both', name: 'Kimono Atama' })).toBe(true);
    expect(isRentalEligibleParent({ type: 'sale', name: 'Faixa' })).toBe(false);
    expect(isRentalEligibleParent({ type: 'rental', name: 'Rashguard' })).toBe(true);
  });

  it('mapKimonoLoanDoc flags overdue active loans', () => {
    const now = new Date('2026-07-06T20:00:00.000Z');
    const mapped = mapKimonoLoanDoc(
      {
        $id: 'loan1',
        academy_id: 'a1',
        variant_id: 'v1',
        borrower_type: 'lead',
        borrower_id: 'l1',
        borrower_name: 'Ana',
        status: KIMONO_LOAN_STATUS.OUT,
        lent_at: '2026-07-06T10:00:00.000Z',
      },
      { overdueHours: 4, now }
    );
    expect(mapped.overdue).toBe(true);
    expect(mapped.elapsed_label).toBeTruthy();
  });
});

import { describe, expect, it } from 'vitest';
import { reverseEligibilityError } from '../../lib/server/financeTxReverse.js';

describe('reverseEligibilityError', () => {
  it('allows settled manual tx', () => {
    expect(reverseEligibilityError({ status: 'settled', type: 'plan' })).toBe('');
  });

  it('blocks pending and cancelled', () => {
    expect(reverseEligibilityError({ status: 'pending' })).toBe('only_settled_can_reverse');
    expect(reverseEligibilityError({ status: 'cancelled' })).toBe('already_cancelled');
    expect(reverseEligibilityError({ status: 'settled', note: 'Estornado · ref abc' })).toBe(
      'already_reversed'
    );
  });

  it('blocks reversal of reversal tx', () => {
    expect(reverseEligibilityError({ status: 'settled', origin_type: 'reversal' })).toBe(
      'cannot_reverse_reversal'
    );
  });

  it('blocks recurrence templates', () => {
    expect(
      reverseEligibilityError({ status: 'settled', is_recurrence_template: true })
    ).toBe('cannot_reverse_recurrence_template');
  });
});

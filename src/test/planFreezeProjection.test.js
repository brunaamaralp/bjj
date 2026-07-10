import { describe, expect, it } from 'vitest';
import { buildFrozenPaymentFields } from '../../lib/planFreezeProjection.js';

describe('buildFrozenPaymentFields', () => {
  it('inclui covered_reason, billing_reference_id e issued_at', () => {
    const fields = buildFrozenPaymentFields({
      leadId: 'stu-1',
      academyId: 'ac-1',
      referenceMonth: '2026-03',
      planName: 'Anual',
      issuedAt: '2026-03-01T10:00:00.000Z',
    });
    expect(fields).toMatchObject({
      status: 'frozen',
      covered_reason: 'freeze',
      billing_reference_id: 'nave:1:ac-1:student:stu-1:2026-03',
      issued_at: '2026-03-01T10:00:00.000Z',
    });
  });
});

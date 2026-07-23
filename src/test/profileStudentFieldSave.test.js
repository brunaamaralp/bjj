import { describe, it, expect, vi } from 'vitest';
import { saveStudentProfileField } from '../lib/profileStudentFieldSave.js';

describe('saveStudentProfileField plan snapshot', () => {
  it('updates planPrice from catalog when plan changes', async () => {
    const updateStudent = vi.fn(async () => ({}));
    await saveStudentProfileField({
      fieldKey: 'plan',
      draftValue: 'Mensal',
      student: { plan: 'Antigo', planPrice: 150 },
      academyId: 'a1',
      studentId: 's1',
      updateStudent,
      financeConfig: { plans: [{ name: 'Mensal', price: 250 }] },
      actorUserId: 'u1',
    });
    expect(updateStudent).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ plan: 'Mensal', planPrice: 250 })
    );
  });
});

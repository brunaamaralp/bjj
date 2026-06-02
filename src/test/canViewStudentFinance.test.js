import { describe, it, expect } from 'vitest';
import { canViewStudentFinance } from '../lib/canViewStudentFinance.js';

describe('canViewStudentFinance', () => {
  const academy = { ownerId: 'owner-1', teamId: 'team-1' };

  it('owner da academia pode ver', () => {
    expect(canViewStudentFinance('owner-1', academy)).toBe(true);
  });

  it('admin do time pode ver', () => {
    expect(
      canViewStudentFinance('admin-1', academy, { roles: ['admin'] })
    ).toBe(true);
  });

  it('recepcionista (member) não pode ver', () => {
    expect(
      canViewStudentFinance('recv-1', academy, { roles: ['member'] })
    ).toBe(false);
  });
});

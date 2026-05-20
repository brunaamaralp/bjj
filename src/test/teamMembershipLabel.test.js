import { describe, it, expect } from 'vitest';
import { membershipPrimaryLabel } from '../lib/teamMembershipLabel.js';

describe('membershipPrimaryLabel', () => {
  it('prefers userName', () => {
    expect(membershipPrimaryLabel({ userName: 'Ana', userEmail: 'a@x.com' })).toBe('Ana');
  });

  it('falls back to email when name hidden', () => {
    expect(membershipPrimaryLabel({ userEmail: 'a@x.com' })).toBe('a@x.com');
  });

  it('falls back to Usuário', () => {
    expect(membershipPrimaryLabel({ userId: 'abc' })).toBe('Usuário');
  });
});

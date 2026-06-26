import { describe, it, expect } from 'vitest';
import { hashInviteToken, generateInviteToken } from './portalInviteCore.js';

describe('portalInviteCore', () => {
  it('hashInviteToken é determinístico', () => {
    const t = 'abc';
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).not.toBe(hashInviteToken('xyz'));
  });

  it('generateInviteToken gera tokens distintos', () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});

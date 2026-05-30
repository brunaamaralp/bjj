import { describe, it, expect } from 'vitest';
import {
  humanizeAutentiqueError,
  isAutentiqueClientError,
} from '../../lib/autentique/humanizeAutentiqueError.ts';

describe('humanizeAutentiqueError', () => {
  it('traduz validation', () => {
    const msg = humanizeAutentiqueError('validation');
    expect(msg).toMatch(/signatários/i);
    expect(isAutentiqueClientError('validation')).toBe(true);
  });
});

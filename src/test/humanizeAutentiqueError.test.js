import { describe, it, expect } from 'vitest';
import {
  humanizeAutentiqueError,
  isAutentiqueClientError,
} from '../../lib/autentique/humanizeAutentiqueError.ts';

describe('humanizeAutentiqueError', () => {
  it('traduz validation com detalhe', () => {
    const msg = humanizeAutentiqueError('validation', [
      {
        message: 'validation',
        extensions: { validation: { 'signers.1.email': ['field_required'] } },
      },
    ]);
    expect(msg).toMatch(/Signatário 2/i);
    expect(isAutentiqueClientError('validation')).toBe(true);
  });
});

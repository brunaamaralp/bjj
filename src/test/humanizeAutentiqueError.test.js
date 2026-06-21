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

  it('traduz falta de token próprio da academia', () => {
    const msg = humanizeAutentiqueError('autentique_not_configured_for_academy');
    expect(msg).toContain('Conecte a conta Autentique da academia');
    expect(isAutentiqueClientError('autentique_not_configured_for_academy')).toBe(true);
  });
});

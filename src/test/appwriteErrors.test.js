import { describe, expect, it } from 'vitest';
import { describeAppwriteError, parseUnknownAttributeFromMessage } from '../lib/appwriteErrors.js';

describe('appwriteErrors', () => {
  it('extrai atributo desconhecido', () => {
    expect(parseUnknownAttributeFromMessage('Unknown attribute: "preferred_payment_account"')).toBe(
      'preferred_payment_account'
    );
  });

  it('mensagem específica para atributo ausente', () => {
    const msg = describeAppwriteError({
      message: 'Unknown attribute: "preferred_payment_account"',
    });
    expect(msg).toContain('Conta habitual');
    expect(msg).toContain('preferred_payment_account');
  });

  it('mensagem específica para tamanho excedido', () => {
    const msg = describeAppwriteError({
      message: 'Invalid document structure: Attribute "preferred_payment_account" has invalid value. Value must be a valid string and no longer than 64 chars',
    });
    expect(msg).toContain('64 caracteres');
  });
});

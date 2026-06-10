import { describe, expect, it } from 'vitest';
import {
  describeAppwriteError,
  getAppwriteDevHint,
  parseUnknownAttributeFromMessage,
} from '../lib/appwriteErrors.js';
import { friendlyError, financeTxFriendlyError } from '../lib/errorMessages.js';

describe('appwriteErrors', () => {
  it('extrai atributo desconhecido', () => {
    expect(parseUnknownAttributeFromMessage('Unknown attribute: "preferred_payment_account"')).toBe(
      'preferred_payment_account'
    );
  });

  it('mensagem amigável para atributo ausente (sem jargão técnico)', () => {
    const msg = describeAppwriteError({
      message: 'Unknown attribute: "preferred_payment_account"',
    });
    expect(msg).toContain('Conta habitual');
    expect(msg).not.toContain('npm run');
    expect(msg).not.toContain('preferred_payment_account');
    expect(msg).not.toContain('coleção');
  });

  it('mantém dica técnica apenas no log de desenvolvimento', () => {
    const hint = getAppwriteDevHint({
      message: 'Unknown attribute: "preferred_payment_account"',
    });
    expect(hint?.attribute).toBe('preferred_payment_account');
    expect(hint?.provision).toContain('provision');
  });

  it('mensagem amigável para tamanho excedido', () => {
    const msg = describeAppwriteError({
      message:
        'Invalid document structure: Attribute "preferred_payment_account" has invalid value. Value must be a valid string and no longer than 64 chars',
    });
    expect(msg).toContain('muito longo');
    expect(msg).not.toContain('64');
  });

  it('financeTxFriendlyError traduz códigos da API', () => {
    expect(financeTxFriendlyError('cannot_settle_cancelled')).toContain('cancelado');
    expect(financeTxFriendlyError('create_failed')).toContain('criar');
  });

  it('friendlyError não expõe mensagem crua do Appwrite', () => {
    const msg = friendlyError(
      { message: 'Unknown attribute: "financeConfig"' },
      'save'
    );
    expect(msg).toContain('financeira');
    expect(msg).not.toContain('Unknown attribute');
  });
});

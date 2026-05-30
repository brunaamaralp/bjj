import { describe, it, expect } from 'vitest';
import { formatAutentiqueValidationDetail } from '../../lib/autentique/parseAutentiqueErrors.ts';
import { validateSignersForAutentique } from '../../lib/contracts/validateSignersForAutentique.ts';
import { ContractFormError } from '../../lib/contracts/validateContractSigners.ts';

describe('formatAutentiqueValidationDetail', () => {
  it('traduz extensions.validation', () => {
    const text = formatAutentiqueValidationDetail([
      {
        message: 'validation',
        extensions: {
          validation: {
            'signers.0.email': ['must_be_a_valid_email_address'],
            'signers.1.email': ['field_required'],
          },
        },
      },
    ]);
    expect(text).toContain('Signatário 1');
    expect(text).toContain('e-mail inválido');
    expect(text).toContain('Signatário 2');
    expect(text).toContain('obrigatório');
  });
});

describe('validateSignersForAutentique', () => {
  it('rejeita e-mails duplicados', () => {
    expect(() =>
      validateSignersForAutentique([
        { name: 'Aluno', email: 'mesmo@test.com', delivery_method: 'DELIVERY_METHOD_EMAIL' },
        { name: 'Academia', email: 'mesmo@test.com', delivery_method: 'DELIVERY_METHOD_EMAIL' },
      ])
    ).toThrow(ContractFormError);
  });
});

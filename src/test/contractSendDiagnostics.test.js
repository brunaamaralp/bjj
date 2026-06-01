import { describe, it, expect } from 'vitest';
import {
  diagnoseContractSend,
  isValidBrazilMobilePhone,
} from '../../lib/contracts/contractSendDiagnostics.ts';

describe('isValidBrazilMobilePhone', () => {
  it('aceita celular BR com 11 dígitos', () => {
    expect(isValidBrazilMobilePhone('19999999999')).toBe(true);
    expect(isValidBrazilMobilePhone('+5519999999999')).toBe(true);
  });

  it('rejeita fixo ou curto', () => {
    expect(isValidBrazilMobilePhone('1933334444')).toBe(false);
    expect(isValidBrazilMobilePhone('99999')).toBe(false);
  });

  it('aceita celular antigo de 10 dígitos', () => {
    expect(isValidBrazilMobilePhone('1987654321')).toBe(true);
  });
});

describe('diagnoseContractSend', () => {
  it('alerta WhatsApp com e-mail preenchido mas telefone inválido', () => {
    const { blockers } = diagnoseContractSend({
      signers: [
        {
          name: 'Aluno',
          email: 'brunaamaralp@hotmail.com',
          phone: '1933334444',
          delivery_method: 'DELIVERY_METHOD_WHATSAPP',
        },
        {
          name: 'Academia',
          email: 'graciebarralagoadaprata@gmail.com',
          delivery_method: 'DELIVERY_METHOD_EMAIL',
        },
      ],
      layout: {
        version: 1,
        slots: [
          { label: 'Contratante', enabled: true },
          { label: 'Contratada', enabled: true },
        ],
      },
    });
    expect(blockers.some((b) => /WhatsApp|celular|E-mail/i.test(b))).toBe(true);
  });

  it('sugere trocar para e-mail quando há e-mail válido em modo WhatsApp', () => {
    const { blockers } = diagnoseContractSend({
      signers: [
        {
          name: 'Aluno',
          email: 'aluno@test.com',
          phone: '1933334444',
          delivery_method: 'DELIVERY_METHOD_WHATSAPP',
        },
      ],
      layout: { version: 1, slots: [{ label: 'Contratante', enabled: true }] },
    });
    expect(blockers.some((b) => /selecione E-mail/i.test(b))).toBe(true);
  });

  it('não bloqueia dois e-mails distintos por e-mail', () => {
    const { blockers } = diagnoseContractSend({
      signers: [
        {
          name: 'Aluno',
          email: 'brunaamaralp@hotmail.com',
          delivery_method: 'DELIVERY_METHOD_EMAIL',
        },
        {
          name: 'Academia',
          email: 'graciebarralagoadaprata@gmail.com',
          delivery_method: 'DELIVERY_METHOD_EMAIL',
        },
      ],
    });
    expect(blockers).toHaveLength(0);
  });
});

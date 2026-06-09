import { describe, it, expect } from 'vitest';
import {
  computeTrocoFromPayForm,
  trocoFieldsForPaymentPayload,
  validateStudentPaymentTroco,
} from '../lib/studentPaymentTroco.js';

describe('studentPaymentTroco', () => {
  it('calcula troco quando recebido > valor', () => {
    expect(
      computeTrocoFromPayForm(
        { method: 'dinheiro', cash_received: 'R$ 150,00' },
        120
      )
    ).toBe(30);
  });

  it('ignora troco para formas que não são dinheiro', () => {
    expect(
      computeTrocoFromPayForm(
        { method: 'pix', cash_received: 'R$ 150,00' },
        120
      )
    ).toBe(0);
  });

  it('rejeita valor recebido menor que mensalidade', () => {
    const out = validateStudentPaymentTroco(
      { method: 'dinheiro', cash_received: 'R$ 50,00' },
      120
    );
    expect(out.ok).toBe(false);
  });

  it('monta payload de troco', () => {
    expect(
      trocoFieldsForPaymentPayload(
        { method: 'dinheiro', cash_received: 'R$ 130,00', formaTroco: 'pix' },
        120
      )
    ).toEqual({ troco: 10, forma_troco: 'pix' });
  });

  it('inclui conta do troco quando há contas cadastradas', () => {
    const financeConfig = {
      bankAccounts: [{ bankName: 'Nubank', account: '1234-5' }],
    };
    expect(
      trocoFieldsForPaymentPayload(
        {
          method: 'dinheiro',
          cash_received: 'R$ 130,00',
          formaTroco: 'pix',
          trocoAccount: 'Nubank · 1234-5',
        },
        120,
        financeConfig
      )
    ).toEqual({
      troco: 10,
      forma_troco: 'pix',
      troco_account: 'Nubank · 1234-5',
    });
  });
});

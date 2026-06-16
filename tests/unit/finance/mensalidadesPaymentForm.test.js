import { describe, it, expect } from 'vitest';
import {
  MENSALIDADES_CREDIT_METHOD,
  isMensalidadesCreditMethod,
  normalizeMensalidadesInstallments,
} from '../../../src/lib/mensalidadesPaymentForm.js';

describe('normalizeMensalidadesInstallments', () => {
  it('crédito mantém parcelas 1–12', () => {
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 3)).toBe(3);
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 12)).toBe(12);
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 1)).toBe(1);
  });

  it('clamp fora do intervalo', () => {
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 0)).toBe(1);
    expect(normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 99)).toBe(12);
  });

  it('não-crédito sempre retorna 1', () => {
    expect(normalizeMensalidadesInstallments('pix', 6)).toBe(1);
    expect(normalizeMensalidadesInstallments('cartão_débito', 3)).toBe(1);
    expect(normalizeMensalidadesInstallments('dinheiro', 12)).toBe(1);
  });
});

describe('isMensalidadesCreditMethod', () => {
  it('reconhece dialect do modal', () => {
    expect(isMensalidadesCreditMethod('cartão_crédito')).toBe(true);
    expect(isMensalidadesCreditMethod('cartao_credito')).toBe(false);
    expect(isMensalidadesCreditMethod('pix')).toBe(false);
  });
});

describe('cross-module parity with paymentStatus', () => {
  it('parcelado 3x alinha com expectedAmountWithCardFee', async () => {
    const { expectedAmountWithCardFee } = await import('../../../src/lib/paymentStatus.js');
    const financeConfig = {
      plans: [{ name: 'Mensal', price: 200, applyCardFee: true }],
      cardFees: {
        credito_avista: { percent: 5 },
        credito_parcelado: { '3': 8 },
      },
    };
    const student = { plan: 'Mensal' };
    const inst = normalizeMensalidadesInstallments(MENSALIDADES_CREDIT_METHOD, 3);
    expect(
      expectedAmountWithCardFee(student, financeConfig, MENSALIDADES_CREDIT_METHOD, inst, null)
    ).toBe(216);
  });
});

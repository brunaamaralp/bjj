import { describe, it, expect } from 'vitest';
import {
  MENSALIDADES_CREDIT_METHOD,
  normalizeMensalidadesInstallments,
} from '../lib/mensalidadesPaymentForm.js';

describe('mensalidadesInstallments — payload contract', () => {
  it('simula payload de createPayment com crédito 3x', () => {
    const payForm = { method: MENSALIDADES_CREDIT_METHOD, installments: 3 };
    const installments = normalizeMensalidadesInstallments(payForm.method, payForm.installments);
    expect(installments).toBe(3);
  });

  it('simula troca crédito → débito', () => {
    const method = 'cartão_débito';
    const installments = normalizeMensalidadesInstallments(method, 6);
    expect(installments).toBe(1);
  });
});

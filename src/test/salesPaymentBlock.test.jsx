import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SalesPaymentBlock from '../components/sales/SalesPaymentBlock.jsx';
import { createEmptyPaymentRow } from '../lib/salePayments.js';

const financeConfigWithCaptureChoices = {
  captureMethods: [
    {
      id: 'cap_stone',
      name: 'Stone',
      paymentMethod: 'cartao_credito',
      active: true,
      maxInstallments: 12,
      useDefaultFees: true,
      fees: {},
    },
    {
      id: 'cap_getnet',
      name: 'Getnet',
      paymentMethod: 'cartao_credito',
      active: true,
      maxInstallments: 6,
      useDefaultFees: true,
      fees: {},
    },
  ],
};

function Harness({ initialPayments, financeConfig = null }) {
  const [payments, setPayments] = useState(initialPayments);
  return (
    <SalesPaymentBlock
      totalCents={30000}
      payments={payments}
      onChange={setPayments}
      disabled={false}
      financeConfig={financeConfig}
    />
  );
}

describe('SalesPaymentBlock', () => {
  it('mostra seletor de parcelas para cartao de credito', () => {
    render(
      <Harness
        initialPayments={[
          {
            ...createEmptyPaymentRow(30000),
            forma: 'cartao_credito',
            installments: 1,
          },
        ]}
      />
    );

    expect(screen.getByLabelText('Parcelas')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Parcelas'), { target: { value: '3' } });
    expect(screen.getByLabelText('Parcelas')).toHaveValue('3');
  });

  it('reseta parcelas para 1 ao trocar de credito para pix', () => {
    render(
      <Harness
        initialPayments={[
          {
            ...createEmptyPaymentRow(30000),
            forma: 'cartao_credito',
            installments: 4,
          },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText('Parcelas'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'pix' } });

    expect(screen.queryByLabelText('Parcelas')).not.toBeInTheDocument();
  });

  it('agrupa recebido via e parcelas em uma segunda linha no credito', () => {
    render(
      <Harness
        financeConfig={financeConfigWithCaptureChoices}
        initialPayments={[
          {
            ...createEmptyPaymentRow(30000),
            forma: 'cartao_credito',
            capture_method_id: 'cap_stone',
            capture_method_name: 'Stone',
            installments: 2,
          },
        ]}
      />
    );

    const parcelas = screen.getByLabelText('Parcelas');
    const recebidoVia = screen.getByLabelText(/Recebido via/i);
    const detailsRow = parcelas.closest('.sales-payment-row__details');

    expect(detailsRow).not.toBeNull();
    expect(recebidoVia.closest('.sales-payment-row__details')).toBe(detailsRow);
    expect(screen.getByLabelText('Forma de pagamento').closest('.sales-payment-row__main')).not.toContainElement(parcelas);
  });
});

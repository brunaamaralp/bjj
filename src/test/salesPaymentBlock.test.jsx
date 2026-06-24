import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SalesPaymentBlock from '../components/sales/SalesPaymentBlock.jsx';
import { createEmptyPaymentRow } from '../lib/salePayments.js';

function Harness({ initialPayments }) {
  const [payments, setPayments] = useState(initialPayments);
  return (
    <SalesPaymentBlock
      totalCents={30000}
      payments={payments}
      onChange={setPayments}
      disabled={false}
      financeConfig={null}
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
});

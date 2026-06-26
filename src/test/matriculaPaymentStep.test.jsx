import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import MatriculaPaymentStep from '../components/MatriculaPaymentStep.jsx';

function StepHarness() {
  const [payForm, setPayForm] = useState({
    payment_type: 'plan',
    reference_month: '2026-06',
    bundle_start_month: '2026-06',
    bundle_months: 12,
    amount: '120,00',
    method: 'pix',
    account: '',
    status: 'paid',
    paid_at: '2026-06-23',
    due_date: '',
    plan_name: 'Mensal',
    note: '',
    capture_method_id: '',
    cash_received: '',
    formaTroco: 'pix',
    trocoAccount: '',
  });
  const [plan, setPlan] = useState('Mensal');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountType, setDiscountType] = useState('none');

  return (
    <MatriculaPaymentStep
      payForm={payForm}
      setPayForm={setPayForm}
      financeConfig={{
        plans: [{ name: 'Mensal', price: 150 }],
        bank_accounts: [{ id: 'caixa', name: 'Caixa' }],
      }}
      academyId="ac1"
      enrollmentPlan={plan}
      onPlanChange={setPlan}
      discountType={discountType}
      discountAmount={discountAmount}
      onDiscountTypeChange={setDiscountType}
      onDiscountChange={setDiscountAmount}
    />
  );
}

describe('MatriculaPaymentStep', () => {
  it('recalculates amount after applying promotional discount on bundle', async () => {
    const user = userEvent.setup();
    render(<StepHarness />);

    await user.selectOptions(screen.getByLabelText('Condição promocional'), 'family');
    await user.click(screen.getByLabelText('Plano com cobertura (anual / pacote)'));

    await waitFor(() => {
      expect(screen.getByLabelText('Valor (R$)')).toHaveValue('139,50');
    });
  });
});

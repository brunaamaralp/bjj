import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentPaymentModal from '../components/student/StudentPaymentModal.jsx';

vi.mock('../hooks/useToast.js', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
  }),
}));

vi.mock('../store/useSalesStore.js', () => ({
  useSalesStore: (selector) => selector({ creating: false }),
}));

vi.mock('../store/useLeadStore.js', () => {
  const state = { financeConfig: { bank_accounts: [{ id: 'caixa', name: 'Caixa' }] } };
  const useLeadStore = Object.assign((selector) => selector(state), { getState: () => state });
  return { useLeadStore };
});

vi.mock('../lib/receiptDownload.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    downloadPaymentReceiptPdf: vi.fn().mockResolvedValue(undefined),
  };
});

const student = { id: 'student-1', name: 'Ana', plan: 'Mensal', plan_price: 200 };
const payForm = {
  payment_type: 'plan',
  reference_month: '2026-08',
  bundle_start_month: '2026-08',
  bundle_months: 12,
  amount: '200,00',
  method: 'pix',
  account: 'Caixa',
  status: 'paid',
  paid_at: '2026-08-10',
  due_date: '',
  plan_name: 'Mensal',
  note: '',
};

describe('StudentPaymentModal recibo', () => {
  it('mostra Baixar recibo depois de confirmar um pagamento elegível', () => {
    render(
      <MemoryRouter>
        <StudentPaymentModal
          open
          student={student}
          academyId="academy-1"
          financeConfig={{ bank_accounts: [{ id: 'caixa', name: 'Caixa' }] }}
          payForm={payForm}
          setPayForm={() => {}}
          saving={false}
          onClose={() => {}}
          onSave={() => {}}
          receiptPayment={{
            $id: 'pay-new',
            status: 'paid',
            amount: 200,
            paid_amount: 200,
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Pagamento registrado' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Baixar recibo/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Registrar' })).toBeNull();
  });
});

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentFinancialTimeline from '../components/student/StudentFinancialTimeline.jsx';

vi.mock('../hooks/useToast.js', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
  }),
}));

vi.mock('../store/useSalesStore.js', () => ({
  useSalesStore: (selector) =>
    selector({
      fetchSaleDetail: vi.fn(),
      cancelSale: vi.fn(),
      cancelling: false,
    }),
}));

vi.mock('../store/useUiStore.js', () => ({
  useUiStore: (selector) => selector({ addToast: vi.fn() }),
}));

vi.mock('../components/sales/SaleDetailModal.jsx', () => ({ default: () => null }));
vi.mock('../components/sales/SalesEditItemModal.jsx', () => ({ default: () => null }));
vi.mock('../components/sales/SalesCancelModal.jsx', () => ({ default: () => null }));

const currentYm = () => new Date().toISOString().slice(0, 7);

function nextYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

describe('StudentFinancialTimeline recibo', () => {
  beforeEach(() => {
    if (!window.matchMedia) {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    }
  });

  it('mostra um único Baixar recibo ao expandir um pacote', async () => {
    const user = userEvent.setup();
    const ym = currentYm();
    const childYm = nextYm(ym);

    render(
      <StudentFinancialTimeline
        student={{ id: 's1', name: 'Ana', plan: 'Anual', status: 'active' }}
        financeConfig={{ plans: [{ name: 'Anual', price: 1200 }] }}
        payments={[
          {
            $id: 'anchor-1',
            payment_category: 'bundle',
            bundle_origin_id: 'anchor-1',
            bundle_months: 2,
            reference_month: ym,
            status: 'paid',
            amount: 400,
            paid_amount: 400,
            paid_at: `${ym}-10T12:00:00.000Z`,
          },
          {
            $id: 'child-1',
            payment_category: 'bundle',
            bundle_origin_id: 'anchor-1',
            reference_month: childYm,
            status: 'covered',
            amount: 0,
          },
        ]}
        sales={[]}
        paymentStatus={{ status: 'paid', payment: null }}
        loading={false}
        error={null}
        canManagePayments
        onEditPayment={() => {}}
        onDeletePayment={() => {}}
        onGoMensalidades={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Mensalidades (0)' }));
    await user.click(screen.getByRole('option', { name: /Planos/ }));

    const row = screen.getByRole('button', { expanded: false, name: /Mensalidade/ });
    await user.click(row);

    expect(screen.getAllByRole('button', { name: /Baixar recibo/i })).toHaveLength(1);
  });
});

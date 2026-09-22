import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardFinancialRemindersBanner from '../components/dashboard/DashboardFinancialRemindersBanner.jsx';

const sections = [
  {
    id: 'payables',
    title: 'Contas a pagar',
    items: [{ id: 'p1', title: 'Hoje: Luz', href: '/financeiro?tab=a-pagar' }],
  },
  {
    id: 'collect',
    title: 'Cobrar alunos',
    items: [{ id: 'c1', title: 'Maria — mensalidade hoje · R$ 180', href: '/student/s1' }],
  },
];

function renderBanner(props = {}) {
  return render(
    <MemoryRouter>
      <DashboardFinancialRemindersBanner sections={sections} canOpenFinance {...props} />
    </MemoryRouter>
  );
}

describe('DashboardFinancialRemindersBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('começa recolhido e só mostra detalhes após clique', async () => {
    const user = userEvent.setup();
    renderBanner();

    const toggle = screen.getByRole('button', { name: /Lembretes financeiros/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Contas a pagar')).not.toBeInTheDocument();
    expect(screen.queryByText('Hoje: Luz')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Contas a pagar')).toBeInTheDocument();
    expect(screen.getByText('Hoje: Luz')).toBeInTheDocument();
  });

  it('não renderiza quando não há itens', () => {
    const { container } = render(
      <MemoryRouter>
        <DashboardFinancialRemindersBanner sections={[]} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BankReconClosingHandoffCard from '../components/finance/BankReconClosingHandoffCard.jsx';

const hintsPending = {
  months: [
    {
      reference_month: '2026-03',
      month_label: 'Março de 2026',
      is_conferred: false,
    },
  ],
  all_conferred: false,
  any_conferred: false,
};

const hintsDone = {
  months: [
    {
      reference_month: '2026-03',
      month_label: 'Março de 2026',
      is_conferred: true,
      closed_at: '2026-04-05T14:00:00.000Z',
    },
  ],
  all_conferred: true,
  any_conferred: true,
};

function renderCard(props) {
  return render(
    <MemoryRouter>
      <BankReconClosingHandoffCard {...props} />
    </MemoryRouter>
  );
}

describe('BankReconClosingHandoffCard', () => {
  it('renderiza CTA para revisar fechamento com link correto', () => {
    renderCard({ closingHints: hintsPending, statementStatus: 'reconciled' });
    const link = screen.getByRole('link', { name: /Revisar fechamento/i });
    expect(link).toHaveAttribute('href', '/financeiro?tab=fechamento&month=2026-03');
  });

  it('mostra estado conferido sem CTA primário de revisão', () => {
    renderCard({ closingHints: hintsDone, statementStatus: 'reconciled' });
    expect(screen.getByText(/Conferido em/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver fechamento/i })).toBeInTheDocument();
  });

  it('exibe aviso quando conciliação ficou partial', () => {
    renderCard({ closingHints: hintsPending, statementStatus: 'partial' });
    expect(screen.getByText(/pendências no extrato/i)).toBeInTheDocument();
  });

  it('chama onDismiss ao clicar Agora não', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderCard({
      closingHints: hintsPending,
      statementStatus: 'reconciled',
      onDismiss,
    });
    await user.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('não renderiza quando dismissed', () => {
    renderCard({ closingHints: hintsPending, dismissed: true });
    expect(screen.queryByText(/Próximo passo/i)).not.toBeInTheDocument();
  });
});

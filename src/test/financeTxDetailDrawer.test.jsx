import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import FinanceTxDetailDrawer from '../components/finance/FinanceTxDetailDrawer.jsx';

vi.mock('../components/finance/FinanceTxRowActions.jsx', () => ({
  default: () => <div data-testid="tx-row-actions">Ações</div>,
}));

const baseTx = {
  id: 'tx-1',
  status: 'settled',
  type: 'plan',
  planName: 'Mensal',
  method: 'pix',
  gross: 350,
  fee: 0,
  net: 350,
  lead_id: 'lead-1',
  lead_name: 'Maria Souza',
  competence_month: '2026-06',
  category: 'Mensalidades',
  settledAt: '2026-06-15T12:00:00.000Z',
};

function renderDrawer(props = {}) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <FinanceTxDetailDrawer
        tx={baseTx}
        leadNameById={new Map()}
        chartAccounts={[]}
        canManageAdvanced
        canAssignBankOnTx={() => false}
        rowBusy={false}
        menuOpenId=""
        onMenuOpenChange={vi.fn()}
        onClose={onClose}
        onEdit={vi.fn()}
        onSettle={vi.fn()}
        onCancel={vi.fn()}
        onReverse={vi.fn()}
        onAssignBank={vi.fn()}
        onEditRecurrence={vi.fn()}
        onCancelRecurrence={vi.fn()}
        recurrenceCancelLoadingId=""
        reverseLoadingId=""
        {...props}
      />
    </MemoryRouter>
  );
  return { onClose };
}

describe('FinanceTxDetailDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing without tx', () => {
    render(
      <MemoryRouter>
        <FinanceTxDetailDrawer tx={null} onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows lead_name and status', () => {
    renderDrawer();
    expect(screen.getByRole('heading', { name: /Detalhes do lançamento/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maria Souza' })).toBeInTheDocument();
    expect(screen.getByText('Liquidado')).toBeInTheDocument();
    expect(screen.getByText('Mensalidades')).toBeInTheDocument();
    expect(screen.getByTestId('tx-row-actions')).toBeInTheDocument();
  });

  it('shows orphan fallback without link when lead missing', () => {
    renderDrawer({
      tx: { ...baseTx, lead_id: 'orphan', lead_name: '' },
    });
    expect(screen.getByText('Aluno não encontrado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aluno não encontrado' })).not.toBeInTheDocument();
  });

  it('calls onClose via close button and Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

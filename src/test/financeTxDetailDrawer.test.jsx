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

const chartAccounts = [
  { id: 'acc-caixa', code: '1.1.1', name: 'Caixa', type: 'ativo', nature: 'devedora' },
  { id: 'acc-receita', code: '4.1.1', name: 'Receita de Vendas', type: 'receita', nature: 'credora' },
];

function renderDrawer(props = {}) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <FinanceTxDetailDrawer
        tx={baseTx}
        academyId="acad-1"
        journalEntries={[]}
        leadNameById={new Map()}
        chartAccounts={chartAccounts}
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
      tx: { ...baseTx, lead_id: '', lead_name: '' },
    });
    const alunoLabel = screen.getByText('Aluno');
    const alunoField = alunoLabel.closest('.task-drawer-field');
    expect(alunoField).toHaveTextContent('—');
    expect(alunoField?.querySelector('button')).toBeNull();
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

  it('shows espelho contábil for settled tx with posted journal', () => {
    const journalEntries = [
      {
        financial_tx_id: 'tx-1',
        memo: 'Liquidação',
        lines: [
          { accountId: 'acc-caixa', debit: 350, credit: 0 },
          { accountId: 'acc-receita', debit: 0, credit: 350 },
        ],
      },
    ];
    renderDrawer({ journalEntries });
    expect(screen.getByRole('heading', { name: /Espelho contábil/i })).toBeInTheDocument();
    expect(screen.getByText('Gravado')).toBeInTheDocument();
    expect(screen.getByText('1.1.1')).toBeInTheDocument();
    expect(screen.getByText('Caixa')).toBeInTheDocument();
    expect(screen.getByText('Receita de Vendas')).toBeInTheDocument();
    expect(screen.getByLabelText('Débito')).toBeInTheDocument();
    expect(screen.getByLabelText('Crédito')).toBeInTheDocument();
    const razaoLink = screen.getByRole('link', { name: /Ver razão/i });
    expect(razaoLink).toBeInTheDocument();
    expect(razaoLink.getAttribute('href')).toContain('from=tx');
    expect(razaoLink.getAttribute('href')).toContain('txId=tx-1');
  });

  it('shows Previsto badge when settled without journal entry', () => {
    renderDrawer({
      tx: { ...baseTx, id: 'tx-prev', status: 'settled' },
      journalEntries: [],
    });
    expect(screen.getByText('Previsto')).toBeInTheDocument();
    expect(screen.getByText(/Ainda não gravado no razão/i)).toBeInTheDocument();
  });

  it('hides espelho contábil for member without advanced access', () => {
    renderDrawer({ canManageAdvanced: false, chartAccounts });
    expect(screen.queryByRole('heading', { name: /Espelho contábil/i })).not.toBeInTheDocument();
  });

  it('shows pending message for unsettled tx', () => {
    renderDrawer({
      tx: { ...baseTx, id: 'tx-p', status: 'pending' },
      journalEntries: [],
    });
    expect(screen.getByText(/Será contabilizado ao liquidar/i)).toBeInTheDocument();
  });
});

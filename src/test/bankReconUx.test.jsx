import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import BankReconSelectionBar from '../components/finance/BankReconSelectionBar.jsx';
import BankReconPairRow from '../components/finance/BankReconPairRow.jsx';

const sampleItem = {
  id: 'item-1',
  date: '2026-01-15',
  description: 'PIX João Silva',
  amount: 150,
  direction: 'credit',
};

describe('BankReconSelectionBar', () => {
  it('shows hint when no item selected', () => {
    render(<BankReconSelectionBar item={null} onClear={() => {}} />);
    expect(screen.getByText(/Clique em uma linha pendente do extrato/i)).toBeInTheDocument();
  });

  it('shows selected item details', () => {
    render(<BankReconSelectionBar item={sampleItem} onClear={() => {}} hasOrphans />);
    expect(screen.getByText(/Linha selecionada/i)).toBeInTheDocument();
    expect(screen.getByText(/PIX João Silva/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Limpar seleção/i })).toBeInTheDocument();
  });
});

describe('BankReconPairRow button hierarchy (unmatched)', () => {
  it('has at most one primary button when manual tx selected', () => {
    render(
      <BankReconPairRow
        item={sampleItem}
        tone="unmatched"
        selected
        manualTxId="tx-1"
        manualTxOptions={[{ value: 'tx-1', label: 'Tx 1' }]}
        onLinkManual={() => {}}
        onCreateTx={() => {}}
        onIgnore={() => {}}
      />
    );
    const actions = document.querySelector('.bank-recon-pair__actions');
    const actionsScope = within(actions);
    const primaryButtons = actions.querySelectorAll('.btn-primary');
    expect(primaryButtons.length).toBe(1);
    expect(primaryButtons[0]).toHaveTextContent(/Vincular/i);
    expect(actionsScope.getByRole('button', { name: /Criar lançamento/i })).toHaveClass('btn-outline');
    expect(actionsScope.getByRole('button', { name: /^Ignorar$/i })).toHaveClass('btn-outline');
  });

  it('shows Selecionada badge when selected', () => {
    render(
      <BankReconPairRow
        item={sampleItem}
        tone="unmatched"
        selected
        manualTxOptions={[]}
      />
    );
    expect(screen.getByText('Selecionada')).toBeInTheDocument();
  });
});

describe('BankReconPairRow suggested confirm', () => {
  it('shows Confirmar when single suggested_tx_candidate exists alongside tx', () => {
    const onConfirm = vi.fn();
    render(
      <BankReconPairRow
        item={{
          ...sampleItem,
          suggested_tx_candidates: [{ tx_id: 'tx-1', score: 80, lead_name: 'João' }],
        }}
        tx={{ id: 'tx-1', gross: 150, settledAt: '2026-01-15', category: 'Mensalidades', lead_name: 'João' }}
        tone="suggested"
        onConfirm={onConfirm}
      />
    );
    const confirmBtn = screen.getByRole('button', { name: /Confirmar/i });
    expect(confirmBtn).toBeInTheDocument();
    expect(confirmBtn).not.toBeDisabled();
  });
});

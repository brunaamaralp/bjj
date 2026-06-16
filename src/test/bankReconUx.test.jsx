import React from 'react';
import { describe, expect, it } from 'vitest';
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

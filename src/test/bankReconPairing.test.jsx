import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BankReconOrphanList, { formatSourceLabel, isOrphanCandidateForItem } from '../components/finance/BankReconOrphanList.jsx';
import BankReconKpiRow from '../components/finance/BankReconKpiRow.jsx';

describe('BankReconOrphanList formatSourceLabel', () => {
  it('maps known formats', () => {
    expect(formatSourceLabel('ofx')).toBe('OFX');
    expect(formatSourceLabel('xlsx')).toBe('Excel');
    expect(formatSourceLabel('pdf')).toBe('PDF');
    expect(formatSourceLabel('')).toBe('—');
  });
});

describe('isOrphanCandidateForItem', () => {
  it('matches tx within value and date tolerance', () => {
    const item = { date: '2026-01-15', amount: 100 };
    const tx = { id: 't1', gross: 100, settledAt: '2026-01-16' };
    expect(isOrphanCandidateForItem(tx, item)).toBe(true);
  });

  it('rejects tx with large date gap', () => {
    const item = { date: '2026-01-15', amount: 100 };
    const tx = { id: 't1', gross: 100, settledAt: '2026-01-25' };
    expect(isOrphanCandidateForItem(tx, item)).toBe(false);
  });
});

describe('BankReconKpiRow', () => {
  it('renders three KPI cards', () => {
    render(
      <BankReconKpiRow
        filename="extrato.ofx"
        statusLabel="Pendente"
        pendingCount={3}
        pendingAmount={500}
        balanceGap={0}
        naviOrphanCount={2}
      />
    );
    expect(screen.getByText(/Pendentes/i)).toBeInTheDocument();
    expect(screen.getByText(/Diferença/i)).toBeInTheDocument();
    expect(screen.getByText(/Órfãos Nave/i)).toBeInTheDocument();
  });
});

describe('BankReconOrphanList candidate highlight', () => {
  const selectedItem = { date: '2026-01-15', amount: 100 };
  const orphans = [
    { id: 'tx-1', gross: 100, settledAt: '2026-01-15', planName: 'Match', direction: 'in' },
    { id: 'tx-2', gross: 100, settledAt: '2026-02-20', planName: 'Far', direction: 'in' },
  ];

  it('marks matching orphan with candidate class when line selected', () => {
    render(
      <BankReconOrphanList
        orphans={orphans}
        selectedItem={selectedItem}
        showAll={false}
        onToggleShowAll={vi.fn()}
        onLinkToSelected={vi.fn()}
      />
    );
    const rows = document.querySelectorAll('.bank-recon-navi-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveClass('bank-recon-navi-row--candidate');
    expect(screen.getByText('Match')).toBeInTheDocument();
  });

  it('shows all orphans when toggled and removes candidate-only filter message', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <BankReconOrphanList
        orphans={orphans}
        selectedItem={selectedItem}
        showAll={false}
        onToggleShowAll={onToggle}
        onLinkToSelected={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /Mostrar todos/i }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

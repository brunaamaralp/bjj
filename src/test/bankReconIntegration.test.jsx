import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ReconciliationTab from '../components/finance/ReconciliationTab.jsx';
import { buildBankReconDetail, mockStatementList } from './fixtures/bankReconDetail.js';
import * as bankApi from '../lib/bankReconciliationApi.js';

const addToast = vi.fn();

vi.mock('../store/useUiStore.js', () => ({
  useUiStore: (sel) => sel({ addToast }),
}));

vi.mock('../lib/financeTxApi.js', () => ({
  reconcileStudentPaymentMirrors: vi.fn(),
}));

vi.mock('../lib/bankReconciliationApi.js', () => ({
  listBankStatements: vi.fn(),
  getBankStatementDetail: vi.fn(),
  confirmBankMatch: vi.fn(),
  confirmAllBankMatches: vi.fn(),
  ignoreBankItem: vi.fn(),
  manualReconcileTx: vi.fn(),
  createTxFromBankItem: vi.fn(),
  completeBankReconciliation: vi.fn(),
}));

function renderRecon() {
  return render(
    <MemoryRouter>
      <ReconciliationTab academyId="acad-1" />
    </MemoryRouter>
  );
}

async function openStatementWorkspace(user) {
  await waitFor(() => expect(screen.getByText('extrato.csv')).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /^Abrir$/i }));
  await waitFor(() => expect(screen.getByText('PIX Cliente')).toBeInTheDocument());
}

describe('ReconciliationTab integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bankApi.listBankStatements.mockResolvedValue(mockStatementList);
    bankApi.getBankStatementDetail.mockResolvedValue(buildBankReconDetail());
    bankApi.confirmBankMatch.mockResolvedValue({ ok: true });
    bankApi.ignoreBankItem.mockResolvedValue({ ok: true });
  });

  it('links orphan to selected bank line and shows success toast', async () => {
    const user = userEvent.setup();
    renderRecon();
    await openStatementWorkspace(user);

    const unmatchedRow = screen.getByText('PIX Cliente').closest('[role="button"]');
    expect(unmatchedRow).toBeTruthy();
    await user.click(unmatchedRow);

    await waitFor(() => {
      const bar = document.querySelector('.bank-recon-selection-bar');
      expect(bar).toHaveTextContent(/PIX Cliente/i);
    });

    const orphanList = document.querySelector('.bank-recon-orphan-list');
    expect(orphanList).toBeTruthy();
    const candidate = orphanList.querySelector('.bank-recon-navi-row--candidate');
    expect(candidate).toBeTruthy();

    const linkBtn = within(candidate).getByRole('button', { name: /Vincular/i });
    await user.click(linkBtn);

    await waitFor(() => {
      expect(bankApi.confirmBankMatch).toHaveBeenCalledWith('acad-1', {
        item_id: 'item-1',
        transaction_id: 'tx-1',
      });
    });

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: expect.stringMatching(/conciliada/i),
        })
      );
    });
  });

  it('opens ConfirmDialog before ignoring a suggested line', async () => {
    const user = userEvent.setup();
    renderRecon();
    await openStatementWorkspace(user);

    const suggestedSection = document.querySelector('.bank-recon-pair--suggested');
    expect(suggestedSection).toBeTruthy();
    const ignoreBtn = within(suggestedSection).getByRole('button', { name: /^Ignorar$/i });
    await user.click(ignoreBtn);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Ignorar linha do extrato/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^Ignorar$/i }));

    await waitFor(() => {
      expect(bankApi.ignoreBankItem).toHaveBeenCalledWith('acad-1', 'item-2');
    });

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', message: expect.stringMatching(/ignorada/i) })
      );
    });
  });

  it('toggles focus pending mode and hides reconciled rows', async () => {
    const user = userEvent.setup();
    renderRecon();
    await openStatementWorkspace(user);

    expect(screen.getByText('PIX antigo')).toBeInTheDocument();

    const focusBtn = screen.getByRole('button', { name: /Focar pendências/i });
    await user.click(focusBtn);

    expect(focusBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('PIX antigo')).not.toBeInTheDocument();
    expect(screen.getByText('PIX Cliente')).toBeInTheDocument();
  });

  it('shows selection bar hint before a line is selected', async () => {
    const user = userEvent.setup();
    renderRecon();
    await openStatementWorkspace(user);

    expect(
      screen.getByText(/Clique em uma linha pendente do extrato para vincular/i)
    ).toBeInTheDocument();
  });
});

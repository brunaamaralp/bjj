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
  rememberBankPayer: vi.fn(),
  confirmAllBankMatches: vi.fn(),
  ignoreBankItem: vi.fn(),
  manualReconcileTx: vi.fn(),
  createTxFromBankItem: vi.fn(),
  completeBankReconciliation: vi.fn(),
}));

vi.mock('../store/useAccountingStore.js', () => {
  const loadByAcademy = vi.fn();
  const store = (sel) => sel({ accounts: [] });
  store.getState = () => ({ loadByAcademy });
  return { useAccountingStore: store };
});

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
  }, 10000);

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

  it('does not show warning banner when statement has a bank account', async () => {
    const user = userEvent.setup();
    // default fixture already has bank_account: 'Sicoob · 1'
    renderRecon();
    await openStatementWorkspace(user);

    expect(screen.queryByText(/não tem conta bancária associada/i)).not.toBeInTheDocument();
  });

  it('shows warning banner for legacy statement without bank account', async () => {
    bankApi.getBankStatementDetail.mockResolvedValue(
      buildBankReconDetail({ statement: { bank_account: '' } })
    );
    const user = userEvent.setup();
    renderRecon();
    await openStatementWorkspace(user);

    expect(screen.getByText(/não tem conta bancária associada/i)).toBeInTheDocument();
  });

  it('shows account label in the KPI header when statement has bank_account', async () => {
    const user = userEvent.setup();
    renderRecon();
    await openStatementWorkspace(user);

    // KPI header should contain the bank account label
    const kpi = document.querySelector('.bank-recon-kpi__header');
    expect(kpi).toHaveTextContent(/Sicoob · 1/i);
  });

  it('opens category modal before creating tx from unmatched line (not silent other)', async () => {
    bankApi.createTxFromBankItem.mockResolvedValue({ ok: true, transaction: { id: 'tx-new' } });
    const user = userEvent.setup();
    renderRecon();
    await openStatementWorkspace(user);

    const unmatchedRow = screen.getByText('PIX Cliente').closest('.bank-recon-pair--unmatched');
    expect(unmatchedRow).toBeTruthy();
    const createBtn = within(unmatchedRow).getByRole('button', { name: /Criar lançamento/i });
    await user.click(createBtn);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /Criar lançamento/i })).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Aporte, empréstimo e transferência não entram no faturamento operacional/i)
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Categoria/i)).toBeInTheDocument();

    const categoryInput = within(dialog).getByLabelText(/Categoria/i);
    await user.click(categoryInput);
    await user.click(screen.getByRole('option', { name: 'Aporte de capital' }));

    await user.click(within(dialog).getByRole('button', { name: /Criar e conciliar/i }));

    await waitFor(() => {
      expect(bankApi.createTxFromBankItem).toHaveBeenCalledWith('acad-1', {
        item_id: 'item-1',
        category: 'Aporte de capital',
      });
    });
  });

  it('does not render incompatible-bank orphan when filtered by backend', async () => {
    // Simulate backend already filtered tx-far (Nubank) out of navi_unmatched
    bankApi.getBankStatementDetail.mockResolvedValue(
      buildBankReconDetail({
        navi_unmatched: [
          {
            id: 'tx-1',
            gross: 100,
            settledAt: '2026-01-15',
            planName: 'Mensalidade João',
            direction: 'in',
            reconciled: false,
          },
          {
            id: 'tx-2',
            gross: 10,
            settledAt: '2026-01-16',
            category: 'Taxa banco',
            direction: 'out',
            reconciled: false,
          },
        ],
      })
    );
    const user = userEvent.setup();
    renderRecon();
    await openStatementWorkspace(user);

    expect(screen.getByText('Mensalidade João')).toBeInTheDocument();
    expect(screen.queryByText('Fora do filtro')).not.toBeInTheDocument();
  });

  it('does not show duplicate lines in Sem correspondência section', async () => {
    bankApi.getBankStatementDetail.mockResolvedValue(
      buildBankReconDetail({
        items: [
          {
            id: 'item-dup',
            date: '2026-01-10',
            description: 'PIX duplicado',
            amount: 100,
            direction: 'credit',
            status: 'duplicate',
          },
          {
            id: 'item-1',
            date: '2026-01-15',
            description: 'PIX Cliente',
            amount: 100,
            direction: 'credit',
            status: 'unmatched',
            match_score: 0,
          },
        ],
        summary: { pending_count: 1, pending_amount: 100, navi_orphan_count: 1 },
      })
    );
    const user = userEvent.setup();
    renderRecon();
    await openStatementWorkspace(user);

    expect(screen.getByText('PIX Cliente')).toBeInTheDocument();
    expect(screen.queryByText('PIX duplicado')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sem correspondência/i)).toBeInTheDocument();
  });
});

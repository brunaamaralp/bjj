import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountsTab from '../components/finance/AccountsTab.jsx';

const addToast = vi.fn();
const listDocuments = vi.fn().mockResolvedValue({ documents: [] });
const createDocument = vi.fn().mockResolvedValue({
  $id: 'new-acc',
  code: '9.9.9',
  name: 'Teste',
  type: 'ativo',
  nature: 'devedora',
  is_active: true,
});

vi.mock('../lib/appwrite.js', () => ({
  databases: {
    listDocuments: (...args) => listDocuments(...args),
    createDocument: (...args) => createDocument(...args),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
  DB_ID: 'db-test',
  ACCOUNTS_COL: 'accounts-col',
}));

vi.mock('../store/useUiStore.js', () => ({
  useUiStore: (sel) => sel({ addToast }),
}));

vi.mock('../hooks/useMatchMobile.js', () => ({
  default: () => false,
}));

vi.mock('../store/useAccountingStore.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAccountingStore: (sel) =>
      sel({
        journal: [],
        accounts: [],
      }),
  };
});

const parentAccount = {
  id: 'p1',
  code: '6.2.5',
  name: 'Despesas custom',
  type: 'despesa',
  nature: 'devedora',
  dreGrupo: 'Despesas Operacionais',
  isActive: true,
};

function Harness({ initialAccounts = [parentAccount] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  return (
    <AccountsTab
      academyId="acad-1"
      accounts={accounts}
      setAccounts={setAccounts}
      addAccount={(acc) => setAccounts((prev) => [...prev, acc])}
      updateAccount={vi.fn()}
      deleteAccount={vi.fn()}
      embedded
    />
  );
}

describe('financeAccountsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocuments.mockResolvedValue({
      documents: [
        {
          $id: 'p1',
          code: '6.2.5',
          name: 'Despesas custom',
          type: 'despesa',
          nature: 'devedora',
          dreGrupo: 'Despesas Operacionais',
          academyId: 'acad-1',
          is_active: true,
        },
      ],
    });
  });

  it(
    'mostra FieldError ao salvar conta sem código e nome',
    async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(await screen.findByRole('button', { name: /Nova conta/i }));

      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^Salvar$/i }));

      await waitFor(() => {
        expect(within(dialog).getByText(/Informe o código da conta/i)).toBeInTheDocument();
        expect(within(dialog).getByText(/Informe o nome da conta/i)).toBeInTheDocument();
      });
      expect(createDocument).not.toHaveBeenCalled();
    },
    15_000
  );

  it('subconta herda tipo, natureza e grupo DRE do pai', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await screen.findByText('Despesas custom');
    await user.click(screen.getByRole('button', { name: /Ações da conta/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Adicionar subconta/i }));

    const dialog = await screen.findByRole('dialog', { name: /Nova subconta de 6\.2\.5/i });
    expect(within(dialog).getByLabelText(/^Tipo/i)).toHaveValue('despesa');
    expect(within(dialog).getByLabelText(/^Natureza/i)).toHaveValue('devedora');
    await user.click(within(dialog).getByRole('button', { name: /DRE \/ DFC/i }));
    expect(within(dialog).getByLabelText(/Grupo DRE/i)).toHaveValue('Despesas Operacionais');
  });
});

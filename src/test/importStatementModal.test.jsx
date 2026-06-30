import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportStatementModal from '../components/finance/ImportStatementModal.jsx';
import * as bankApi from '../lib/bankReconciliationApi.js';
import * as parseXlsx from '../lib/bankStatementParseXlsx.js';
import * as bankParse from '../lib/bankStatementParse.js';

vi.mock('../components/finance/BankAccountSelect.jsx', () => ({
  default: ({ label, onChange }) => (
    <div data-testid="bank-account-select">
      {label}
      <button type="button" data-testid="bank-account-select-pick" onClick={() => onChange?.('Sicoob')}>
        Selecionar Sicoob
      </button>
    </div>
  ),
}));

vi.mock('../lib/bankReconciliationApi.js', () => ({
  importBankStatement: vi.fn(),
  parseBankStatementWithAi: vi.fn(),
}));

vi.mock('../lib/bankStatementParseXlsx.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileAsText: vi.fn(),
    readFileAsBase64: vi.fn(),
    readFileAsArrayBuffer: vi.fn(),
    detectSourceFormat: vi.fn(),
  };
});

vi.mock('../lib/bankStatementParse.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    detectAndParseBankFile: vi.fn(),
  };
});

const csvItems = [
  { date: '2026-01-15', description: 'PIX Alpha', amount: 50, direction: 'credit' },
  { date: '2026-01-16', description: 'PIX Beta', amount: 75, direction: 'debit' },
];

function renderModal(open = true) {
  const onImported = vi.fn();
  const onClose = vi.fn();
  render(
    <ImportStatementModal academyId="acad-1" open={open} onClose={onClose} onImported={onImported} />
  );
  return { onImported, onClose };
}

async function uploadFile(user, name = 'extrato.csv', type = 'text/csv') {
  const input = document.querySelector('input[type="file"]');
  expect(input).toBeTruthy();
  const file = new File(['data'], name, { type });
  await user.upload(input, file);
}

describe('ImportStatementModal integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseXlsx.detectSourceFormat.mockImplementation((filename) => {
      if (String(filename).endsWith('.pdf')) return 'pdf';
      if (String(filename).endsWith('.csv')) return 'csv';
      return 'csv';
    });
    parseXlsx.readFileAsText.mockResolvedValue('data,desc,valor\n2026-01-15,PIX,50');
    bankParse.detectAndParseBankFile.mockReturnValue({
      items: csvItems,
      format: 'csv',
      parse_method: 'deterministic',
    });
    parseXlsx.readFileAsBase64.mockResolvedValue('ZmFrZVBkZg==');
    bankApi.parseBankStatementWithAi.mockResolvedValue({
      items: [{ date: '2026-01-15', description: 'PDF linha', amount: 100, direction: 'credit', low_confidence: true }],
      summary: '2 movimentações',
      warnings: [],
    });
    bankApi.importBankStatement.mockResolvedValue({ statement_id: 'st-new' });
  });

  it('parses CSV upload and reaches review step with editable rows', async () => {
    const user = userEvent.setup();
    renderModal();

    await uploadFile(user);

    await waitFor(() => expect(screen.getByText(/Revisar/i)).toBeInTheDocument());
    expect(screen.getByDisplayValue('PIX Alpha')).toBeInTheDocument();
    expect(screen.getByDisplayValue('PIX Beta')).toBeInTheDocument();
    expect(screen.getByText(/2 de 2 linhas/i)).toBeInTheDocument();
  });

  it('filters preview rows by search query', async () => {
    const user = userEvent.setup();
    renderModal();
    await uploadFile(user);
    await waitFor(() => expect(screen.getByDisplayValue('PIX Alpha')).toBeInTheDocument());

    await user.type(screen.getByRole('searchbox', { name: /Buscar linhas no preview/i }), 'Alpha');

    expect(screen.getByDisplayValue('PIX Alpha')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('PIX Beta')).not.toBeInTheDocument();
    expect(screen.getByText(/1 de 2 linhas/i)).toBeInTheDocument();
  });

  it('auto-runs AI for PDF upload and highlights low confidence rows', async () => {
    const user = userEvent.setup();
    renderModal();

    await uploadFile(user, 'extrato.pdf', 'application/pdf');

    await waitFor(() =>
      expect(bankApi.parseBankStatementWithAi).toHaveBeenCalledWith(
        'acad-1',
        expect.objectContaining({ mode: 'pdf', filename: 'extrato.pdf' })
      )
    );

    await waitFor(() => expect(screen.getByDisplayValue('PDF linha')).toBeInTheDocument());
    expect(screen.getByText(/Revisar linhas destacadas/i)).toBeInTheDocument();
    expect(document.querySelector('.import-statement-row--low')).toBeTruthy();
  });

  it('disables confirm button when no bank account is selected on review step', async () => {
    const user = userEvent.setup();
    renderModal();
    await uploadFile(user);

    await waitFor(() => expect(screen.getByDisplayValue('PIX Alpha')).toBeInTheDocument());

    const confirmBtn = screen.getByRole('button', { name: /Confirmar importação/i });
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByText(/Selecione a conta deste extrato/i)).toBeInTheDocument();
  });

  it('enables confirm button after selecting a bank account', async () => {
    const user = userEvent.setup();
    renderModal();
    await uploadFile(user);

    await waitFor(() => expect(screen.getByDisplayValue('PIX Alpha')).toBeInTheDocument());

    const confirmBtn = screen.getByRole('button', { name: /Confirmar importação/i });
    expect(confirmBtn).toBeDisabled();

    await user.click(screen.getByTestId('bank-account-select-pick'));

    expect(confirmBtn).not.toBeDisabled();
    expect(screen.queryByText(/Selecione a conta deste extrato/i)).not.toBeInTheDocument();
  });

  it('passes full import result to onImported callback', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    render(
      <ImportStatementModal academyId="acad-1" open onClose={vi.fn()} onImported={onImported} />
    );
    await uploadFile(user);
    await waitFor(() => expect(screen.getByDisplayValue('PIX Alpha')).toBeInTheDocument());
    await user.click(screen.getByTestId('bank-account-select-pick'));

    bankApi.importBankStatement.mockResolvedValue({
      statement_id: 'st-new',
      suggested_matches: 2,
      duplicate_count: 3,
      dedup_partial: false,
    });

    await user.click(screen.getByRole('button', { name: /Confirmar importação/i }));

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith('st-new', expect.objectContaining({
        duplicate_count: 3,
        suggested_matches: 2,
      }));
    });
  });

  it('shows StatusBanner when deterministic parse fails', async () => {
    const user = userEvent.setup();
    bankParse.detectAndParseBankFile.mockReturnValue({ items: [], error: 'csv_invalido' });
    renderModal();

    await uploadFile(user);

    await waitFor(() => {
      expect(screen.getByText(/CSV inválido/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Confirmar importação/i })).toBeDisabled();
  });
});

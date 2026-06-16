import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FinanceTxStudentField from '../components/finance/FinanceTxStudentField.jsx';

const searchStudentsForSale = vi.fn();

vi.mock('../lib/studentSaleSearch.js', () => ({
  searchStudentsForSale: (...args) => searchStudentsForSale(...args),
}));

describe('FinanceTxStudentField', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    searchStudentsForSale.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not search before 2 characters', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <FinanceTxStudentField academyId="acad-1" value="" leadId="" onChange={vi.fn()} />
    );
    const input = screen.getByLabelText(/Aluno \(opcional\)/i);
    await user.type(input, 'M');
    vi.advanceTimersByTime(300);
    expect(searchStudentsForSale).not.toHaveBeenCalled();
    expect(screen.getByText(/Digite ao menos 2 caracteres/i)).toBeInTheDocument();
  });

  it('debounces API search and shows suggestions', async () => {
    searchStudentsForSale.mockResolvedValue([
      { $id: 'lead-1', name: 'Maria Silva', phone: '11999998888' },
    ]);
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <FinanceTxStudentField academyId="acad-1" value="" leadId="" onChange={onChange} />
    );
    const input = screen.getByLabelText(/Aluno \(opcional\)/i);
    await user.type(input, 'Ma');
    vi.advanceTimersByTime(280);

    await waitFor(() => {
      expect(searchStudentsForSale).toHaveBeenCalledWith('acad-1', 'Ma', { limit: 12 });
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Maria Silva/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('option', { name: /Maria Silva/i }));
    expect(onChange).toHaveBeenCalledWith({ lead_id: 'lead-1', name: 'Maria Silva' });
  });

  it('shows empty state when API returns no hits', async () => {
    searchStudentsForSale.mockResolvedValue([]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <FinanceTxStudentField academyId="acad-1" value="" leadId="" onChange={vi.fn()} />
    );
    await user.type(screen.getByLabelText(/Aluno \(opcional\)/i), 'zz');
    vi.advanceTimersByTime(280);

    await waitFor(() => {
      expect(screen.getByText(/Nenhum aluno encontrado/i)).toBeInTheDocument();
    });
  });

  it('clears lead when input is emptied', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <FinanceTxStudentField
        academyId="acad-1"
        value="Maria"
        leadId="lead-1"
        onChange={onChange}
      />
    );
    const input = screen.getByLabelText(/Aluno \(opcional\)/i);
    await user.clear(input);
    expect(onChange).toHaveBeenCalledWith({ lead_id: '', name: '' });
  });
});

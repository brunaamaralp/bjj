import React, { useMemo, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchableGroupedSelect from '../components/shared/SearchableGroupedSelect.jsx';
import {
  FINANCE_CATEGORIES,
  defaultCategoryForDirection,
  getCategoryOptionsByNature,
} from '../lib/financeCategories.js';

function TxCategoryHarness({ chartAccounts = [], initialDirection = 'in' }) {
  const [direction, setDirection] = useState(initialDirection);
  const [category, setCategory] = useState(FINANCE_CATEGORIES.MENSALIDADE.label);

  const categoryOptionGroups = useMemo(
    () => getCategoryOptionsByNature(direction === 'out' ? 'out' : 'in', chartAccounts),
    [direction, chartAccounts]
  );

  const handleDirectionChange = (dir) => {
    const cat = defaultCategoryForDirection(dir);
    setDirection(dir);
    setCategory(cat.label);
  };

  return (
    <div>
      <label htmlFor="tx-dir">Tipo</label>
      <select
        id="tx-dir"
        aria-label="Tipo"
        value={direction}
        onChange={(e) => handleDirectionChange(e.target.value === 'out' ? 'out' : 'in')}
      >
        <option value="in">Entrada</option>
        <option value="out">Saída</option>
      </select>
      <SearchableGroupedSelect
        id="finance-tx-category"
        aria-label="Categoria"
        value={category}
        groups={categoryOptionGroups}
        getOptionValue={(c) => c.value || c.label}
        getOptionLabel={(c) => c.label}
        getOptionTitle={(c) => c.title || ''}
        onChange={setCategory}
      />
      <output data-testid="selected-category">{category}</output>
    </div>
  );
}

describe('financeTxCategorySelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('entrada inicia com Mensalidades', () => {
    render(<TxCategoryHarness />);
    expect(screen.getByTestId('selected-category')).toHaveTextContent('Mensalidades');
  });

  it('troca para Saída define Outras despesas', async () => {
    const user = userEvent.setup();
    render(<TxCategoryHarness />);

    await user.selectOptions(screen.getByLabelText('Tipo'), 'out');
    expect(screen.getByTestId('selected-category')).toHaveTextContent('Outras despesas');
  });

  it('ao abrir o select de entrada lista todas as categorias de receita, não só Mensalidades', async () => {
    const user = userEvent.setup();
    render(<TxCategoryHarness />);

    const input = screen.getByLabelText('Categoria');
    await user.click(input);

    expect(screen.getByRole('option', { name: 'Mensalidades' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vendas de produtos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Aluguéis recebidos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Aporte de capital' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Receitas financeiras' })).toBeInTheDocument();
  });

  it('busca por kimono encontra Aluguéis recebidos', async () => {
    render(<TxCategoryHarness />);

    const input = screen.getByLabelText('Categoria');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'kimono' } });

    expect(await screen.findByRole('option', { name: 'Aluguéis recebidos' })).toBeInTheDocument();
  });

  it('dropdown seleciona Aluguéis recebidos', async () => {
    const user = userEvent.setup();
    render(<TxCategoryHarness />);

    const input = screen.getByLabelText('Categoria');
    await user.click(input);
    await user.click(screen.getByRole('option', { name: 'Aluguéis recebidos' }));
    expect(screen.getByTestId('selected-category')).toHaveTextContent('Aluguéis recebidos');
  });

  it('não lista acct:4.1.1 quando duplica Mensalidades', () => {
    const accounts = [
      { code: '4.1.1', name: 'Receita de Vendas', type: 'receita', dreGrupo: 'Receita Bruta', isActive: true },
      { code: '4.1.2', name: 'Mensalidades premium', type: 'receita', dreGrupo: 'Receita Bruta', isActive: true },
    ];
    const groups = getCategoryOptionsByNature('in', accounts);
    const values = [...groups.values()].flat().map((c) => c.value || c.label);
    expect(values).not.toContain('acct:4.1.1');
    expect(values).toContain('acct:4.1.2');
  });
});

import React, { useMemo, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchableGroupedSelect from '../components/shared/SearchableGroupedSelect.jsx';
import {
  FINANCE_CATEGORIES,
  defaultCategoryForDirection,
  FREQUENT_TX_CATEGORY_LABELS,
  getCategoryOptionsByNature,
  resolveFinanceCategory,
} from '../lib/financeCategories.js';
import { loadRecentCategories, mergeRecentWithFrequent } from '../lib/financeRecentCategories.js';

function TxCategoryHarness({ chartAccounts = [], academyId = 'acad-1', initialDirection = 'in' }) {
  const [direction, setDirection] = useState(initialDirection);
  const [category, setCategory] = useState(FINANCE_CATEGORIES.MENSALIDADE.label);

  const categoryOptionGroups = useMemo(
    () => getCategoryOptionsByNature(direction === 'out' ? 'out' : 'in', chartAccounts),
    [direction, chartAccounts]
  );

  const categoryChips = useMemo(() => {
    const dir = direction === 'out' ? 'out' : 'in';
    const recent = loadRecentCategories(academyId);
    const resolveLabel = (value) => resolveFinanceCategory(value, chartAccounts)?.label || value;
    return mergeRecentWithFrequent(recent, FREQUENT_TX_CATEGORY_LABELS[dir], resolveLabel).filter(
      (chip) => resolveFinanceCategory(chip.value, chartAccounts)
    );
  }, [direction, academyId, chartAccounts]);

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
      <div className="finance-tx-category-chips" role="group" aria-label="Categorias frequentes">
        {categoryChips.map((chip) => (
          <button key={chip.value} type="button" onClick={() => setCategory(chip.value)}>
            {chip.label}
          </button>
        ))}
      </div>
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

  it('chips selecionam categoria em um clique', async () => {
    const user = userEvent.setup();
    render(<TxCategoryHarness initialDirection="out" />);

    await user.click(screen.getByRole('button', { name: 'Marketing' }));
    expect(screen.getByTestId('selected-category')).toHaveTextContent('Marketing');
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

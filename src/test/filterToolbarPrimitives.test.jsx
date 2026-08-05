import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterClearAll from '../components/shared/FilterClearAll.jsx';
import FilterTag from '../components/shared/FilterTag.jsx';
import FilterToolbar from '../components/shared/FilterToolbar.jsx';
import FilterChipGroup from '../components/shared/FilterChipGroup.jsx';

describe('FilterClearAll', () => {
  it('labels Limpar for one filter and Limpar tudo for many', () => {
    const { rerender } = render(<FilterClearAll count={1} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /limpar filtros/i })).toHaveTextContent('Limpar');

    rerender(<FilterClearAll count={3} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /limpar filtros/i })).toHaveTextContent('Limpar tudo');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<FilterClearAll count={2} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /limpar filtros/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when count < 1', () => {
    const { container } = render(<FilterClearAll count={0} onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FilterTag', () => {
  it('renders label and removes on click', () => {
    const onRemove = vi.fn();
    render(<FilterTag label="Status: Em atraso" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /remover filtro status: em atraso/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('FilterToolbar', () => {
  it('renders primary, optional active row, and actions with spacer', () => {
    render(
      <FilterToolbar
        primary={<button type="button">Buscar</button>}
        active={<span data-testid="active-row">tags</span>}
        actions={<button type="button">Exportar</button>}
      />
    );
    expect(screen.getByText('Buscar')).toBeTruthy();
    expect(screen.getByTestId('active-row')).toBeTruthy();
    expect(screen.getByText('Exportar')).toBeTruthy();
    expect(document.querySelector('.filter-toolbar__spacer')).not.toBeNull();
  });

  it('hides active row when active is null', () => {
    const { container } = render(<FilterToolbar primary={<span>p</span>} active={null} />);
    expect(container.querySelector('.filter-toolbar__active')).toBeNull();
  });
});

describe('FilterChipGroup', () => {
  it('marks active option and calls onChange', () => {
    const onChange = vi.fn();
    render(
      <FilterChipGroup
        value="ativos"
        onChange={onChange}
        options={[
          { id: 'ativos', label: 'Ativos' },
          { id: 'inativos', label: 'Inativos' },
        ]}
      />
    );
    const active = screen.getByRole('button', { name: 'Ativos' });
    expect(active.className).toMatch(/is-active/);
    expect(active.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Inativos' }));
    expect(onChange).toHaveBeenCalledWith('inativos');
  });
});

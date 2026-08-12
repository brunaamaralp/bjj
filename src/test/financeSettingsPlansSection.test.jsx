import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FinanceSettingsPlansSection from '../components/finance/settings/FinanceSettingsPlansSection.jsx';

function renderSection(props = {}) {
  const onAdd = vi.fn();
  const onUpdate = vi.fn();
  render(
    <MemoryRouter>
      <FinanceSettingsPlansSection
        financeConfig={{ plans: props.plans ?? [{ name: 'Bolsista', price: 0, isExempt: true, applyCardFee: true }] }}
        contractTemplates={[]}
        contractTemplatesConfigured={false}
        rescissionTemplates={[]}
        runEnsureContractSetup={vi.fn()}
        ensureContractSetup={{ isPending: false }}
        onUpdate={onUpdate}
        onAdd={onAdd}
        onRemoveRequest={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
  return { onAdd, onUpdate };
}

describe('FinanceSettingsPlansSection', () => {
  it('exibe plano isento com resumo Isento e checkbox de nao gera cobranca', () => {
    const { onUpdate } = renderSection();

    expect(screen.getByText('Isento')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /bolsista/i }));

    const checkbox = screen.getByLabelText(/este plano n[aã]o gera cobran[cç]a mensal/i);
    expect(checkbox).toBeChecked();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('abre modal ao adicionar e nao cria linha vazia ate confirmar', () => {
    const { onAdd } = renderSection({ plans: [{ name: 'Mensal', price: 200, isExempt: false }] });

    fireEvent.click(screen.getByRole('button', { name: /adicionar plano/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/^nome$/i)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /cancelar/i }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('adiciona plano pelo modal com nome e preco', () => {
    const { onAdd } = renderSection({ plans: [] });

    fireEvent.click(screen.getByRole('button', { name: /adicionar plano/i }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText(/^nome$/i), { target: { value: 'Mensal' } });
    fireEvent.change(within(dialog).getByLabelText(/preço de lista/i), { target: { value: '25000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^adicionar$/i }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Mensal', price: 250, isExempt: false })
    );
  });

  it('lead explica preco de lista vs valor acordado', () => {
    renderSection();
    expect(screen.getByText(/preço de lista/i)).toBeInTheDocument();
    expect(screen.getByText(/valor acordado/i)).toBeInTheDocument();
  });
});

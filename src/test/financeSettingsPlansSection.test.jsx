import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FinanceSettingsPlansSection from '../components/finance/settings/FinanceSettingsPlansSection.jsx';

describe('FinanceSettingsPlansSection', () => {
  it('exibe plano isento com resumo Isento e checkbox de nao gera cobranca', () => {
    const onUpdate = vi.fn();

    render(
      <MemoryRouter>
        <FinanceSettingsPlansSection
          financeConfig={{ plans: [{ name: 'Bolsista', price: 0, isExempt: true, applyCardFee: true }] }}
          contractTemplates={[]}
          contractTemplatesConfigured={false}
          rescissionTemplates={[]}
          runEnsureContractSetup={vi.fn()}
          ensureContractSetup={{ isPending: false }}
          onUpdate={onUpdate}
          onAdd={vi.fn()}
          onRemoveRequest={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Isento')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /bolsista/i }));

    const checkbox = screen.getByLabelText(/este plano n[aã]o gera cobran[cç]a mensal/i);
    expect(checkbox).toBeChecked();
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SalesNewSaleTab from '../components/sales/SalesNewSaleTab.jsx';

vi.mock('../store/useSalesStore', () => ({
  useSalesStore: (selector) =>
    selector({
      createSale: vi.fn(),
      creating: false,
      lastSale: null,
      error: null,
    }),
}));

vi.mock('../store/useLeadStore', () => ({
  useLeadStore: (selector) =>
    selector({
      academyId: 'acad-1',
      financeConfig: { captureMethods: [] },
    }),
}));

vi.mock('../store/useUiStore', () => ({
  useUiStore: (selector) => selector({ addToast: vi.fn() }),
}));

vi.mock('../hooks/useSalesCatalog', () => ({
  useSalesCatalog: () => ({
    products: [],
    loading: false,
    reload: vi.fn(),
    error: null,
  }),
}));

vi.mock('../lib/appwrite', () => ({
  databases: { getDocument: vi.fn().mockRejectedValue(new Error('skip')) },
  DB_ID: 'db',
  ACADEMIES_COL: 'academies',
}));

describe('SalesNewSaleTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('monta sem ReferenceError (TDZ)', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <SalesNewSaleTab pdvMode />
        </MemoryRouter>
      )
    ).not.toThrow();

    expect(screen.getByRole('tab', { name: /Catálogo/i })).toBeTruthy();
  });

  it('monta em modalMode com onSubmitStateChange', () => {
    const onSubmitStateChange = vi.fn();
    render(
      <MemoryRouter>
        <SalesNewSaleTab modalMode onSubmitStateChange={onSubmitStateChange} />
      </MemoryRouter>
    );
    expect(onSubmitStateChange).toHaveBeenCalled();
    expect(screen.getByText(/Checkout/i)).toBeTruthy();
  });
});

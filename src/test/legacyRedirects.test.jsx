import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  CaixaRedirect,
  FinanceRedirect,
  MensalidadesRedirect,
} from '../components/routing/FinanceiroRedirects.jsx';
import {
  PlanosRedirect,
  ContratosRedirect,
  ContratosModelosRedirect,
  TemplatesRedirect,
  LojaTabRedirect,
} from '../components/routing/LegacyRedirects.jsx';

function LocationProbe() {
  const loc = useLocation();
  return (
    <div
      data-testid="location"
      data-pathname={loc.pathname}
      data-search={loc.search}
    />
  );
}

describe('legacy route redirects', () => {
  it('CaixaRedirect maps tab via financeiroLegacyTabToSlug', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/caixa?tab=closing']}>
        <Routes>
          <Route path="/caixa" element={<CaixaRedirect />} />
          <Route path="/financeiro" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-pathname')).toBe('/financeiro');
      expect(el?.getAttribute('data-search')).toBe('?tab=fechamento');
    });
  });

  it('/finance → /empresa?tab=financeiro', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/finance']}>
        <Routes>
          <Route path="/finance" element={<FinanceRedirect />} />
          <Route path="/empresa" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-pathname')).toBe('/empresa');
      expect(el?.getAttribute('data-search')).toBe('?tab=financeiro');
    });
  });

  it('/contratos → /alunos?tab=contratos', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/contratos']}>
        <Routes>
          <Route path="/contratos" element={<ContratosRedirect />} />
          <Route path="/alunos" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-pathname')).toBe('/alunos');
      expect(el?.getAttribute('data-search')).toBe('?tab=contratos');
    });
  });

  it('/contratos?tab=modelos → /empresa?tab=financeiro&section=contratos', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/contratos?tab=modelos']}>
        <Routes>
          <Route path="/contratos" element={<ContratosRedirect />} />
          <Route path="/empresa" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-pathname')).toBe('/empresa');
      expect(el?.getAttribute('data-search')).toBe('?tab=financeiro&section=contratos');
    });
  });

  it('/contratos/modelos → /empresa?tab=financeiro&section=contratos', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/contratos/modelos']}>
        <Routes>
          <Route path="/contratos/modelos" element={<ContratosModelosRedirect />} />
          <Route path="/empresa" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-search')).toBe('?tab=financeiro&section=contratos');
    });
  });

  it('/templates → /automacoes?tab=modelos', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/templates']}>
        <Routes>
          <Route path="/templates" element={<TemplatesRedirect />} />
          <Route path="/automacoes" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-search')).toBe('?tab=modelos');
    });
  });

  it('/planos → /conta?tab=assinatura', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/planos']}>
        <Routes>
          <Route path="/planos" element={<PlanosRedirect />} />
          <Route path="/conta" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-search')).toBe('?tab=assinatura');
    });
  });

  it('/vendas → /loja?tab=vendas', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/vendas']}>
        <Routes>
          <Route path="/vendas" element={<LojaTabRedirect tab="vendas" />} />
          <Route path="/loja" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-search')).toBe('?tab=vendas');
    });
  });

  it('/vendas?tab=history → /loja?tab=vendas&subtab=history', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/vendas?tab=history']}>
        <Routes>
          <Route path="/vendas" element={<LojaTabRedirect tab="vendas" />} />
          <Route path="/loja" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-search')).toBe('?tab=vendas&subtab=history');
    });
  });

  it('/produtos → /loja?tab=produtos', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/produtos']}>
        <Routes>
          <Route path="/produtos" element={<LojaTabRedirect tab="produtos" />} />
          <Route path="/loja" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-search')).toBe('?tab=produtos');
    });
  });

  it('/estoque → /loja?tab=estoque', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/estoque']}>
        <Routes>
          <Route path="/estoque" element={<LojaTabRedirect tab="estoque" />} />
          <Route path="/loja" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-search')).toBe('?tab=estoque');
    });
  });

  it('/profile → /conta', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<Navigate to="/conta" replace />} />
          <Route path="/conta" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-pathname')).toBe('/conta');
    });
  });

  it('/mensalidades → /financeiro?tab=a-receber&section=mensalidades', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/mensalidades?search=joao']}>
        <Routes>
          <Route path="/mensalidades" element={<MensalidadesRedirect />} />
          <Route path="/financeiro" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-pathname')).toBe('/financeiro');
      expect(el?.getAttribute('data-search')).toBe('?tab=a-receber&section=mensalidades&search=joao');
    });
  });
});

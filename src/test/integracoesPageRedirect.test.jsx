import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Integracoes from '../pages/Integracoes.jsx';

function LocationProbe() {
  const location = useLocation();
  return (
    <div
      data-testid="location"
      data-pathname={location.pathname}
      data-search={location.search}
    />
  );
}

describe('Integracoes page redirect', () => {
  it('redireciona para o hub canônico de configurações', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/integracoes']}>
        <Routes>
          <Route path="/integracoes" element={<Integracoes />} />
          <Route path="/configuracoes" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const el = container.querySelector('[data-testid="location"]');
      expect(el?.getAttribute('data-pathname')).toBe('/configuracoes');
      expect(el?.getAttribute('data-search')).toBe('?tab=integracoes&section=whatsapp');
    });
  });
});

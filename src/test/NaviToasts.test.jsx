import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NaviToasts from '../components/NaviToasts.jsx';

const storeState = {
  toasts: [],
  removeToast: vi.fn(),
  pauseToast: vi.fn(),
  resumeToast: vi.fn(),
};

vi.mock('../store/useUiStore.js', () => ({
  useUiStore: (selector) => selector(storeState),
}));

describe('NaviToasts', () => {
  beforeEach(() => {
    storeState.toasts = [];
    storeState.removeToast.mockClear();
  });

  it('usa role="alert" em toast de erro', () => {
    storeState.toasts = [
      {
        id: 'e1',
        type: 'error',
        message: 'Falha ao salvar',
        durationMs: 7000,
        persistent: false,
        removing: false,
      },
    ];
    render(<NaviToasts />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao salvar');
  });

  it('usa role="status" em toast de sucesso', () => {
    storeState.toasts = [
      {
        id: 's1',
        type: 'success',
        message: 'Salvo',
        durationMs: 3000,
        persistent: false,
        removing: false,
      },
    ];
    render(<NaviToasts />);
    expect(screen.getByRole('status')).toHaveTextContent('Salvo');
  });
});

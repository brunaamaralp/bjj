import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useInboxUrlState, readInboxPhoneFromLocationSearch } from '../hooks/useInboxUrlState.js';

const normalizePhone = (v) => String(v || '').replace(/\D/g, '');

function renderUrlStateHook(initialPath, overrides = {}) {
  const selectedPhoneRef = { current: overrides.selectedPhone ?? '' };
  const setSelectedPhone = overrides.setSelectedPhone ?? vi.fn((v) => {
    selectedPhoneRef.current = typeof v === 'function' ? v(selectedPhoneRef.current) : v;
  });
  const location = { search: initialPath.includes('?') ? initialPath.slice(initialPath.indexOf('?')) : '' };

  return renderHook(
    () =>
      useInboxUrlState({
        location,
        selectedPhone: selectedPhoneRef.current,
        setSelectedPhone,
        selectedPhoneRef,
        normalizePhone,
      }),
    {
      wrapper: ({ children }) =>
        React.createElement(MemoryRouter, { initialEntries: [initialPath] }, children),
    }
  );
}

describe('readInboxPhoneFromLocationSearch', () => {
  it('normaliza phone da query string', () => {
    expect(readInboxPhoneFromLocationSearch('?phone=5511999990001', normalizePhone)).toBe('5511999990001');
  });
});

describe('useInboxUrlState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('inicializa listFilter a partir de ?filter= na URL', () => {
    const { result } = renderUrlStateHook('/inbox?filter=unread');
    expect(result.current.listFilter).toBe('unread');
  });

  it('atualiza listFilter quando setListFilter é chamado', () => {
    const { result } = renderUrlStateHook('/inbox');
    act(() => {
      result.current.setListFilter('needs_me');
    });
    expect(result.current.listFilter).toBe('needs_me');
  });
});

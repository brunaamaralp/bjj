import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxLayoutPrefs } from '../hooks/useInboxLayoutPrefs.js';

describe('useInboxLayoutPrefs', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persiste listWidth no localStorage', () => {
    const { result } = renderHook(() => useInboxLayoutPrefs());
    act(() => {
      result.current.setListWidth(400);
    });
    expect(window.localStorage.getItem('inbox_list_width')).toBe('400');
  });

  it('persiste contextOpen no localStorage', () => {
    const { result } = renderHook(() => useInboxLayoutPrefs());
    act(() => {
      result.current.setContextOpen(true);
    });
    expect(window.localStorage.getItem('inbox_context_open')).toBe('1');
  });
});

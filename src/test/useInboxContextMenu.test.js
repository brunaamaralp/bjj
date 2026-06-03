import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxContextMenu } from '../hooks/useInboxContextMenu.js';

describe('useInboxContextMenu', () => {
  it('opens and closes message menu with coordinates', () => {
    const { result } = renderHook(() => useInboxContextMenu());
    const anchor = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 200,
        right: 140,
        bottom: 230,
        width: 40,
        height: 30,
      }),
    };

    act(() => {
      result.current.openMenu('message', anchor, { key: 'k1' });
    });
    expect(result.current.menu?.kind).toBe('message');
    expect(result.current.menu?.payload).toEqual({ key: 'k1' });
    expect(Number(result.current.menu?.x)).toBeGreaterThan(0);

    act(() => {
      result.current.closeMenu();
    });
    expect(result.current.menu).toBeNull();
  });
});

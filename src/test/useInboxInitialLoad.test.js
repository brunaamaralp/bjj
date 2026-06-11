import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInboxInitialLoad } from '../hooks/useInboxInitialLoad.js';

describe('useInboxInitialLoad', () => {
  it('limpa estado local ao trocar de academia', () => {
    const setSelectedPhone = vi.fn();
    const setSelected = vi.fn();
    const setItems = vi.fn();
    const setListCapped = vi.fn();
    const setMsgFlags = vi.fn();
    const messageFlagsMigrationDoneRef = { current: false };
    const notifiedOnceRef = { current: true };
    const inboxAutoSelectDoneRef = { current: true };

    const { rerender } = renderHook(
      ({ academyId }) =>
        useInboxInitialLoad({
          academyId,
          setSelectedPhone,
          setSelected,
          setItems,
          setListCapped,
          setMsgFlags,
          messageFlagsMigrationDoneRef,
          notifiedOnceRef,
          inboxAutoSelectDoneRef,
        }),
      { initialProps: { academyId: 'acad-1' } }
    );

    rerender({ academyId: 'acad-2' });

    expect(setSelectedPhone).toHaveBeenCalledWith('');
    expect(setSelected).toHaveBeenCalledWith(null);
    expect(setItems).toHaveBeenCalledWith([]);
    expect(notifiedOnceRef.current).toBe(false);
    expect(inboxAutoSelectDoneRef.current).toBe(false);
  });

  it('não limpa na primeira montagem com academyId', () => {
    const setItems = vi.fn();

    renderHook(() =>
      useInboxInitialLoad({
        academyId: 'acad-1',
        setSelectedPhone: vi.fn(),
        setSelected: vi.fn(),
        setItems,
        setListCapped: vi.fn(),
        setMsgFlags: vi.fn(),
        messageFlagsMigrationDoneRef: { current: false },
        notifiedOnceRef: { current: false },
        inboxAutoSelectDoneRef: { current: false },
      })
    );

    expect(setItems).not.toHaveBeenCalled();
  });
});

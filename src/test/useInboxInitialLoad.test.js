import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInboxInitialLoad } from '../hooks/useInboxInitialLoad.js';

describe('useInboxInitialLoad', () => {
  it('dispara loadList na montagem quando academyId está definido', () => {
    const loadList = vi.fn();
    const loadListRef = { current: loadList };

    renderHook(() =>
      useInboxInitialLoad({
        academyId: 'acad-1',
        debouncedSearchQuery: '',
        loadListRef,
        setSelectedPhone: vi.fn(),
        setSelected: vi.fn(),
        setItems: vi.fn(),
        setListCapped: vi.fn(),
        setMsgFlags: vi.fn(),
        messageFlagsMigrationDoneRef: { current: false },
        notifiedOnceRef: { current: false },
        inboxAutoSelectDoneRef: { current: false },
      })
    );

    expect(loadList).toHaveBeenCalledWith({ reset: true });
  });

  it('não dispara loadList quando academyId está vazio', () => {
    const loadList = vi.fn();
    const loadListRef = { current: loadList };

    renderHook(() =>
      useInboxInitialLoad({
        academyId: '',
        debouncedSearchQuery: '',
        loadListRef,
        setSelectedPhone: vi.fn(),
        setSelected: vi.fn(),
        setItems: vi.fn(),
        setListCapped: vi.fn(),
        setMsgFlags: vi.fn(),
        messageFlagsMigrationDoneRef: { current: false },
        notifiedOnceRef: { current: false },
        inboxAutoSelectDoneRef: { current: false },
      })
    );

    expect(loadList).not.toHaveBeenCalled();
  });
});

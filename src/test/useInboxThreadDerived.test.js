import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInboxThreadDerived } from '../hooks/useInboxThreadDerived.js';

describe('useInboxThreadDerived', () => {
  it('agrupa flags e mensagens fixadas do telefone selecionado', () => {
    const { result } = renderHook(() =>
      useInboxThreadDerived({
        selectedPhone: '5511999999999',
        selected: {
          messages: [
            { message_id: 'm1', content: 'Olá mundo' },
            { message_id: 'm2', content: 'Outra' },
          ],
        },
        msgFlags: {
          '5511999999999': {
            pinned: { m1: true },
            important: { m2: true },
          },
        },
      })
    );

    expect(result.current.selectedPhoneFlags.pinned).toEqual({ m1: true });
    expect(result.current.selectedPhoneFlags.important).toEqual({ m2: true });
    expect(result.current.pinnedMessages).toEqual([{ key: 'm1', preview: 'Olá mundo' }]);
    expect(result.current.threadBlocks.length).toBeGreaterThan(0);
  });
});

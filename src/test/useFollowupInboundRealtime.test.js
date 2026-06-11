import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const subscribeMock = vi.fn();
const emitMock = vi.fn();

vi.mock('../lib/appwrite.js', () => ({
  realtime: { subscribe: (...args) => subscribeMock(...args) },
  DB_ID: 'db-test',
  CONVERSATIONS_COL: 'conversations',
}));

vi.mock('../lib/leadTimelineEvents.js', () => ({
  emitFollowupInboundChanged: (...args) => emitMock(...args),
}));

import { useFollowupInboundRealtime } from '../hooks/useFollowupInboundRealtime.js';

describe('useFollowupInboundRealtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribeMock.mockReset();
    emitMock.mockReset();
    subscribeMock.mockImplementation((_channel, cb) => {
      subscribeMock._cb = cb;
      return Promise.resolve({ close: vi.fn() });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscreve e emite inbound quando chega mensagem do cliente', async () => {
    const { result } = renderHook(() => useFollowupInboundRealtime('acad-1'));

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(result.current.realtimeOn).toBe(true);

    subscribeMock._cb({
      payload: {
        academy_id: 'acad-1',
        lead_id: 'l1',
        phone_number: '5511999999999',
        last_user_msg_at: '2026-06-11T12:00:00.000Z',
      },
    });

    expect(emitMock).toHaveBeenCalledWith({
      academyId: 'acad-1',
      leadId: 'l1',
      phone: '5511999999999',
      lastUserMsgAt: '2026-06-11T12:00:00.000Z',
    });
  });

  it('ignora evento de outra academia', async () => {
    renderHook(() => useFollowupInboundRealtime('acad-1'));
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    subscribeMock._cb({
      payload: {
        academy_id: 'acad-2',
        last_user_msg_at: '2026-06-11T12:00:00.000Z',
      },
    });

    expect(emitMock).not.toHaveBeenCalled();
  });

  it('não subscreve quando disabled', async () => {
    renderHook(() => useFollowupInboundRealtime('acad-1', { enabled: false }));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(subscribeMock).not.toHaveBeenCalled();
  });
});

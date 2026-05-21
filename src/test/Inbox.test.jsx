import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const inboxMocks = vi.hoisted(() => {
  let waStatus = 'disconnected';
  const subscribe = vi.fn(() => Promise.resolve({ close: vi.fn() }));
  const setInboxUnreadConversations = vi.fn();
  return {
    get waStatus() {
      return waStatus;
    },
    setWaStatus(v) {
      waStatus = v;
    },
    subscribe,
    navigate: vi.fn(),
    setInboxUnreadConversations
  };
});

vi.mock('../hooks/useZapsterWhatsAppConnection.js', () => ({
  useZapsterWhatsAppConnection: () => ({
    waInfo: { instance_id: 'inst-1', status: inboxMocks.waStatus },
    waStatus: inboxMocks.waStatus,
    waSyncing: false,
    waConnected: inboxMocks.waStatus === 'connected',
    reconcileWhatsAppHistory: vi.fn()
  })
}));

vi.mock('../lib/appwrite', () => ({
  account: { createJWT: vi.fn().mockResolvedValue({ jwt: 't' }) },
  realtime: { subscribe: inboxMocks.subscribe },
  DB_ID: 'test-db',
  CONVERSATIONS_COL: 'test-conversations',
  ACADEMIES_COL: 'test-academies',
  databases: {
    listDocuments: vi.fn().mockResolvedValue({ documents: [] }),
    getDocument: vi.fn().mockResolvedValue({}),
    updateDocument: vi.fn().mockResolvedValue({})
  }
}));

vi.mock('../lib/billingBlockedFetch', () => ({
  fetchWithBillingGuard: vi.fn().mockResolvedValue({
    blocked: false,
    res: {
      ok: true,
      text: async () =>
        JSON.stringify({
          sucesso: true,
          items: [],
          next_cursor: '',
          has_more: false
        })
    }
  })
}));

vi.mock('../store/useLeadStore.js', () => {
  const state = {
    fetchLeads: vi.fn(),
    leads: [],
    loading: false,
    academyId: 'acad-1',
    academyList: [{ id: 'acad-1', name: 'Academia', ownerId: 'o1', teamId: 't1' }],
    labels: {},
    userId: 'user-1',
    setInboxUnreadConversations: inboxMocks.setInboxUnreadConversations,
    onboardingChecklist: [],
    completeOnboardingStepIds: vi.fn()
  };
  const useLeadStore = (selector) => selector(state);
  useLeadStore.getState = () => state;
  return { LEAD_STATUS: { NOVO: 'Novo' }, useLeadStore };
});

vi.mock('../lib/useUserRole.js', () => ({
  useUserRole: () => 'owner'
}));

vi.mock('../lib/terminology.js', () => ({
  useTerms: () => ({ workspaceNoun: 'academia' }),
  contactLabelSingular: () => 'Contato'
}));

vi.mock('../lib/useWhatsappTemplates.js', () => ({
  useWhatsappTemplates: () => ({ templates: {}, academyName: 'Academia' })
}));

vi.mock('../store/useUiStore.js', () => ({
  useUiStore: (selector) => selector({ addToast: vi.fn() })
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => inboxMocks.navigate
  };
});

vi.mock('../components/inbox/ConversationList', () => ({
  default: () => <div data-testid="conversation-list" />
}));

vi.mock('../components/inbox/ConversationNotesPanel', () => ({
  default: () => null
}));

vi.mock('../components/inbox/ThreadState', () => ({
  default: () => null
}));

vi.mock('../components/inbox/ThreadSkeleton', () => ({
  default: () => null
}));

vi.mock('../components/shared/EmptyState.jsx', () => ({
  default: () => null
}));

describe('Inbox — banner WhatsApp', () => {
  beforeEach(() => {
    inboxMocks.setWaStatus('disconnected');
    inboxMocks.subscribe.mockClear();
    inboxMocks.navigate.mockClear();
  });

  it('exibe banner desconectado e some ao reconectar', async () => {
    const Inbox = (await import('../pages/Inbox.jsx')).default;

    const { rerender } = render(
      <MemoryRouter initialEntries={['/inbox']}>
        <Inbox />
      </MemoryRouter>
    );

    expect(await screen.findByText(/WhatsApp desconectado/i)).toBeInTheDocument();
    const link = screen.getByRole('button', { name: /Reconectar/i });
    link.click();
    expect(inboxMocks.navigate).toHaveBeenCalledWith('/automacoes?tab=agente');

    inboxMocks.setWaStatus('connected');
    rerender(
      <MemoryRouter initialEntries={['/inbox']}>
        <Inbox />
      </MemoryRouter>
    );

    expect(screen.queryByText(/WhatsApp desconectado/i)).not.toBeInTheDocument();
  });
});

describe('Inbox — Realtime debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    inboxMocks.setWaStatus('connected');
    inboxMocks.subscribe.mockClear();
    inboxMocks.subscribe.mockImplementation(() => Promise.resolve({ close: vi.fn() }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounce de 300ms evita subscribe em desmontagem rápida', async () => {
    const Inbox = (await import('../pages/Inbox.jsx')).default;
    const { unmount } = render(
      <MemoryRouter initialEntries={['/inbox']}>
        <Inbox />
      </MemoryRouter>
    );

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(inboxMocks.subscribe).not.toHaveBeenCalled();
  });

  it('subscribe uma vez após 300ms e close no unmount', async () => {
    const close = vi.fn();
    inboxMocks.subscribe.mockResolvedValueOnce({ close });

    const Inbox = (await import('../pages/Inbox.jsx')).default;
    const { unmount } = render(
      <MemoryRouter initialEntries={['/inbox']}>
        <Inbox />
      </MemoryRouter>
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(inboxMocks.subscribe).toHaveBeenCalledTimes(1);

    unmount();
    expect(close).toHaveBeenCalled();
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NaviInboxShortcut from '../components/chat-widget/NaviInboxShortcut.jsx';
import { useChatWidgetStore } from '../store/useChatWidgetStore';
import { useLeadStore } from '../store/useLeadStore';
import { loadChatWidgetConversations } from '../hooks/useChatWidgetConversationPicker.js';

vi.mock('../hooks/useInboxConversation.js', () => ({
  useInboxConversation: () => ({
    messages: [],
    summary: { lead_name: 'Maria', unread_count: 2, whatsapp_profile_image_url: '' },
    loading: false,
    loadingMore: false,
    sending: false,
    error: null,
    sendError: null,
    hasMore: false,
    loadMore: vi.fn(),
    sendMessage: vi.fn(),
    retryFailedMessage: vi.fn(),
    markRead: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/useZapsterWhatsAppConnection.js', () => ({
  useZapsterWhatsAppConnection: () => ({
    waStatus: 'connected',
    waStatusChecked: true,
  }),
}));

vi.mock('../hooks/useChatWidgetConversationPicker.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useChatWidgetConversationPicker: () => ({
      items: [
        {
          phone: '5511888888888',
          leadId: 'lead-2',
          leadName: 'João',
          unreadCount: 0,
          lastPreview: 'Oi',
          profileImageUrl: '',
          timestamp: '2026-06-10T12:00:00Z',
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
    }),
    loadChatWidgetConversations: vi.fn(),
  };
});

function mockDesktopViewport() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: !query.includes('1023px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function mockMobileViewport() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: query.includes('1023px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function resetStore() {
  useChatWidgetStore.setState({
    academyId: 'acad-1',
    isOpen: false,
    isPinned: false,
    activePhone: '',
    leadId: '',
    leadName: '',
    launcherOpen: false,
    shortcutLoading: false,
  });
  useLeadStore.getState().setInboxUnreadConversations(0);
}

function renderShortcut(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NaviInboxShortcut academyId="acad-1" commandBarOpen={false} />
    </MemoryRouter>
  );
}

describe('NaviInboxShortcut', () => {
  beforeEach(() => {
    resetStore();
    mockDesktopViewport();
    vi.mocked(loadChatWidgetConversations).mockReset();
  });

  it('não renderiza em mobile', () => {
    mockMobileViewport();
    renderShortcut();
    expect(screen.queryByLabelText(/Abrir conversas/i)).not.toBeInTheDocument();
  });

  it('mostra FAB em desktop sem conversa fixada', () => {
    renderShortcut();
    expect(screen.getByLabelText('Abrir conversas')).toBeInTheDocument();
  });

  it('abre launcher quando não há não lidas', async () => {
    const user = userEvent.setup();
    renderShortcut();
    await user.click(screen.getByLabelText('Abrir conversas'));
    expect(useChatWidgetStore.getState().launcherOpen).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Selecionar conversa' })).toBeInTheDocument();
  });

  it('abre conversa não lida direto quando inboxUnread > 0', async () => {
    const user = userEvent.setup();
    useLeadStore.getState().setInboxUnreadConversations(2);
    vi.mocked(loadChatWidgetConversations).mockResolvedValue({
      items: [
        {
          phone: '5511999999999',
          leadId: 'lead-1',
          leadName: 'Maria',
          unreadCount: 2,
          lastPreview: 'Olá',
          profileImageUrl: '',
          timestamp: '2026-06-10T12:00:00Z',
        },
      ],
      blocked: false,
      error: null,
    });

    renderShortcut();
    await user.click(screen.getByLabelText(/Abrir conversas, 2 conversa/));

    await waitFor(() => {
      const s = useChatWidgetStore.getState();
      expect(s.isPinned).toBe(true);
      expect(s.isOpen).toBe(true);
      expect(s.activePhone).toBe('5511999999999');
    });
    expect(screen.getByRole('dialog', { name: /Conversa WhatsApp com Maria/i })).toBeInTheDocument();
  });

  it('faz fallback para launcher quando contador global está desatualizado', async () => {
    const user = userEvent.setup();
    useLeadStore.getState().setInboxUnreadConversations(1);
    vi.mocked(loadChatWidgetConversations).mockResolvedValue({
      items: [
        {
          phone: '5511888888888',
          leadId: 'lead-2',
          leadName: 'João',
          unreadCount: 0,
          lastPreview: 'Oi',
          profileImageUrl: '',
          timestamp: '2026-06-10T12:00:00Z',
        },
      ],
      blocked: false,
      error: null,
    });

    renderShortcut();
    await user.click(screen.getByLabelText(/Abrir conversas, 1 conversa/));

    await waitFor(() => {
      expect(useChatWidgetStore.getState().launcherOpen).toBe(true);
    });
    expect(screen.getByRole('dialog', { name: 'Selecionar conversa' })).toBeInTheDocument();
  });

  it('oculta atalho na rota /inbox', () => {
    renderShortcut('/inbox');
    expect(screen.queryByLabelText(/Abrir conversas/i)).not.toBeInTheDocument();
  });

  it('oculta atalho na rota /lead/:id', () => {
    renderShortcut('/lead/abc123');
    expect(screen.queryByLabelText(/Abrir conversas/i)).not.toBeInTheDocument();
  });

  it('fecha launcher com Escape', async () => {
    const user = userEvent.setup();
    renderShortcut();
    await user.click(screen.getByLabelText('Abrir conversas'));
    expect(useChatWidgetStore.getState().launcherOpen).toBe(true);

    await user.keyboard('{Escape}');
    expect(useChatWidgetStore.getState().launcherOpen).toBe(false);
  });
});

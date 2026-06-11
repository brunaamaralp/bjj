import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NaviChatWidget from '../components/chat-widget/NaviChatWidget.jsx';
import NaviChatWidgetPanel from '../components/chat-widget/NaviChatWidgetPanel.jsx';
import { useChatWidgetStore } from '../store/useChatWidgetStore';

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

vi.mock('../hooks/useChatWidgetConversationPicker.js', () => ({
  useChatWidgetConversationPicker: () => ({
    items: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
  pickerItemMatchesPhone: () => false,
}));

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
}

function renderWidget(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NaviChatWidget academyId="acad-1" commandBarOpen={false} />
    </MemoryRouter>
  );
}

describe('NaviChatWidget', () => {
  beforeEach(() => {
    resetStore();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('não renderiza quando não há conversa fixada', () => {
    renderWidget();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Abrir conversa/i)).not.toBeInTheDocument();
  });

  it('mostra bubble minimizado quando fixado e fechado', () => {
    useChatWidgetStore.getState().pinConversation({
      phone: '5511999999999',
      leadName: 'Maria',
      academyId: 'acad-1',
      openPanel: false,
    });
    renderWidget();
    expect(screen.getByLabelText(/Abrir conversa com Maria/i)).toBeInTheDocument();
  });

  it('mostra painel quando fixado e aberto', () => {
    useChatWidgetStore.getState().pinConversation({
      phone: '5511999999999',
      leadName: 'Maria',
      academyId: 'acad-1',
      openPanel: true,
    });
    renderWidget();
    expect(screen.getByRole('dialog', { name: /Conversa WhatsApp com Maria/i })).toBeInTheDocument();
  });

  it('minimiza painel ao clicar em Minimizar', async () => {
    const user = userEvent.setup();
    useChatWidgetStore.getState().pinConversation({
      phone: '5511999999999',
      leadName: 'Maria',
      academyId: 'acad-1',
      openPanel: true,
    });
    renderWidget();
    await user.click(screen.getByLabelText('Minimizar conversa'));
    expect(useChatWidgetStore.getState().isOpen).toBe(false);
    expect(screen.getByLabelText(/Abrir conversa com Maria/i)).toBeInTheDocument();
  });
});

describe('NaviChatWidgetPanel embedded', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query.includes('1023px'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('mostra ações do cabeçalho no perfil embutido', () => {
    const { container } = render(
      <MemoryRouter>
        <NaviChatWidgetPanel
          academyId="acad-1"
          activePhone="5511999999999"
          leadId="lead-1"
          leadName="Maria"
          embedded
          hideProfileLink
          isMobile
          onMinimize={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Abrir no Inbox')).toBeVisible();
    expect(screen.getByLabelText('Minimizar conversa')).toBeVisible();
    expect(screen.getByLabelText('Fechar conversa fixada')).toBeVisible();
    expect(container.querySelector('.navi-chat-widget__panel--mobile')).toBeNull();
  });
});

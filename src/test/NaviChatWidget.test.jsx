import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NaviChatWidget from '../components/chat-widget/NaviChatWidget.jsx';
import NaviChatWidgetPanel from '../components/chat-widget/NaviChatWidgetPanel.jsx';
import { useChatWidgetStore } from '../store/useChatWidgetStore';

const mockWaConnection = vi.hoisted(() => ({
  waStatus: 'connected',
  waStatusChecked: true,
}));

const mockInboxConversation = vi.hoisted(() => ({
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
}));

vi.mock('../hooks/useInboxConversation.js', () => ({
  useInboxConversation: () => mockInboxConversation,
}));

vi.mock('../hooks/useZapsterWhatsAppConnection.js', () => ({
  useZapsterWhatsAppConnection: () => ({
    waStatus: mockWaConnection.waStatus,
    waStatusChecked: mockWaConnection.waStatusChecked,
  }),
}));

vi.mock('../hooks/useChatWidgetConversationPicker.js', () => ({
  useChatWidgetConversationPicker: () => ({
    items: [
      {
        phone: '5511888888888',
        leadId: 'lead-2',
        leadName: 'João',
        lastPreview: 'Olá',
        timestamp: '2026-06-11T10:00:00.000Z',
        unreadCount: 0,
        profileImageUrl: '',
      },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
  pickerItemMatchesPhone: (item, phone) => String(item?.phone || '') === String(phone || ''),
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
    mockWaConnection.waStatus = 'connected';
    mockWaConnection.waStatusChecked = true;
    mockInboxConversation.messages = [];
    mockInboxConversation.loading = false;
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 280,
      height: 48,
      top: 120,
      left: 40,
      right: 320,
      bottom: 168,
      x: 40,
      y: 120,
      toJSON: () => ({}),
    }));
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

  it('mostra ações do cabeçalho no perfil embutido sem link para o Inbox', () => {
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

    expect(screen.queryByLabelText('Abrir no Inbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Minimizar conversa')).toBeVisible();
    expect(screen.getByLabelText('Fechar conversa fixada')).toBeVisible();
    expect(container.querySelector('.navi-chat-widget__panel--mobile')).toBeNull();
  });

  it('abre seletor de conversas ao clicar em Trocar conversa', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NaviChatWidgetPanel
          academyId="acad-1"
          activePhone="5511999999999"
          leadId="lead-1"
          leadName="Maria"
          embedded
          hideProfileLink
          onMinimize={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /Trocar conversa/i }));
    expect(await screen.findByRole('menu', { name: 'Trocar conversa' })).toBeInTheDocument();
    expect(screen.getByText('João')).toBeInTheDocument();
  });

  it('mostra empty offline quando WhatsApp desconectado e sem mensagens', () => {
    mockWaConnection.waStatus = 'disconnected';
    mockWaConnection.waStatusChecked = true;
    mockInboxConversation.messages = [];

    render(
      <MemoryRouter>
        <NaviChatWidgetPanel
          academyId="acad-1"
          activePhone="5511999999999"
          leadId="lead-1"
          leadName="Maria"
          embedded
          hideProfileLink
          onMinimize={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('WhatsApp não conectado')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conversa ainda')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurar WhatsApp' })).toHaveAttribute('href', '/integracoes?tab=whatsapp');
    expect(screen.getByRole('button', { name: 'Abrir WhatsApp Web' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Digite uma mensagem/i)).not.toBeInTheDocument();
  });

  it('mostra banner e composer desabilitado quando offline com histórico', () => {
    mockWaConnection.waStatus = 'disconnected';
    mockWaConnection.waStatusChecked = true;
    mockInboxConversation.messages = [
      { role: 'user', content: 'Olá', timestamp: '2026-06-11T10:00:00.000Z', message_id: 'm1' },
    ];

    render(
      <MemoryRouter>
        <NaviChatWidgetPanel
          academyId="acad-1"
          activePhone="5511999999999"
          leadId="lead-1"
          leadName="Maria"
          embedded
          hideProfileLink
          onMinimize={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/WhatsApp desconectado — não é possível enviar mensagens/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconectar' })).toHaveAttribute('href', '/integracoes?tab=whatsapp');
    expect(screen.queryByText('WhatsApp não conectado')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Conecte o WhatsApp para enviar mensagens')).toBeDisabled();
  });

  it('não mostra empty offline enquanto status WA não foi verificado', () => {
    mockWaConnection.waStatus = 'disconnected';
    mockWaConnection.waStatusChecked = false;
    mockInboxConversation.messages = [];

    render(
      <MemoryRouter>
        <NaviChatWidgetPanel
          academyId="acad-1"
          activePhone="5511999999999"
          leadId="lead-1"
          leadName="Maria"
          embedded
          hideProfileLink
          onMinimize={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('WhatsApp não conectado')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Digite uma mensagem/i)).not.toBeInTheDocument();
  });
});

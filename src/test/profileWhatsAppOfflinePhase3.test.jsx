import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ProfileWhatsAppOfflineEmptyActions from '../components/profile/ProfileWhatsAppOfflineEmptyActions.jsx';
import ProfileWhatsAppOfflinePanelBanner from '../components/profile/ProfileWhatsAppOfflinePanelBanner.jsx';
import { openExternalUrl } from '../lib/inboxMediaUtils.js';

vi.mock('../lib/inboxMediaUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    openExternalUrl: vi.fn(),
  };
});

describe('ProfileWhatsAppOfflineEmptyActions', () => {
  beforeEach(() => {
    vi.mocked(openExternalUrl).mockClear();
  });

  it('mostra Configurar WhatsApp e wa.me quando há telefone', () => {
    render(
      <MemoryRouter>
        <ProfileWhatsAppOfflineEmptyActions phoneDigits="5511999999999" />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Configurar WhatsApp' })).toHaveAttribute('href', '/agente-ia');
    expect(screen.getByRole('button', { name: 'Abrir WhatsApp Web' })).toBeInTheDocument();
    expect(screen.getByText(/Envio manual — não registra no histórico do app/i)).toBeInTheDocument();
  });

  it('abre wa.me ao clicar em Abrir WhatsApp Web', () => {
    render(
      <MemoryRouter>
        <ProfileWhatsAppOfflineEmptyActions phoneDigits="11999999999" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir WhatsApp Web' }));
    expect(openExternalUrl).toHaveBeenCalledWith('https://wa.me/5511999999999');
  });

  it('omite wa.me quando não há telefone', () => {
    render(
      <MemoryRouter>
        <ProfileWhatsAppOfflineEmptyActions phoneDigits="" />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Configurar WhatsApp' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir WhatsApp Web' })).not.toBeInTheDocument();
  });
});

describe('ProfileWhatsAppOfflinePanelBanner', () => {
  it('mostra mensagem e link Reconectar', () => {
    render(
      <MemoryRouter>
        <ProfileWhatsAppOfflinePanelBanner />
      </MemoryRouter>
    );

    expect(screen.getByText(/WhatsApp desconectado — não é possível enviar mensagens/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconectar' })).toHaveAttribute('href', '/agente-ia');
  });
});

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProfileComunicacaoSection from '../components/profile/ProfileComunicacaoSection.jsx';
import ProfileMobileQuickActions from '../components/profile/ProfileMobileQuickActions.jsx';

describe('ProfileComunicacaoSection', () => {
  it('mostra hint e Abrir Conversa quando WA conectado', () => {
    const onOpenConversation = vi.fn();
    render(
      <MemoryRouter>
        <ProfileComunicacaoSection
          waStatusChecked
          phoneDigits="5511999999999"
          onOpenConversation={onOpenConversation}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Mensagens pelo WhatsApp integrado na aba/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Conversa' }));
    expect(onOpenConversation).toHaveBeenCalledTimes(1);
  });

  it('mostra hint e Abrir Conversa independente do status WA', () => {
    const onOpenConversation = vi.fn();
    render(
      <MemoryRouter>
        <ProfileComunicacaoSection
          waStatusChecked
          onOpenConversation={onOpenConversation}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Mensagens pelo WhatsApp integrado na aba/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Conversa' }));
    expect(onOpenConversation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Configurar WhatsApp' })).not.toBeInTheDocument();
  });
});

describe('ProfileMobileQuickActions', () => {
  it('renderiza botões de ação', () => {
    const onSchedule = vi.fn();
    render(
      <ProfileMobileQuickActions
        actions={[
          { key: 'schedule', label: 'Agendar aula', onClick: onSchedule },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agendar aula' }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });
});

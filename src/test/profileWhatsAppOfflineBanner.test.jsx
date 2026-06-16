import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfileWhatsAppOfflineBanner from '../components/profile/ProfileWhatsAppOfflineBanner.jsx';

describe('ProfileWhatsAppOfflineBanner', () => {
  it('mostra aviso e link para Agente IA', () => {
    render(
      <MemoryRouter>
        <ProfileWhatsAppOfflineBanner className="test-banner" />
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/WhatsApp desconectado/i);
    expect(screen.getByRole('link', { name: 'Conectar WhatsApp' })).toHaveAttribute('href', '/agente-ia');
  });
});

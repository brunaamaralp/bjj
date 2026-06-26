import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MensalidadesWhatsappLink from '../components/finance/MensalidadesWhatsappLink.jsx';

describe('MensalidadesWhatsappLink', () => {
  it('renderiza link wa.me com telefone válido', () => {
    render(<MensalidadesWhatsappLink phone="11987654321" studentName="João" />);
    const link = screen.getByRole('link', { name: /whatsapp — joão/i });
    expect(link).toHaveAttribute('href', 'https://wa.me/5511987654321');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('inclui texto da régua quando stage tem defaultMessage', () => {
    render(
      <MensalidadesWhatsappLink
        phone="11987654321"
        studentName="João"
        stage={{ defaultMessage: 'Olá [nome], tudo bem?' }}
      />
    );
    const link = screen.getByRole('link', { name: /whatsapp/i });
    expect(link.getAttribute('href')).toContain('text=');
    expect(decodeURIComponent(link.getAttribute('href').split('text=')[1])).toBe('Olá João, tudo bem?');
  });

  it('mostra Sem telefone quando inválido', () => {
    render(<MensalidadesWhatsappLink phone="" studentName="João" />);
    expect(screen.getByText('Sem telefone')).toBeInTheDocument();
  });
});

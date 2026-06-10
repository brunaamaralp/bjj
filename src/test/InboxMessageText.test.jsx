import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InboxMessageText from '../components/inbox/InboxMessageText.jsx';

describe('InboxMessageText', () => {
  it('renderiza texto simples', () => {
    render(<InboxMessageText content="Olá mundo" />);
    expect(screen.getByText('Olá mundo')).toBeTruthy();
  });

  it('envolve links recebidos em pill', () => {
    render(
      <InboxMessageText
        content="Veja https://example.com/pagina"
        linkPills
      />
    );
    const link = screen.getByRole('link', { name: /example\.com/i });
    expect(link.getAttribute('href')).toBe('https://example.com/pagina');
    expect(link.className).toContain('inbox-msg-link-pill');
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { contactInitials } from '../lib/contactInitials.js';
import ContactAvatar from '../components/shared/ContactAvatar.jsx';

describe('contactInitials', () => {
  it('usa até duas iniciais', () => {
    expect(contactInitials('Maria Silva')).toBe('MS');
    expect(contactInitials('João')).toBe('J');
    expect(contactInitials('')).toBe('?');
  });
});

describe('ContactAvatar', () => {
  it('mostra iniciais sem avatar_url', () => {
    render(<ContactAvatar contact={{ name: 'Ana Costa' }} size={34} />);
    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('não renderiza img sem avatar_url', () => {
    const { container } = render(<ContactAvatar contact={{ name: 'Pedro' }} size={34} />);
    expect(container.querySelector('img')).toBeNull();
  });
});

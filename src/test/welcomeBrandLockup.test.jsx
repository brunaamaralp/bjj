import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Welcome from '../pages/Welcome.jsx';

describe('Welcome brand lockup', () => {
  it('renders a larger footer logo lockup', () => {
    const { container } = render(
      <MemoryRouter>
        <Welcome />
      </MemoryRouter>
    );

    const footerLockup = container.querySelector('.navi-brand-lockup--lp-footer');
    expect(footerLockup).not.toBeNull();
    expect(footerLockup?.getAttribute('height')).toBe('64');
  });
});

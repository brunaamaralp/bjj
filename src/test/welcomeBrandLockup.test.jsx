import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

  it('keeps a slightly larger sidebar logo on large screens', () => {
    const appSource = readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const cssSource = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(appSource).toContain('NaviBrandLockup height={120} variant="dark" className="navi-brand-lockup--sidebar"');
    expect(cssSource).toContain('height: 120px !important;');
    expect(cssSource).toContain('height: 76px !important;');
  });
});

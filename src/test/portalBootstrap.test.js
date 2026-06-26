import { describe, expect, it } from 'vitest';
import { resolvePostLoginPath } from '../lib/portalBootstrap.js';

describe('portalBootstrap', () => {
  it('redirects portal-only users to /portal', () => {
    expect(resolvePostLoginPath({ portalOnly: true })).toBe('/portal');
    expect(resolvePostLoginPath({ portalOnly: true, requestedPath: '/' })).toBe('/portal');
  });

  it('keeps staff path when not portal-only', () => {
    expect(resolvePostLoginPath({ portalOnly: false, requestedPath: '/' })).toBe('/');
    expect(resolvePostLoginPath({ portalOnly: false, requestedPath: '/alunos' })).toBe('/alunos');
  });

  it('preserves explicit portal path for staff with portal access', () => {
    expect(resolvePostLoginPath({ portalOnly: false, requestedPath: '/portal/financeiro' })).toBe(
      '/portal/financeiro'
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { apiErro, respondApiError } from './friendlyError.js';

describe('respondApiError', () => {
  it('retorna mensagem amigável sem expor erro crudo do Appwrite', () => {
    const jsonFn = vi.fn();
    const res = { status: vi.fn(() => res), json: vi.fn() };
    respondApiError(res, { message: 'Unknown attribute: "foo_bar"' }, {
      tag: 'test/handler',
      context: 'save',
      jsonFn,
    });
    expect(jsonFn).toHaveBeenCalledWith(
      res,
      500,
      expect.objectContaining({
        sucesso: false,
        erro: expect.not.stringContaining('Unknown attribute'),
      })
    );
    expect(apiErro({ message: 'Unknown attribute: "foo_bar"' }, 'save')).not.toContain('foo_bar');
  });
});

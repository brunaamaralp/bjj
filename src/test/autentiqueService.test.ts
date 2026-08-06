import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, signDocument } from '../../lib/autentique/autentiqueService.ts';

describe('autentiqueService', () => {
  const originalToken = process.env.AUTENTIQUE_TOKEN;
  const originalApiToken = process.env.AUTENTIQUE_API_TOKEN;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.AUTENTIQUE_TOKEN;
    else process.env.AUTENTIQUE_TOKEN = originalToken;

    if (originalApiToken === undefined) delete process.env.AUTENTIQUE_API_TOKEN;
    else process.env.AUTENTIQUE_API_TOKEN = originalApiToken;
  });

  it('não usa token global do ambiente quando a academia não tem token próprio', async () => {
    process.env.AUTENTIQUE_TOKEN = 'token-global';
    process.env.AUTENTIQUE_API_TOKEN = 'token-global-api';
    const fetchSpy = vi.mocked(fetch);

    await expect(
      createDocument(
        {
          name: 'Contrato teste',
          file: Buffer.from('pdf'),
          signers: [{ email: 'aluno@x.com', action: 'SIGN' }],
        },
        { settings: JSON.stringify({ autentique: { enabled: true, account_email: '' } }) }
      )
    ).rejects.toThrow('autentique_not_configured_for_academy');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aceita signDocument Boolean da Autentique (API oficial retorna true)', async () => {
    const academyDoc = {
      autentique_token: 'tok-academia',
      settings: JSON.stringify({
        autentique: { enabled: true, account_email: 'owner@academia.com' },
      }),
    };
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { signDocument: true } }),
    } as Response);

    const result = await signDocument('doc-uuid-1', academyDoc);

    expect(result).toEqual({ ok: true });
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || '{}'));
    expect(body.query).toContain('signDocument');
    expect(body.query).not.toMatch(/signDocument\([^)]*\)\s*\{/);
    expect(body.variables).toEqual({ id: 'doc-uuid-1' });
  });

  it('rejeita signDocument quando Autentique retorna false', async () => {
    const academyDoc = {
      autentique_token: 'tok-academia',
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { signDocument: false } }),
    } as Response);

    await expect(signDocument('doc-uuid-2', academyDoc)).rejects.toThrow(
      'autentique_sign_rejected'
    );
  });
});
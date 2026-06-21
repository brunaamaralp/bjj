import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../lib/autentique/autentiqueService.ts';

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
});

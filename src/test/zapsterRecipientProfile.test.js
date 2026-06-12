import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pickProfilePictureFromRecipientPayload,
  fetchZapsterRecipientProfile,
  fetchZapsterRecipientProfilePicture,
} from '../../lib/server/zapsterRecipientProfile.js';

describe('pickProfilePictureFromRecipientPayload', () => {
  it('lê profile_picture da resposta Zapster', () => {
    expect(
      pickProfilePictureFromRecipientPayload({
        profile_picture: 'https://zapsterapi.s3.us-east-1.amazonaws.com/pic.jpg',
      })
    ).toBe('https://zapsterapi.s3.us-east-1.amazonaws.com/pic.jpg');
  });

  it('ignora null e strings vazias', () => {
    expect(pickProfilePictureFromRecipientPayload({ profile_picture: null })).toBe('');
    expect(pickProfilePictureFromRecipientPayload({ profile_picture: '' })).toBe('');
  });
});

describe('fetchZapsterRecipientProfile', () => {
  beforeEach(() => {
    process.env.ZAPSTER_API_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna foto e nome quando a API responde ok', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: '5511999887766',
          name: 'Maria',
          profile_picture: 'https://example.com/avatar.jpg',
        }),
    });

    const result = await fetchZapsterRecipientProfile('inst-1', '5511999887766');
    expect(result).toEqual({
      profilePicture: 'https://example.com/avatar.jpg',
      name: 'Maria',
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/wa/instances/inst-1/recipients/5511999887766'),
      expect.objectContaining({
        headers: { authorization: 'Bearer test-token' },
      })
    );
  });

  it('fetchZapsterRecipientProfilePicture retorna só a URL', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({ profile_picture: 'https://example.com/p.jpg' }),
    });
    await expect(fetchZapsterRecipientProfilePicture('inst-1', '5511888776655')).resolves.toBe(
      'https://example.com/p.jpg'
    );
  });
});

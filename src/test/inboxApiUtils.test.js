import { describe, it, expect, vi, beforeEach } from 'vitest';

const createJWT = vi.fn();

vi.mock('../lib/appwrite', () => ({
  account: {
    createJWT: (...args) => createJWT(...args),
  },
}));

import { getInboxJwt, clearInboxJwtCache } from '../lib/inboxApiUtils.js';

describe('getInboxJwt cache', () => {
  beforeEach(() => {
    clearInboxJwtCache();
    createJWT.mockReset();
    createJWT.mockResolvedValue({ jwt: 'token-a' });
  });

  it('reuses cached jwt within TTL', async () => {
    const a = await getInboxJwt();
    const b = await getInboxJwt();
    expect(a).toBe('token-a');
    expect(b).toBe('token-a');
    expect(createJWT).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh bypasses cache', async () => {
    await getInboxJwt();
    createJWT.mockResolvedValueOnce({ jwt: 'token-b' });
    const b = await getInboxJwt({ forceRefresh: true });
    expect(b).toBe('token-b');
    expect(createJWT).toHaveBeenCalledTimes(2);
  });

  it('clearInboxJwtCache forces new fetch', async () => {
    await getInboxJwt();
    clearInboxJwtCache();
    createJWT.mockResolvedValueOnce({ jwt: 'token-c' });
    const c = await getInboxJwt();
    expect(c).toBe('token-c');
    expect(createJWT).toHaveBeenCalledTimes(2);
  });
});

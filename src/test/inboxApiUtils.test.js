import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSessionJwt = vi.fn();
const clearSessionJwtCache = vi.fn();

vi.mock('../lib/appwrite', () => ({
  createSessionJwt: (...args) => createSessionJwt(...args),
  clearSessionJwtCache: (...args) => clearSessionJwtCache(...args),
}));

import { getInboxJwt, clearInboxJwtCache } from '../lib/inboxApiUtils.js';

describe('getInboxJwt cache', () => {
  beforeEach(() => {
    clearSessionJwtCache.mockReset();
    createSessionJwt.mockReset();
    createSessionJwt.mockResolvedValue('token-a');
  });

  it('delegates to createSessionJwt', async () => {
    const a = await getInboxJwt();
    const b = await getInboxJwt();
    expect(a).toBe('token-a');
    expect(b).toBe('token-a');
    expect(createSessionJwt).toHaveBeenCalledTimes(2);
  });

  it('forceRefresh clears session jwt cache first', async () => {
    await getInboxJwt();
    createSessionJwt.mockResolvedValueOnce('token-b');
    const b = await getInboxJwt({ forceRefresh: true });
    expect(b).toBe('token-b');
    expect(clearSessionJwtCache).toHaveBeenCalledTimes(1);
    expect(createSessionJwt).toHaveBeenCalledTimes(2);
  });

  it('clearInboxJwtCache clears shared session cache', async () => {
    await getInboxJwt();
    clearInboxJwtCache();
    createSessionJwt.mockResolvedValueOnce('token-c');
    const c = await getInboxJwt();
    expect(c).toBe('token-c');
    expect(clearSessionJwtCache).toHaveBeenCalledTimes(1);
  });
});

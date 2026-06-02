import { beforeEach, describe, expect, it, vi } from 'vitest';

const createJWT = vi.hoisted(() => vi.fn());

vi.mock('appwrite', () => {
  class Client {
    setEndpoint() {
      return this;
    }
    setProject() {
      return this;
    }
  }
  class Account {
    createJWT(...args) {
      return createJWT(...args);
    }
  }
  return {
    Client,
    Account,
    Databases: class Databases {},
    Functions: class Functions {},
    Teams: class Teams {},
    Realtime: class Realtime {},
  };
});

describe('createSessionJwt cache', () => {
  beforeEach(async () => {
    vi.resetModules();
    createJWT.mockReset();
    createJWT.mockResolvedValue({ jwt: 'token-a' });
    const mod = await import('../lib/appwrite.js');
    mod.clearSessionJwtCache();
  });

  it('reutiliza JWT em cache e deduplica chamadas paralelas', async () => {
    const mod = await import('../lib/appwrite.js');
    const [a, b, c] = await Promise.all([
      mod.createSessionJwt(),
      mod.createSessionJwt(),
      mod.createSessionJwt(),
    ]);
    expect(a).toBe('token-a');
    expect(b).toBe('token-a');
    expect(c).toBe('token-a');
    expect(createJWT).toHaveBeenCalledTimes(1);

    const again = await mod.createSessionJwt();
    expect(again).toBe('token-a');
    expect(createJWT).toHaveBeenCalledTimes(1);
  });

  it('clearSessionJwtCache força nova emissão', async () => {
    const mod = await import('../lib/appwrite.js');
    await mod.createSessionJwt();
    mod.clearSessionJwtCache();
    createJWT.mockResolvedValueOnce({ jwt: 'token-b' });
    const next = await mod.createSessionJwt();
    expect(next).toBe('token-b');
    expect(createJWT).toHaveBeenCalledTimes(2);
  });
});

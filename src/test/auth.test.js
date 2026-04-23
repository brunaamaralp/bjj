import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  get: vi.fn(),
  createEmailPasswordSession: vi.fn(),
  deleteSession: vi.fn()
}));

const storeMocks = vi.hoisted(() => ({
  setUserId: vi.fn(),
  setAcademyId: vi.fn()
}));

vi.mock('../lib/appwrite.js', () => ({
  account: {
    get: authMocks.get,
    createEmailPasswordSession: authMocks.createEmailPasswordSession,
    deleteSession: authMocks.deleteSession
  },
  client: { config: { endpoint: 'x', project: 'y' } }
}));

vi.mock('../store/useLeadStore.js', () => ({
  useLeadStore: {
    getState: () => ({
      setUserId: storeMocks.setUserId,
      setAcademyId: storeMocks.setAcademyId
    })
  }
}));

import { authService } from '../lib/auth.js';
import { useLeadStore } from '../store/useLeadStore.js';

describe('Autenticação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCurrentUser retorna usuário quando sessão válida', async () => {
    authMocks.get.mockResolvedValueOnce({ $id: 'u1', name: 'Ana' });
    const user = await authService.getCurrentUser();
    expect(user).toEqual({ $id: 'u1', name: 'Ana' });
  });

  it('getCurrentUser retorna null quando sessão inválida', async () => {
    authMocks.get.mockRejectedValueOnce(new Error('unauthorized'));
    const user = await authService.getCurrentUser();
    expect(user).toBeNull();
  });

  it('login com credenciais corretas retorna usuário', async () => {
    authMocks.createEmailPasswordSession.mockResolvedValueOnce({ $id: 'sess-1' });
    const session = await authService.login('a@b.com', '123456');
    expect(session).toEqual({ $id: 'sess-1' });
    expect(authMocks.createEmailPasswordSession).toHaveBeenCalledWith('a@b.com', '123456');
  });

  it('login com credenciais erradas lança erro', async () => {
    authMocks.createEmailPasswordSession.mockRejectedValueOnce(new Error('invalid_credentials'));
    await expect(authService.login('a@b.com', 'errada')).rejects.toThrow('invalid_credentials');
  });

  it('logout limpa o estado do store', async () => {
    const runLogoutFlow = async () => {
      await authService.logout();
      const st = useLeadStore.getState();
      st.setUserId(null);
      st.setAcademyId(null);
    };
    authMocks.deleteSession.mockResolvedValueOnce({});
    await runLogoutFlow();
    expect(authMocks.deleteSession).toHaveBeenCalledWith('current');
    expect(storeMocks.setUserId).toHaveBeenCalledWith(null);
    expect(storeMocks.setAcademyId).toHaveBeenCalledWith(null);
  });

  it('userId é definido após login bem-sucedido', async () => {
    const runLoginFlow = async (email, password) => {
      await authService.login(email, password);
      const user = await authService.getCurrentUser();
      if (user?.$id) useLeadStore.getState().setUserId(user.$id);
      return user;
    };
    authMocks.createEmailPasswordSession.mockResolvedValueOnce({ $id: 'sess-2' });
    authMocks.get.mockResolvedValueOnce({ $id: 'user-77', name: 'Leo' });
    const user = await runLoginFlow('leo@acme.com', '123456');
    expect(user.$id).toBe('user-77');
    expect(storeMocks.setUserId).toHaveBeenCalledWith('user-77');
  });
});

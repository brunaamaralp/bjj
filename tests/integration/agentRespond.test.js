import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { humanHandoffUntilFromMs } from '../../lib/humanHandoffUntil.js';
import { createMockReq, createMockRes } from '../../src/test/helpers/httpMock.js';
import { CONVERSATION_UNREAD } from './helpers/mockConversation.js';
import { fakeAcademyDoc, fakeConversationDoc } from './helpers/mockAppwrite.js';

const arMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  createDocument: vi.fn(),
  anthropicFetch: vi.fn(),
  sendZapsterText: vi.fn(),
  updateMerge: vi.fn(),
  runAgentActions: vi.fn(),
  logTokenUsage: vi.fn(),
}));

vi.mock('../../lib/server/zapsterSend.js', () => ({
  sendZapsterText: (...args) => arMocks.sendZapsterText(...args),
}));

vi.mock('../../lib/server/academyPromptSettings.js', () => ({
  fetchAcademyPromptSettings: vi.fn(async () => ({
    intro: 'Você é assistente.',
    body: 'Responda em JSON.',
    suffix: '',
    source: 'test',
  })),
}));

vi.mock('../../lib/server/agentActionExecutor.js', () => ({
  runAgentActions: (...args) => arMocks.runAgentActions(...args),
}));

vi.mock('../../lib/server/aiFeaturePolicy.js', () => ({
  assertAiModuleEnabled: vi.fn(),
  AiFeatureDisabledError: class AiFeatureDisabledError extends Error {
    constructor(msg, code) {
      super(msg);
      this.code = code;
    }
  },
}));

vi.mock('../../lib/server/ensureWhatsAppInboundLead.js', () => ({
  findLeadByPhone: vi.fn(async () => null),
  ensureWhatsAppInboundLead: vi.fn(async () => ({ leadDoc: null })),
}));

vi.mock('../../lib/server/structuredLog.js', () => ({
  logStructured: vi.fn(),
}));

vi.mock('../../lib/server/agentRespondMetrics.js', () => ({
  recordAgentRespondLatency: vi.fn(),
  logTokenUsage: (...args) => arMocks.logTokenUsage(...args),
}));

vi.mock('node-appwrite', () => {
  class MockDatabases {
    getDocument = arMocks.getDocument;
    listDocuments = arMocks.listDocuments;
    updateDocument = arMocks.updateDocument;
    createDocument = arMocks.createDocument;
  }
  class MockTeams {
    listMemberships = vi.fn(async () => ({ memberships: [] }));
  }
  return {
    Client: vi.fn(function MockClient() {
      this.setEndpoint = () => this;
      this.setProject = () => this;
      this.setKey = () => this;
      this.setJWT = () => this;
      return this;
    }),
    Databases: MockDatabases,
    Teams: MockTeams,
    Account: vi.fn(function MockAccount() {
      this.get = vi.fn(async () => ({ $id: 'user-1' }));
    }),
    Query: {
      equal: (a, b) => ({ type: 'equal', a, b }),
      limit: (n) => ({ type: 'limit', n }),
    },
    ID: { unique: () => 'new-conv-id' },
    Permission: { read: () => 'read', update: () => 'update', delete: () => 'delete' },
    Role: { user: () => 'user', team: () => 'team', users: () => 'users' },
  };
});

function claudeOkResponse(text) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        content: [{ type: 'text', text }],
      }),
  };
}

function internalRespondReq(body = {}) {
  return createMockReq({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': 'internal-secret',
      'x-academy-id': 'acad-1',
    },
    body: {
      academyId: 'acad-1',
      phone: '5511999887766',
      name: 'Maria',
      message: 'Quero saber o preço',
      messageId: 'msg-respond-1',
      outInstanceId: 'inst-1',
      ...body,
    },
  });
}

function setupHappyPath() {
  const convState = fakeConversationDoc({
    messages: [
      { role: 'user', content: 'Oi', timestamp: '2026-06-14T09:00:00.000Z', message_id: 'msg-old' },
    ],
  });

  const syncMessages = (patch) => {
    if (patch?.messages != null) {
      convState.messages =
        typeof patch.messages === 'string' ? patch.messages : JSON.stringify(patch.messages);
    }
    if (patch?.messages_recent != null) {
      convState.messages_recent =
        typeof patch.messages_recent === 'string'
          ? patch.messages_recent
          : JSON.stringify(patch.messages_recent);
    }
    if (patch?.updated_at) convState.updated_at = patch.updated_at;
    if (patch?.unread_count != null) convState.unread_count = patch.unread_count;
    if (patch?.last_user_msg_at) convState.last_user_msg_at = patch.last_user_msg_at;
  };

  arMocks.getDocument.mockImplementation(async (_db, _col, id) => {
    if (String(id).startsWith('acad')) return fakeAcademyDoc({ $id: String(id) });
    return { ...convState };
  });

  arMocks.listDocuments.mockResolvedValue({ documents: [{ ...convState }] });
  arMocks.updateDocument.mockImplementation(async (_db, _col, _id, patch) => {
    syncMessages(patch);
    return { ...convState };
  });
  arMocks.createDocument.mockResolvedValue(fakeConversationDoc({ $id: 'new-conv-id' }));
  arMocks.anthropicFetch.mockResolvedValue(
    claudeOkResponse(
      JSON.stringify({
        resposta: 'Olá! Posso ajudar com valores.',
        classificacao: { intencao: 'preco_adulto', prioridade: 'media' },
      })
    )
  );
  arMocks.sendZapsterText.mockResolvedValue({ ok: true });
}

describe('agentRespond integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubGlobal('fetch', arMocks.anthropicFetch);

    process.env.INTERNAL_API_SECRET = 'internal-secret';
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
    process.env.APPWRITE_API_KEY = 'key';
    process.env.APPWRITE_PROJECT_ID = 'proj';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-1';
    process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID = 'acad-col';
    process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID = 'conv-col';
    process.env.VITE_APPWRITE_LEADS_COLLECTION_ID = 'leads-col';

    setupHappyPath();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('HANDOFF BLOQUEANDO', () => {
    it('human_handoff_until > now → skipped handoff, não chama Claude', async () => {
      const until = humanHandoffUntilFromMs(Date.now() + 3600000);
      arMocks.listDocuments.mockResolvedValueOnce({
        documents: [fakeConversationDoc({ human_handoff_until: until })],
      });

      const { default: handler } = await import('../../lib/server/agentRespond.js');
      const { res, state } = createMockRes();
      await handler(internalRespondReq(), res);

      expect(state.statusCode).toBe(200);
      expect(state.body?.skipped).toBe(true);
      expect(state.body?.reason).toBe('human_handoff_active');
      expect(arMocks.anthropicFetch).not.toHaveBeenCalled();
    });
  });

  describe('SEM CONVERSA / ACADEMIA', () => {
    it('academyId não encontrado no Appwrite → retorna 404', async () => {
      arMocks.getDocument.mockRejectedValueOnce(new Error('Document not found'));

      const { default: handler } = await import('../../lib/server/agentRespond.js');
      const { res, state } = createMockRes();
      await handler(internalRespondReq({ academyId: 'acad-missing' }), res);

      expect(state.statusCode).toBe(404);
      expect(state.body?.erro).toMatch(/Academia/i);
      expect(arMocks.anthropicFetch).not.toHaveBeenCalled();
    });
  });

  describe('RESPOSTA NORMAL', () => {
    it('conversa válida + ia_ativa + sem handoff → Claude, Appwrite e sucesso', async () => {
      const { default: handler } = await import('../../lib/server/agentRespond.js');
      const { res, state } = createMockRes();
      await handler(internalRespondReq(), res);

      expect(state.statusCode).toBe(200);
      expect(state.body?.sucesso).toBe(true);
      expect(state.body?.resposta).toContain('ajudar');

      expect(arMocks.anthropicFetch).toHaveBeenCalledTimes(1);
      const anthropicBody = JSON.parse(String(arMocks.anthropicFetch.mock.calls[0][1]?.body || '{}'));
      expect(anthropicBody.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'Oi' })])
      );

      expect(arMocks.listDocuments).toHaveBeenCalled();
      expect(arMocks.updateDocument).toHaveBeenCalled();
    });
  });

  describe('TIMEOUT CLAUDE', () => {
    it('Claude excede CLAUDE_TIMEOUT_MS → erro controlado sem exceção não tratada', async () => {
      vi.useFakeTimers();
      arMocks.anthropicFetch.mockImplementation(
        (_url, opts) =>
          new Promise((_resolve, reject) => {
            opts?.signal?.addEventListener('abort', () => {
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            });
          })
      );

      const { default: handler } = await import('../../lib/server/agentRespond.js');
      const { res, state } = createMockRes();
      const run = handler(internalRespondReq(), res);

      await vi.advanceTimersByTimeAsync(8500);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(8500);
      await run;

      expect(state.statusCode).toBe(500);
      expect(state.body?.sucesso).toBe(false);
      expect(state.body?.erro).toBeTruthy();
    });
  });

  describe('RETRY', () => {
    it('429 na primeira chamada → retry → sucesso na segunda', async () => {
      vi.useFakeTimers();
      arMocks.anthropicFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => JSON.stringify({ error: { message: 'rate limited' } }),
        })
        .mockResolvedValueOnce(
          claudeOkResponse(
            JSON.stringify({
              resposta: 'Tudo certo após retry.',
              classificacao: { intencao: 'duvida' },
            })
          )
        );

      const { default: handler } = await import('../../lib/server/agentRespond.js');
      const { res, state } = createMockRes();
      const run = handler(internalRespondReq(), res);
      await vi.advanceTimersByTimeAsync(1000);
      await run;

      expect(state.statusCode).toBe(200);
      expect(state.body?.sucesso).toBe(true);
      expect(arMocks.anthropicFetch).toHaveBeenCalledTimes(2);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes } from '../../src/test/helpers/httpMock.js';
import { CONVERSATION_ALREADY_READ, CONVERSATION_UNREAD } from './helpers/mockConversation.js';

const msMocks = vi.hoisted(() => ({
  ensureAuth: vi.fn(),
  ensureAcademyAccess: vi.fn(),
  findConversationDoc: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  ensureAuth: (...args) => msMocks.ensureAuth(...args),
  ensureAcademyAccess: (...args) => msMocks.ensureAcademyAccess(...args),
}));

vi.mock('../../lib/server/billingGate.js', () => ({
  assertBillingActive: vi.fn(async () => {}),
  sendBillingGateError: vi.fn(() => false),
}));

vi.mock('../../lib/server/conversationsStore.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findConversationDoc: (...args) => msMocks.findConversationDoc(...args),
    safeParseMessages: actual.safeParseMessages,
    readAgentState: actual.readAgentState,
    stringifyAgentState: actual.stringifyAgentState,
    getOrCreateConversationDoc: vi.fn(),
    getConversationDocForThread: vi.fn(),
    getConversationMessagesDoc: vi.fn(),
    backfillMessagesRecentFromFull: vi.fn(),
  };
});

vi.mock('../../lib/server/conversationNotesHandler.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../lib/server/notificationsHandler.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../lib/server/messageFlagsHandler.js', () => ({
  default: vi.fn(),
}));

vi.mock('node-appwrite', () => {
  class MockDatabases {
    updateDocument = msMocks.updateDocument;
  }
  return {
    Client: vi.fn(function MockClient() {
      this.setEndpoint = () => this;
      this.setProject = () => this;
      this.setKey = () => this;
      return this;
    }),
    Databases: MockDatabases,
    Teams: vi.fn(),
    Query: {
      equal: (a, b) => ({ type: 'equal', a, b }),
      limit: (n) => ({ type: 'limit', n }),
      orderDesc: (f) => ({ type: 'orderDesc', f }),
      cursorAfter: (c) => ({ type: 'cursorAfter', c }),
      greaterThan: (a, b) => ({ type: 'greaterThan', a, b }),
      startsWith: (a, b) => ({ type: 'startsWith', a, b }),
      or: (q) => ({ type: 'or', q }),
      isNull: (a) => ({ type: 'isNull', a }),
      select: (attrs) => ({ type: 'select', attrs }),
    },
  };
});

function readReq(phone = '5511999887766', academyId = 'acad-1') {
  return createMockReq({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-jwt',
      'x-academy-id': academyId,
    },
    query: { phone },
    body: { action: 'read' },
  });
}

describe('markSeen — POST action=read em api/conversations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));

    process.env.APPWRITE_API_KEY = 'key';
    process.env.APPWRITE_PROJECT_ID = 'proj';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID = 'conv-col';
    process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID = 'acad-col';
    process.env.VITE_APPWRITE_LEADS_COLLECTION_ID = 'leads-col';

    msMocks.ensureAuth.mockResolvedValue({ $id: 'user-1' });
    msMocks.ensureAcademyAccess.mockResolvedValue({
      academyId: 'acad-1',
      doc: { $id: 'acad-1', status: 'active' },
    });
    msMocks.findConversationDoc.mockResolvedValue(CONVERSATION_UNREAD);
    msMocks.updateDocument.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('FLUXO NORMAL', () => {
    it("POST { action: 'read' } → updateDocument com unread_count=0 e last_read_at=now", async () => {
      const { default: handler } = await import('../../api/conversations.js');
      const { res, state } = createMockRes();
      await handler(readReq(), res);

      expect(state.statusCode).toBe(200);
      expect(state.body).toEqual({
        ok: true,
        unread_count: 0,
        last_read_at: '2026-06-14T12:00:00.000Z',
      });
      expect(msMocks.updateDocument).toHaveBeenCalledWith(
        'db-1',
        'conv-col',
        'conv-1',
        expect.objectContaining({
          unread_count: 0,
          last_read_at: '2026-06-14T12:00:00.000Z',
        })
      );
    });
  });

  describe('JÁ ZERADO', () => {
    it('conversa com unread_count=0 → ainda retorna 200 sem erro', async () => {
      msMocks.findConversationDoc.mockResolvedValueOnce(CONVERSATION_ALREADY_READ);

      const { default: handler } = await import('../../api/conversations.js');
      const { res, state } = createMockRes();
      await handler(readReq(), res);

      expect(state.statusCode).toBe(200);
      expect(state.body?.ok).toBe(true);
      expect(state.body?.unread_count).toBe(0);
    });
  });

  describe('ACADEMY ID ERRADO', () => {
    it('academyId sem acesso → retorna 403', async () => {
      msMocks.ensureAcademyAccess.mockImplementation(async (_req, res) => {
        res.status(403).json({ sucesso: false, erro: 'Acesso negado à academia' });
        return null;
      });

      const { default: handler } = await import('../../api/conversations.js');
      const { res, state } = createMockRes();
      await handler(readReq('5511999887766', 'acad-forbidden'), res);

      expect(state.statusCode).toBe(403);
      expect(state.body?.erro).toMatch(/Acesso negado/i);
      expect(msMocks.updateDocument).not.toHaveBeenCalled();
    });
  });
});

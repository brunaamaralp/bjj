import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { humanHandoffUntilFromMs } from '../../lib/humanHandoffUntil.js';
import { createMockReq, createMockRes } from '../../src/test/helpers/httpMock.js';
import {
  ACADEMY_ACTIVE,
  CONVERSATION_UNREAD,
  GROUP_PHONE,
  inboundGroupPayload,
  inboundTextPayload,
} from './helpers/mockConversation.js';

const whMocks = vi.hoisted(() => {
  const messageHistory = [];
  return {
    messageHistory,
    updateMerge: vi.fn(async (_id, additions) => {
      messageHistory.push(...(additions || []));
      return { ok: true };
    }),
    getOrCreate: vi.fn(async (phone) => ({
      $id: phone === GROUP_PHONE ? 'conv-group' : 'conv-1',
      messages: JSON.stringify(whMocks.messageHistory),
      academy_id: 'acad-1',
      human_handoff_until: '',
    })),
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    updateDocument: vi.fn(),
    createNotification: vi.fn().mockResolvedValue({ ok: true }),
    agentFetch: vi.fn(),
    recordPersistFail: vi.fn(),
    recordDeadLetter: vi.fn(),
    clearUnread: vi.fn(async () => ({ ok: true, last_read_at: '2026-06-14T12:00:00.000Z' })),
    findConversation: vi.fn(async () => ({ $id: 'conv-read-1', unread_count: 3 })),
  };
});

vi.mock('@vercel/functions', () => ({
  waitUntil: (task) => {
    void task;
  },
}));

vi.mock('../../lib/server/conversationsStore.js', () => ({
  safeParseMessages: (raw) => {
    try {
      const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  },
  getOrCreateConversationDoc: (...args) => whMocks.getOrCreate(...args),
  findConversationDoc: (...args) => whMocks.findConversation(...args),
  updateConversationWithMerge: (...args) => whMocks.updateMerge(...args),
  updateConversationLastDispatchMeta: vi.fn().mockResolvedValue({ ok: true }),
  clearConversationUnread: (...args) => whMocks.clearUnread(...args),
}));

vi.mock('../../lib/server/internalNotification.js', () => ({
  createInternalNotification: (...args) => whMocks.createNotification(...args),
}));

vi.mock('../../lib/server/inboundPersistMonitor.js', () => ({
  recordInboundPersistFailure: (...args) => whMocks.recordPersistFail(...args),
}));

vi.mock('../../lib/server/deadLetterInbound.js', () => ({
  recordDeadLetterInbound: (...args) => whMocks.recordDeadLetter(...args),
}));

vi.mock('../../lib/server/zapsterSenderMeta.js', () => ({
  pickSenderProfileImageUrl: vi.fn(() => ''),
}));

vi.mock('../../lib/server/zapsterRecipientProfile.js', () => ({
  fetchZapsterRecipientProfilePicture: vi.fn(async () => ''),
}));

vi.mock('../../lib/server/inboxMediaService.js', () => ({
  enrichInboundMedia: vi.fn(async ({ mediaUrl }) => ({
    mediaUrl,
    storageFileId: 'file-1',
    media_stored: true,
    mimeType: 'image/jpeg',
  })),
}));

vi.mock('../../lib/server/ensureWhatsAppInboundLead.js', () => ({
  ensureWhatsAppInboundLead: vi.fn(async () => ({})),
  findLeadByPhone: vi.fn(async () => null),
}));

vi.mock('node-appwrite', () => {
  class MockDatabases {
    getDocument = whMocks.getDocument;
    listDocuments = whMocks.listDocuments;
    updateDocument = whMocks.updateDocument;
  }
  return {
    Client: vi.fn(function MockClient() {
      this.setEndpoint = () => this;
      this.setProject = () => this;
      this.setKey = () => this;
      return this;
    }),
    Databases: MockDatabases,
    Query: {
      equal: (a, b) => ({ type: 'equal', a, b }),
      limit: (n) => ({ type: 'limit', n }),
    },
    ID: { unique: () => 'generated-id' },
  };
});

function webhookReq(body, token = 'wh-secret') {
  return createMockReq({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-token': token,
    },
    body,
  });
}

function setupAcademyMocks() {
  whMocks.listDocuments.mockImplementation(async (_db, col) => {
    if (col === 'acad-col') {
      return { documents: [ACADEMY_ACTIVE] };
    }
    if (col === 'conv-col') {
      return { documents: [CONVERSATION_UNREAD] };
    }
    return { documents: [] };
  });
  whMocks.getDocument.mockResolvedValue(ACADEMY_ACTIVE);
}

describe('zapsterWebhook integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubGlobal('fetch', whMocks.agentFetch);

    whMocks.messageHistory.length = 0;
    whMocks.updateMerge.mockClear();
    whMocks.agentFetch.mockReset();
    whMocks.clearUnread.mockClear();
    whMocks.findConversation.mockClear();
    whMocks.recordPersistFail.mockClear();
    whMocks.recordDeadLetter.mockClear();

    process.env.ZAPSTER_WEBHOOK_TOKEN = 'wh-secret';
    process.env.INTERNAL_API_SECRET = 'internal-secret';
    process.env.APPWRITE_API_KEY = 'key';
    process.env.APPWRITE_PROJECT_ID = 'proj';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-1';
    process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID = 'acad-col';
    process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID = 'conv-col';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://app.test';

    setupAcademyMocks();
    whMocks.updateMerge.mockResolvedValue({ ok: true });
    whMocks.agentFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
    whMocks.findConversation.mockResolvedValue({ $id: 'conv-read-1', unread_count: 3 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('TOKEN INVÁLIDO', () => {
    it('webhook com token errado → 401, não persiste nada', async () => {
      const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
      const { res, state } = createMockRes();
      await handler(webhookReq(inboundTextPayload(), 'wrong-token'), res);

      expect(state.statusCode).toBe(401);
      expect(whMocks.updateMerge).not.toHaveBeenCalled();
      expect(whMocks.agentFetch).not.toHaveBeenCalled();
    });
  });

  describe('MENSAGEM DE GRUPO', () => {
    it('message.received de grupo → persiste mensagem, NÃO dispara agente', async () => {
      whMocks.updateMerge.mockResolvedValueOnce({ ok: true, duplicate: false, docId: 'conv-group' });

      const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
      const { res, state } = createMockRes();
      await handler(webhookReq(inboundGroupPayload()), res);

      expect(state.statusCode).toBe(200);
      expect(state.body?.whatsapp_group).toBe(true);
      expect(whMocks.agentFetch).not.toHaveBeenCalled();
      expect(whMocks.getOrCreate).toHaveBeenCalledWith(GROUP_PHONE, 'acad-1', expect.anything());
      const mergePayload = whMocks.updateMerge.mock.calls.at(-1)?.[1];
      expect(mergePayload?.[0]).toEqual(
        expect.objectContaining({
          role: 'user',
          content: 'Mensagem no grupo',
        })
      );
    });
  });

  describe('HANDOFF ATIVO', () => {
    it('message.received com human_handoff_until no futuro → persiste, NÃO dispara agente', async () => {
      const until = humanHandoffUntilFromMs(Date.now() + 3600000);
      whMocks.listDocuments.mockImplementation(async (_db, col) => {
        if (col === 'acad-col') return { documents: [ACADEMY_ACTIVE] };
        if (col === 'conv-col') {
          return {
            documents: [{ ...CONVERSATION_UNREAD, human_handoff_until: until }],
          };
        }
        return { documents: [] };
      });

      const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
      const { res, state } = createMockRes();
      await handler(webhookReq(inboundTextPayload()), res);

      expect(state.statusCode).toBe(200);
      expect(state.body?.modo_humano).toBe(true);
      expect(whMocks.agentFetch).not.toHaveBeenCalled();
      expect(whMocks.updateMerge).toHaveBeenCalled();
      const mergePayload = whMocks.updateMerge.mock.calls.at(-1)?.[1];
      expect(mergePayload?.[0]?.role).toBe('user');
    });
  });

  describe('FLUXO NORMAL (IA ativa)', () => {
    it('message.received com ia_ativa e sem handoff → persiste E dispara agente', async () => {
      const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
      const { res, state } = createMockRes();
      await handler(webhookReq(inboundTextPayload()), res);

      expect(state.statusCode).toBe(200);
      expect(state.body?.enfileirado).toBe(true);
      expect(whMocks.updateMerge).toHaveBeenCalled();
      const mergePayload = whMocks.updateMerge.mock.calls.at(-1)?.[1];
      expect(mergePayload?.[0]).toEqual(expect.objectContaining({ role: 'user' }));
      expect(whMocks.agentFetch).toHaveBeenCalledTimes(1);
      expect(String(whMocks.agentFetch.mock.calls[0][0])).toContain('/api/agent/process');
    });
  });

  describe('MESSAGE.SENT (origin=whatsapp)', () => {
    it('dispara clearConversationUnread', async () => {
      whMocks.updateMerge.mockResolvedValueOnce({ ok: true });

      const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
      const { res, state } = createMockRes();
      await handler(
        webhookReq({
          type: 'message.sent',
          instance_id: 'inst-1',
          data: {
            origin: 'whatsapp',
            content: { text: 'Oi pelo celular' },
            id: 'msg-sent-phone',
            recipient: { id: '5511999887766', type: 'chat' },
            sender: { id: '5511888776655' },
            type: 'text',
          },
        }),
        res
      );

      expect(state.statusCode).toBe(200);
      expect(whMocks.clearUnread).toHaveBeenCalledWith('conv-1');
    });
  });

  describe('MESSAGE.READ', () => {
    it('dispara clearConversationUnread', async () => {
      whMocks.getDocument.mockResolvedValueOnce({
        ...ACADEMY_ACTIVE,
        wa_phone: '5511888776655',
      });

      const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
      const { res, state } = createMockRes();
      await handler(
        webhookReq({
          type: 'message.read',
          instance_id: 'inst-1',
          data: {
            id: 'msg-read-1',
            sender: { id: '5511999887766', type: 'chat' },
            recipient: { id: '5511888776655', type: 'chat' },
            type: 'text',
          },
        }),
        res
      );

      expect(state.statusCode).toBe(200);
      expect(state.body?.tipo).toBe('message_read');
      expect(whMocks.clearUnread).toHaveBeenCalledWith('conv-read-1');
    });
  });
});

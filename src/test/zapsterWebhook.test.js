import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from './helpers/httpMock.js';

const whMocks = vi.hoisted(() => {
  const messageHistory = [];
  return {
    messageHistory,
    updateMerge: vi.fn(async (_id, additions) => {
      messageHistory.push(...(additions || []));
      return { ok: true };
    }),
    getOrCreate: vi.fn(async () => ({
      $id: 'conv-1',
      messages: JSON.stringify(messageHistory),
      academy_id: 'acad-1',
      human_handoff_until: ''
    })),
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    updateDocument: vi.fn(),
    createNotification: vi.fn().mockResolvedValue({ ok: true, id: 'n1' }),
    agentFetch: vi.fn(),
    recordPersistFail: vi.fn(),
    recordDeadLetter: vi.fn()
  };
});

vi.mock('@vercel/functions', () => ({
  waitUntil: (task) => {
    void task;
  }
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
  findConversationDoc: vi.fn(async () => ({ $id: 'conv-1', unread_count: 2 })),
  updateConversationWithMerge: (...args) => whMocks.updateMerge(...args),
  updateConversationLastDispatchMeta: vi.fn().mockResolvedValue({ ok: true }),
  clearConversationUnread: vi.fn(async () => ({ ok: true, last_read_at: '2026-06-08T12:00:00.000Z' })),
}));

vi.mock('../../lib/server/internalNotification.js', () => ({
  createInternalNotification: (...args) => whMocks.createNotification(...args)
}));

vi.mock('../../lib/server/inboundPersistMonitor.js', () => ({
  recordInboundPersistFailure: (...args) => whMocks.recordPersistFail(...args)
}));

vi.mock('../../lib/server/deadLetterInbound.js', () => ({
  recordDeadLetterInbound: (...args) => whMocks.recordDeadLetter(...args)
}));

vi.mock('../../lib/server/zapsterSenderMeta.js', () => ({
  pickSenderProfileImageUrl: vi.fn(() => '')
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
      limit: (n) => ({ type: 'limit', n })
    }
  };
});

function webhookReq(body) {
  return createMockReq({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-token': 'wh-secret'
    },
    body
  });
}

describe('zapsterWebhook', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', whMocks.agentFetch);
    whMocks.messageHistory.length = 0;
    whMocks.updateMerge.mockClear();
    whMocks.createNotification.mockClear();
    whMocks.agentFetch.mockReset();
    whMocks.recordPersistFail.mockReset();
    whMocks.recordDeadLetter.mockReset();

    process.env.ZAPSTER_WEBHOOK_TOKEN = 'wh-secret';
    process.env.INTERNAL_API_SECRET = 'internal-secret';
    process.env.APPWRITE_API_KEY = 'key';
    process.env.APPWRITE_PROJECT_ID = 'proj';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-1';
    process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID = 'acad-col';
    process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID = 'conv-col';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://app.test';

    whMocks.listDocuments.mockResolvedValue({
      documents: [{ $id: 'acad-1', zapster_instance_id: 'inst-1', status: 'active', ia_ativa: true }]
    });
    whMocks.getDocument.mockResolvedValue({
      $id: 'acad-1',
      zapster_instance_id: 'inst-1',
      status: 'active',
      ia_ativa: true
    });
    whMocks.updateDocument.mockResolvedValue({});
  });

  it('persist_failed: não dispara agent/process e cria notificação', async () => {
    whMocks.updateMerge.mockResolvedValueOnce({ ok: false, erro: 'db down' });

    const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
    const { res, state } = createMockRes();
    await handler(
      webhookReq({
        event: 'message.received',
        instance_id: 'inst-1',
        message: {
          id: 'msg-persist-fail',
          type: 'text',
          sender: { id: '5511999887766', name: 'Aluno' },
          content: { text: 'Olá' }
        }
      }),
      res
    );

    expect(state.statusCode).toBe(200);
    expect(state.body?.reason).toBe('persist_failed');
    expect(whMocks.agentFetch).not.toHaveBeenCalled();
    expect(whMocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inbound_persist_failed', severity: 'high' })
    );
  });

  it('idempotência por message_id na segunda entrega', async () => {
    whMocks.agentFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });

    const payload = {
      event: 'message.received',
      instance_id: 'inst-1',
      message: {
        id: 'msg-dup-1',
        type: 'text',
        sender: { id: '5511999887766' },
        content: { text: 'Oi de novo' }
      }
    };

    const { default: handler } = await import('../../lib/server/zapsterWebhook.js');

    const first = createMockRes();
    await handler(webhookReq(payload), first.res);
    const mergeCallsAfterFirst = whMocks.updateMerge.mock.calls.length;

    whMocks.agentFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
    const second = createMockRes();
    await handler(webhookReq(payload), second.res);

    expect(whMocks.updateMerge.mock.calls.length).toBe(mergeCallsAfterFirst);
  });

  it('instance.disconnected atualiza academia e notifica', async () => {
    const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
    const { res, state } = createMockRes();
    await handler(
      webhookReq({
        event: 'instance.disconnected',
        instance_id: 'inst-1',
        data: { status: 'disconnected' }
      }),
      res
    );

    expect(state.statusCode).toBe(200);
    expect(whMocks.updateDocument).toHaveBeenCalledWith(
      'db-1',
      'acad-col',
      'acad-1',
      expect.objectContaining({ zapster_status: 'disconnected' })
    );
    expect(whMocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'whatsapp_disconnected',
        severity: 'high',
        academy_id: 'acad-1'
      })
    );
  });

  it('aceita token na query (?token=) em produção — formato da Zapster', async () => {
    const prevNode = process.env.NODE_ENV;
    const prevVercel = process.env.VERCEL;
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';

    const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
    const { res, state } = createMockRes();
    await handler(
      createMockReq({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        query: { token: 'wh-secret', academyId: 'acad-1' },
        body: {
          event: 'instance.connected',
          instance_id: 'inst-1',
          data: { status: 'connected' }
        }
      }),
      res
    );

    process.env.NODE_ENV = prevNode;
    process.env.VERCEL = prevVercel;

    expect(state.statusCode).toBe(200);
    expect(state.body?.error).not.toBe('use_x_webhook_token_header');
  });

  it('resolve academy via ?academyId= e header X-Instance-ID (reconexão)', async () => {
    whMocks.listDocuments.mockResolvedValue({ documents: [] });
    whMocks.getDocument.mockResolvedValue({
      $id: 'acad-1',
      zapster_instance_id: 'inst-old',
      status: 'active',
      ia_ativa: true
    });
    whMocks.updateMerge.mockResolvedValueOnce({ ok: true, duplicate: false, docId: 'conv-1' });

    const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
    const { res, state } = createMockRes();
    await handler(
      createMockReq({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-token': 'wh-secret',
          'x-instance-id': 'itb78rqc7fa5g4fcb6grb'
        },
        query: { token: 'wh-secret', academyId: 'acad-1' },
        body: {
          event: 'message.received',
          message: {
            id: 'msg-header-inst',
            type: 'text',
            sender: { id: '5511999887766', name: 'Lead' },
            content: { text: 'Oi' }
          }
        }
      }),
      res
    );

    expect(state.statusCode).toBe(200);
    expect(state.body?.reason).not.toBe('instance_not_mapped');
    expect(whMocks.updateDocument).toHaveBeenCalledWith(
      'db-1',
      'acad-col',
      'acad-1',
      expect.objectContaining({ zapster_instance_id: 'itb78rqc7fa5g4fcb6grb' })
    );
  });

  it('instance.connected notifica reconexão', async () => {
    const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
    const { res, state } = createMockRes();
    await handler(
      webhookReq({
        event: 'instance.connected',
        instance_id: 'inst-1',
        data: { status: 'connected' }
      }),
      res
    );

    expect(state.statusCode).toBe(200);
    expect(whMocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'whatsapp_reconnected',
        severity: 'info',
        academy_id: 'acad-1'
      })
    );
  });

  it('message.sent origin whatsapp zera unread_count', async () => {
    const { clearConversationUnread } = await import('../../lib/server/conversationsStore.js');
    clearConversationUnread.mockClear();
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
      res,
    );

    expect(state.statusCode).toBe(200);
    expect(state.body?.sucesso).toBe(true);
    expect(clearConversationUnread).toHaveBeenCalledWith('conv-1');
  });

  it('message.read zera unread da conversa', async () => {
    const { clearConversationUnread, findConversationDoc } = await import('../../lib/server/conversationsStore.js');
    clearConversationUnread.mockClear();
    findConversationDoc.mockResolvedValueOnce({ $id: 'conv-read-1', unread_count: 3 });

    whMocks.getDocument.mockResolvedValueOnce({
      $id: 'acad-1',
      zapster_instance_id: 'inst-1',
      status: 'active',
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
      res,
    );

    expect(state.statusCode).toBe(200);
    expect(state.body?.tipo).toBe('message_read');
    expect(findConversationDoc).toHaveBeenCalledWith('5511999887766', 'acad-1');
    expect(clearConversationUnread).toHaveBeenCalledWith('conv-read-1');
  });

  it('rejeita message.received com ?academyId= sem instance vinculada', async () => {
    whMocks.listDocuments.mockResolvedValue({ documents: [] });
    whMocks.getDocument.mockResolvedValue({
      $id: 'acad-victim',
      status: 'active',
      ia_ativa: true,
    });

    const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
    const { res, state } = createMockRes();
    await handler(
      createMockReq({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-token': 'wh-secret' },
        query: { token: 'wh-secret', academyId: 'acad-victim' },
        body: {
          event: 'message.received',
          message: {
            id: 'msg-spoof-no-inst',
            type: 'text',
            sender: { id: '5511999887766', name: 'Atacante' },
            content: { text: 'injetado' },
          },
        },
      }),
      res
    );

    expect(state.statusCode).toBe(200);
    expect(state.body?.reason).toBe('instance_not_mapped');
    expect(whMocks.updateMerge).not.toHaveBeenCalled();
  });

  it('não vincula instance de outra academia ao academyId da query', async () => {
    whMocks.listDocuments.mockImplementation(async (_db, _col, queries) => {
      const field = queries?.[0]?.a;
      if (field === 'zapster_instance_id') {
        return {
          documents: [
            {
              $id: 'acad-other',
              zapster_instance_id: 'inst-taken',
              status: 'active',
              ia_ativa: true,
              teamId: 'team-1',
            },
          ],
        };
      }
      return { documents: [] };
    });
    whMocks.getDocument.mockResolvedValue({
      $id: 'acad-other',
      zapster_instance_id: 'inst-taken',
      status: 'active',
      ia_ativa: true,
      teamId: 'team-1',
    });
    whMocks.updateMerge.mockResolvedValueOnce({ ok: true, duplicate: false, docId: 'conv-1' });
    whMocks.agentFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });

    const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
    const { res, state } = createMockRes();
    await handler(
      createMockReq({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-token': 'wh-secret' },
        query: { token: 'wh-secret', academyId: 'acad-1' },
        body: {
          event: 'message.received',
          instance_id: 'inst-taken',
          message: {
            id: 'msg-conflict',
            type: 'text',
            sender: { id: '5511999887766' },
            content: { text: 'cross-tenant' },
          },
        },
      }),
      res
    );

    expect(state.statusCode).toBe(200);
    expect(whMocks.updateDocument).not.toHaveBeenCalledWith(
      'db-1',
      'acad-col',
      'acad-1',
      expect.objectContaining({ zapster_instance_id: 'inst-taken' })
    );
    expect(whMocks.getOrCreate).toHaveBeenCalledWith(
      expect.any(String),
      'acad-other',
      expect.anything()
    );
  });

  it('ignora inbound quando instanceId não bate com academia resolvida', async () => {
    whMocks.listDocuments.mockResolvedValue({
      documents: [{ $id: 'acad-1', zapster_instance_id: 'inst-1', status: 'active', ia_ativa: true }],
    });
    whMocks.getDocument.mockResolvedValue({
      $id: 'acad-1',
      zapster_instance_id: 'inst-other',
      status: 'active',
      ia_ativa: true,
    });

    const { default: handler } = await import('../../lib/server/zapsterWebhook.js');
    const { res, state } = createMockRes();
    await handler(
      webhookReq({
        event: 'message.received',
        instance_id: 'inst-1',
        message: {
          id: 'msg-mismatch',
          type: 'text',
          sender: { id: '5511999887766' },
          content: { text: 'Oi' },
        },
      }),
      res
    );

    expect(state.statusCode).toBe(200);
    expect(state.body?.motivo).toBe('instance_mismatch');
    expect(whMocks.updateMerge).not.toHaveBeenCalled();
  });
});

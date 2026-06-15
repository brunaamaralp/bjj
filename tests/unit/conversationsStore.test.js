import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeConversationDoc } from '../integration/helpers/mockAppwrite.js';

const csMocks = vi.hoisted(() => {
  const ENV_KEYS = [
    'APPWRITE_PROJECT_ID',
    'APPWRITE_API_KEY',
    'VITE_APPWRITE_DATABASE_ID',
    'APPWRITE_CONVERSATIONS_COLLECTION_ID',
  ];
  const envSnapshot = {};
  for (const k of ENV_KEYS) {
    envSnapshot[k] = process.env[k];
  }
  process.env.APPWRITE_PROJECT_ID = 'test-project';
  process.env.APPWRITE_API_KEY = 'test-key';
  process.env.VITE_APPWRITE_DATABASE_ID = 'db-test';
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID = 'col-conversations';

  return {
    ENV_KEYS,
    envSnapshot,
    getDocument: vi.fn(),
    updateDocument: vi.fn(),
    listDocuments: vi.fn(),
    createDocument: vi.fn(),
  };
});

vi.mock('node-appwrite', () => {
  class MockDatabases {
    getDocument = csMocks.getDocument;
    updateDocument = csMocks.updateDocument;
    listDocuments = csMocks.listDocuments;
    createDocument = csMocks.createDocument;
  }
  return {
    Client: vi.fn(function MockClient() {
      this.setEndpoint = () => this;
      this.setProject = () => this;
      this.setKey = () => this;
      return this;
    }),
    Databases: MockDatabases,
    ID: { unique: () => 'unique-id' },
    Permission: { read: vi.fn(), update: vi.fn(), delete: vi.fn() },
    Query: {
      equal: vi.fn(),
      limit: vi.fn(),
      select: vi.fn(),
    },
    Role: { user: vi.fn(), team: vi.fn() },
  };
});

import {
  AGENT_STATE_MAX_BYTES,
  clearConversationUnread,
  findConversationDoc,
  getOrCreateConversationDoc,
  readAgentState,
  recalcUnreadCount,
  resolveUnreadCountAfterMerge,
  safeParseMessages,
  stringifyAgentState,
  updateConversationWithMerge,
} from '../../lib/server/conversationsStore.js';

afterAll(() => {
  for (const k of csMocks.ENV_KEYS) {
    if (csMocks.envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = csMocks.envSnapshot[k];
  }
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
  csMocks.updateDocument.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('safeParseMessages', () => {
  it('string JSON válida de array → retorna array', () => {
    expect(safeParseMessages('[{"role":"user"}]')).toEqual([{ role: 'user' }]);
  });

  it('string JSON de objeto (não array) → retorna []', () => {
    expect(safeParseMessages('{"role":"user"}')).toEqual([]);
  });

  it('string inválida → retorna []', () => {
    expect(safeParseMessages('not-json')).toEqual([]);
  });

  it('null / undefined → retorna []', () => {
    expect(safeParseMessages(null)).toEqual([]);
    expect(safeParseMessages(undefined)).toEqual([]);
  });

  it('array já parseado (não string) → retorna o próprio array', () => {
    const arr = [{ role: 'assistant' }];
    expect(safeParseMessages(arr)).toBe(arr);
  });
});

describe('readAgentState', () => {
  it('string JSON de objeto → retorna objeto', () => {
    expect(readAgentState('{"step":1}')).toEqual({ step: 1 });
  });

  it('string JSON de array → retorna {}', () => {
    expect(readAgentState('[1,2]')).toEqual({});
  });

  it('string inválida → retorna {}', () => {
    expect(readAgentState('{bad')).toEqual({});
  });

  it('null → retorna {}', () => {
    expect(readAgentState(null)).toEqual({});
  });

  it('objeto já parseado → retorna o próprio objeto', () => {
    const obj = { foo: 'bar' };
    expect(readAgentState(obj)).toBe(obj);
  });
});

describe('stringifyAgentState', () => {
  it('objeto simples → retorna string JSON válida', () => {
    const result = stringifyAgentState({ a: 1 });
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });

  it('objeto com campo intake que ultrapassa AGENT_STATE_MAX_BYTES → remove intake e tenta novamente', () => {
    const state = {
      intake: 'x'.repeat(5000),
      keep: 'ok',
    };
    const result = stringifyAgentState(state);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ keep: 'ok' });
    expect(result.length).toBeLessThanOrEqual(AGENT_STATE_MAX_BYTES);
  });

  it('objeto que mesmo sem intake ultrapassa 4096 bytes → retorna {}', () => {
    const state = { blob: 'y'.repeat(5000) };
    expect(stringifyAgentState(state)).toBe('{}');
  });

  it('array (inválido) → trata como {} → retorna {}', () => {
    expect(stringifyAgentState([1, 2, 3])).toBe('{}');
  });

  it('null → retorna {}', () => {
    expect(stringifyAgentState(null)).toBe('{}');
  });
});

describe('recalcUnreadCount', () => {
  const messages = [
    { role: 'user', content: 'a', timestamp: '2025-06-01T10:00:00Z', message_id: 'u1' },
    { role: 'assistant', content: 'b', timestamp: '2025-06-01T10:01:00Z' },
    { role: 'user', content: 'c', timestamp: '2025-06-01T11:00:00Z', message_id: 'u2' },
    { role: 'user', content: 'd', message_id: 'u3' },
  ];

  it('lastReadAt vazio → conta todas as mensagens com role=user', () => {
    expect(recalcUnreadCount(messages, '')).toBe(3);
    expect(recalcUnreadCount(messages, null)).toBe(3);
  });

  it('lastReadAt válido → conta só mensagens user com timestamp DEPOIS do lastReadAt', () => {
    expect(recalcUnreadCount(messages, '2025-06-01T10:30:00Z')).toBe(2);
  });

  it('mensagem user sem timestamp → conta como não lida', () => {
    const onlyNoTs = [
      { role: 'user', content: 'x', message_id: 'u1' },
      { role: 'user', content: 'y', timestamp: '2025-06-01T09:00:00Z', message_id: 'u2' },
    ];
    expect(recalcUnreadCount(onlyNoTs, '2025-06-01T10:00:00Z')).toBe(1);
  });

  it('nenhuma mensagem user → retorna 0', () => {
    expect(recalcUnreadCount([{ role: 'assistant', content: 'hi' }], '')).toBe(0);
  });

  it('lastReadAt inválido (não parseable) → conta todas as mensagens user', () => {
    expect(recalcUnreadCount(messages, 'not-a-date')).toBe(3);
  });
});

describe('resolveUnreadCountAfterMerge', () => {
  const merged = [
    { role: 'user', content: 'a', timestamp: '2025-06-01T10:00:00Z', message_id: 'u1' },
    { role: 'user', content: 'b', timestamp: '2025-06-01T11:00:00Z', message_id: 'u2' },
  ];

  it('com lastReadAt definido → delega para recalcUnreadCount corretamente', () => {
    expect(
      resolveUnreadCountAfterMerge({
        messages: merged,
        lastReadAt: '2025-06-01T10:30:00Z',
      })
    ).toBe(1);
  });

  it('sem lastReadAt, prevUnread=0, sem novas mensagens user → retorna 0', () => {
    expect(
      resolveUnreadCountAfterMerge({
        messages: merged,
        prevUnread: 0,
        historyMessages: merged,
      })
    ).toBe(0);
  });

  it('sem lastReadAt, prevUnread=0, com 2 novas mensagens user (message_id novo) → retorna 2', () => {
    const history = [{ role: 'user', message_id: 'old1' }];
    const next = [
      ...history,
      { role: 'user', message_id: 'new1' },
      { role: 'user', message_id: 'new2' },
    ];
    expect(
      resolveUnreadCountAfterMerge({
        messages: next,
        prevUnread: 0,
        historyMessages: history,
      })
    ).toBe(2);
  });

  it('sem lastReadAt, prevUnread=0, mensagem user já conhecida (mesmo message_id) → não conta', () => {
    const history = [{ role: 'user', message_id: 'same1' }];
    const next = [...history, { role: 'user', message_id: 'same1' }];
    expect(
      resolveUnreadCountAfterMerge({
        messages: next,
        prevUnread: 0,
        historyMessages: history,
      })
    ).toBe(0);
  });

  it('sem lastReadAt, prevUnread=3 → recalcula via recalcUnreadCount(merged, null)', () => {
    expect(
      resolveUnreadCountAfterMerge({
        messages: merged,
        prevUnread: 3,
      })
    ).toBe(recalcUnreadCount(merged, null));
  });
});

describe('updateConversationWithMerge', () => {
  const nowIso = '2025-06-01T12:00:00.000Z';

  function lastUpdatePayload() {
    const calls = csMocks.updateDocument.mock.calls;
    return calls[calls.length - 1]?.[3];
  }

  function parsedMessagesFromPayload(payload) {
    return JSON.parse(payload.messages);
  }

  it('FLUXO NORMAL — mensagem user: incrementa unread_count e define last_user_msg_at', async () => {
    csMocks.getDocument.mockResolvedValue(
      fakeConversationDoc({
        unread_count: 2,
        messages: [],
      })
    );

    const additions = [{ role: 'user', content: 'oi', timestamp: nowIso, message_id: 'msg1' }];
    const result = await updateConversationWithMerge('conv-1', additions);

    expect(result).toEqual({ ok: true });
    expect(csMocks.updateDocument).toHaveBeenCalled();
    const payload = lastUpdatePayload();
    expect(payload.unread_count).toBe(3);
    expect(payload.last_user_msg_at).toBe(nowIso);
  });

  it('FLUXO NORMAL — mensagem assistant: não incrementa unread_count', async () => {
    csMocks.getDocument.mockResolvedValue(
      fakeConversationDoc({
        unread_count: 2,
        messages: [],
      })
    );

    const additions = [{ role: 'assistant', content: 'olá', timestamp: nowIso }];
    const result = await updateConversationWithMerge('conv-1', additions);

    expect(result).toEqual({ ok: true });
    const payload = lastUpdatePayload();
    expect(payload.unread_count).toBeUndefined();
    expect(payload.last_user_msg_at).toBeUndefined();
  });

  it('DEDUPLICAÇÃO — history com msg1 + addition msg1 → messages sem duplicata', async () => {
    const existing = [{ role: 'user', content: 'oi', timestamp: nowIso, message_id: 'msg1' }];
    csMocks.getDocument.mockResolvedValue(
      fakeConversationDoc({
        unread_count: 1,
        messages: existing,
      })
    );

    const additions = [{ role: 'user', content: 'oi', timestamp: nowIso, message_id: 'msg1' }];
    const result = await updateConversationWithMerge('conv-1', additions);

    expect(result).toEqual({ ok: true });
    const stored = parsedMessagesFromPayload(lastUpdatePayload());
    const msg1Count = stored.filter((m) => m.message_id === 'msg1').length;
    expect(msg1Count).toBe(1);
  });

  it('FALLBACK — update completo falha, update minimal passa', async () => {
    csMocks.getDocument.mockResolvedValue(
      fakeConversationDoc({
        unread_count: 0,
        messages: [],
      })
    );
    csMocks.updateDocument
      .mockRejectedValueOnce(new Error('full update failed'))
      .mockResolvedValueOnce({});

    const additions = [{ role: 'user', content: 'oi', timestamp: nowIso, message_id: 'msg1' }];
    const result = await updateConversationWithMerge('conv-1', additions);

    expect(result).toEqual({ ok: true });
    expect(csMocks.updateDocument).toHaveBeenCalledTimes(2);
    const minimalPayload = lastUpdatePayload();
    expect(minimalPayload.messages).toBeDefined();
    expect(minimalPayload.messages_recent).toBeDefined();
    expect(minimalPayload.updated_at).toBe(nowIso);
  });

  it('RETRY — getDocument falha 3x, passa na 4ª', async () => {
    csMocks.getDocument
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValueOnce(new Error('fail 3'))
      .mockResolvedValue(
        fakeConversationDoc({
          unread_count: 0,
          messages: [],
        })
      );

    const additions = [{ role: 'user', content: 'oi', timestamp: nowIso, message_id: 'msg1' }];
    const result = await updateConversationWithMerge('conv-1', additions);

    expect(result).toEqual({ ok: true });
    expect(csMocks.getDocument).toHaveBeenCalledTimes(4);
  });

  it('FALHA TOTAL — todos os 4 attempts falham', async () => {
    csMocks.getDocument.mockRejectedValue(new Error('persistent failure'));

    const result = await updateConversationWithMerge('conv-1', [
      { role: 'user', content: 'oi', timestamp: nowIso, message_id: 'msg1' },
    ]);

    expect(result.ok).toBe(false);
    expect(typeof result.erro).toBe('string');
    expect(result.erro.length).toBeGreaterThan(0);
    expect(csMocks.getDocument).toHaveBeenCalledTimes(4);
  });

  it('ARCHIVED — desarquiva ao receber mensagem user', async () => {
    csMocks.getDocument.mockResolvedValue(
      fakeConversationDoc({
        archived: true,
        unread_count: 0,
        messages: [],
      })
    );

    const additions = [{ role: 'user', content: 'oi', timestamp: nowIso, message_id: 'msg1' }];
    const result = await updateConversationWithMerge('conv-1', additions);

    expect(result).toEqual({ ok: true });
    expect(lastUpdatePayload().archived).toBe(false);
  });
});

describe('clearConversationUnread', () => {
  const nowIso = '2025-06-01T12:00:00.000Z';

  beforeEach(() => {
    csMocks.updateDocument.mockResolvedValue({});
  });

  it('doc válido → updateDocument chamado com { unread_count: 0, last_read_at: nowIso } → retorna { ok: true, last_read_at: nowIso }', async () => {
    const result = await clearConversationUnread('conv-1');

    expect(result).toEqual({ ok: true, last_read_at: nowIso });
    expect(csMocks.updateDocument).toHaveBeenCalledWith('db-test', 'col-conversations', 'conv-1', {
      unread_count: 0,
      last_read_at: nowIso,
    });
  });

  it('updateDocument falha na primeira tentativa, passa na segunda (só unread_count) → retorna { ok: true } sem last_read_at', async () => {
    csMocks.updateDocument
      .mockRejectedValueOnce(new Error('full update failed'))
      .mockResolvedValueOnce({});

    const result = await clearConversationUnread('conv-1');

    expect(result).toEqual({ ok: true });
    expect(result.last_read_at).toBeUndefined();
    expect(csMocks.updateDocument).toHaveBeenCalledTimes(2);
    expect(csMocks.updateDocument).toHaveBeenLastCalledWith('db-test', 'col-conversations', 'conv-1', {
      unread_count: 0,
    });
  });

  it('ambas as tentativas falham → retorna { ok: false, erro: <string> }', async () => {
    csMocks.updateDocument.mockRejectedValue(new Error('persistent failure'));

    const result = await clearConversationUnread('conv-1');

    expect(result.ok).toBe(false);
    expect(typeof result.erro).toBe('string');
    expect(result.erro.length).toBeGreaterThan(0);
  });

  it("docId vazio → retorna { ok: false, erro: 'ids inválidos' } sem chamar updateDocument", async () => {
    const result = await clearConversationUnread('');

    expect(result).toEqual({ ok: false, erro: 'ids inválidos' });
    expect(csMocks.updateDocument).not.toHaveBeenCalled();
  });
});

describe('findConversationDoc', () => {
  beforeEach(() => {
    csMocks.listDocuments.mockResolvedValue({ documents: [] });
  });

  it('academyId vazio → retorna null sem chamar listDocuments', async () => {
    const result = await findConversationDoc('5511999887766', '');

    expect(result).toBeNull();
    expect(csMocks.listDocuments).not.toHaveBeenCalled();
  });

  it('phone canônico encontrado na primeira query → retorna o documento', async () => {
    const doc = fakeConversationDoc({ phone_number: '5511999887766' });
    csMocks.listDocuments.mockResolvedValueOnce({ documents: [doc] });

    const result = await findConversationDoc('5511999887766', 'acad-1');

    expect(result).toEqual(doc);
    expect(csMocks.listDocuments).toHaveBeenCalled();
  });

  it('phone canônico não encontrado, variante encontrada → retorna o documento', async () => {
    const doc = fakeConversationDoc({ phone_number: '11999887766' });
    csMocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [doc] });

    const result = await findConversationDoc('5511999887766', 'acad-1');

    expect(result).toEqual(doc);
    expect(csMocks.listDocuments).toHaveBeenCalledTimes(2);
  });

  it('nenhuma variante encontrada, leadId fornecido → tenta query por lead_id, retorna documento', async () => {
    const doc = fakeConversationDoc({ lead_id: 'lead-1' });
    csMocks.listDocuments
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [doc] });

    const result = await findConversationDoc('5511999887766', 'acad-1', { leadId: 'lead-1' });

    expect(result).toEqual(doc);
    expect(csMocks.listDocuments).toHaveBeenCalledTimes(3);
  });

  it('nenhuma variante nem leadId → retorna null', async () => {
    const result = await findConversationDoc('5511999887766', 'acad-1');

    expect(result).toBeNull();
    expect(csMocks.listDocuments).toHaveBeenCalledTimes(2);
  });

  it('conversationId fornecido via opts → busca por $id, retorna documento se phone bate', async () => {
    const doc = fakeConversationDoc({ $id: 'conv-xyz', phone_number: '5511999887766' });
    csMocks.listDocuments.mockResolvedValueOnce({ documents: [doc] });

    const result = await findConversationDoc('5511999887766', 'acad-1', {
      conversationId: 'conv-xyz',
    });

    expect(result).toEqual(doc);
    expect(csMocks.listDocuments).toHaveBeenCalledTimes(1);
  });

  it('conversationId fornecido, phone não bate → retorna null', async () => {
    const doc = fakeConversationDoc({ $id: 'conv-xyz', phone_number: '5511888777666' });
    csMocks.listDocuments.mockResolvedValueOnce({ documents: [doc] });

    const result = await findConversationDoc('5511999887766', 'acad-1', {
      conversationId: 'conv-xyz',
    });

    expect(result).toBeNull();
    expect(csMocks.listDocuments).toHaveBeenCalledTimes(1);
  });
});

describe('getOrCreateConversationDoc', () => {
  const nowIso = '2025-06-01T12:00:00.000Z';

  beforeEach(() => {
    csMocks.listDocuments.mockResolvedValue({ documents: [] });
    csMocks.createDocument.mockResolvedValue(fakeConversationDoc({ $id: 'unique-id' }));
  });

  it('conversa existente encontrada → retorna o documento existente, sem chamar createDocument', async () => {
    const existing = fakeConversationDoc({ $id: 'conv-existing' });
    csMocks.listDocuments.mockResolvedValueOnce({ documents: [existing] });

    const result = await getOrCreateConversationDoc('5511999887766', 'acad-1', {});

    expect(result).toEqual(existing);
    expect(csMocks.createDocument).not.toHaveBeenCalled();
  });

  it('conversa não encontrada → chama createDocument com os campos corretos', async () => {
    const created = fakeConversationDoc({ $id: 'unique-id', phone_number: '5511999887766' });
    csMocks.createDocument.mockResolvedValue(created);

    const result = await getOrCreateConversationDoc('11999887766', 'acad-1', { ownerId: 'owner-1' });

    expect(csMocks.createDocument).toHaveBeenCalledWith(
      'db-test',
      'col-conversations',
      'unique-id',
      {
        phone_number: '5511999887766',
        messages: '[]',
        messages_recent: '[]',
        updated_at: nowIso,
        academy_id: 'acad-1',
        archived: false,
      },
      expect.any(Array)
    );
    expect(result).toEqual(created);
  });

  it('academyId vazio → retorna null sem chamar listDocuments nem createDocument', async () => {
    const result = await getOrCreateConversationDoc('5511999887766', '', {});

    expect(result).toBeNull();
    expect(csMocks.listDocuments).not.toHaveBeenCalled();
    expect(csMocks.createDocument).not.toHaveBeenCalled();
  });
});

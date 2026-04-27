import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapConversationItemsAfterRead,
  mapConversationItemsAfterUnread,
  conversationsArchivedQueryValue,
  describeArchivedListFilter
} from '../lib/inboxConversationState.js';
import { isReceptionAgendaLead, passesReceptionAgendaExclusions } from '../lib/receptionAgenda.js';
import { LEAD_STATUS } from '../lib/leadStatus.js';

describe('inbox — unread / read (estado local)', () => {
  const items = [
    { phone_number: '5511999990001', unread_count: 2 },
    { phone_number: '5511888880002', unread_count: 0 }
  ];

  it('marca conversa como não lida via action unread', () => {
    const next = mapConversationItemsAfterUnread(items, '5511999990001');
    const row = next.find((x) => x.phone_number === '5511999990001');
    expect(row.unread_count).toBe(2);
  });

  it('garante mínimo 1 quando estava zerada', () => {
    const next = mapConversationItemsAfterUnread(items, '5511888880002');
    const row = next.find((x) => x.phone_number === '5511888880002');
    expect(row.unread_count).toBe(1);
  });

  it('action read zera unread_count', () => {
    const next = mapConversationItemsAfterRead(items, '5511999990001');
    const row = next.find((x) => x.phone_number === '5511999990001');
    expect(row.unread_count).toBe(0);
    expect(typeof row.last_read_at).toBe('string');
  });
});

describe('inbox — archived (contrato de query)', () => {
  it('query padrão exclui conversas archived: true', () => {
    expect(conversationsArchivedQueryValue('all')).toBe('0');
  });

  it('filtro arquivadas inclui só archived=1', () => {
    expect(conversationsArchivedQueryValue('archived')).toBe('1');
  });

  it('usa notEqual(archived, true) em vez de equal(archived, false)', () => {
    expect(describeArchivedListFilter(false)).toBe('notEqual:archived:true');
    expect(describeArchivedListFilter(true)).toBe('equal:archived:true');
  });
});

const hoisted = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  deleteDocument: vi.fn()
}));

vi.mock('node-appwrite', () => {
  class MockDatabases {
    listDocuments = hoisted.listDocuments;
    createDocument = hoisted.createDocument;
    deleteDocument = hoisted.deleteDocument;
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
    },
    ID: { unique: () => 'flag-id' },
    Permission: { read: () => 'r', update: () => 'u', delete: () => 'd' },
    Role: { users: () => 'users' }
  };
});

vi.mock('../../lib/server/academyAccess.js', () => ({
  ensureAuth: vi.fn(async () => ({ $id: 'user-1' })),
  ensureAcademyAccess: vi.fn(async () => ({ academyId: 'acad-1' }))
}));

describe('inbox — message flags (API)', () => {
  beforeEach(() => {
    vi.resetModules();
    hoisted.listDocuments.mockReset();
    hoisted.createDocument.mockReset();
    hoisted.deleteDocument.mockReset();
    process.env.APPWRITE_MESSAGE_FLAGS_COLLECTION_ID = 'flags-col';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-flags';
    process.env.APPWRITE_API_KEY = 'key';
    process.env.APPWRITE_PROJECT_ID = 'proj';
  });

  it('salva flag no Appwrite, não no localStorage', async () => {
    hoisted.listDocuments.mockResolvedValueOnce({ documents: [] });
    hoisted.createDocument.mockResolvedValueOnce({
      $id: 'new-flag',
      academy_id: 'acad-1',
      conversation_id: 'conv-1',
      message_id: 'm1',
      type: 'pinned'
    });
    const { default: handler } = await import('../../api/message-flags.js');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      query: { message_id: '' },
      body: {
        academy_id: 'acad-1',
        conversation_id: 'conv-1',
        message_id: 'm1',
        type: 'pinned'
      }
    };
    const res = makeMockRes();
    await handler(req, res);
    expect(hoisted.createDocument).toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
  });

  it('carrega flags ao selecionar conversa', async () => {
    hoisted.listDocuments.mockResolvedValueOnce({
      documents: [
        {
          $id: 'f1',
          academy_id: 'acad-1',
          conversation_id: 'conv-1',
          message_id: 'm1',
          type: 'pinned',
          $createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    });
    const { default: handler } = await import('../../api/message-flags.js');
    const req = {
      method: 'GET',
      headers: { authorization: 'Bearer t' },
      query: { conversation_id: 'conv-1', academy_id: 'acad-1', message_id: '' }
    };
    const res = makeMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const body = res.jsonData;
    expect(body.sucesso).toBe(true);
    expect(Array.isArray(body.flags)).toBe(true);
    expect(body.flags[0].message_id).toBe('m1');
  });

  it('deleta flag ao desafixar', async () => {
    hoisted.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'flag-row-1', message_id: 'm1', type: 'pinned' }]
    });
    hoisted.deleteDocument.mockResolvedValueOnce({});
    const { default: handler } = await import('../../api/message-flags.js');
    const req = {
      method: 'DELETE',
      headers: { authorization: 'Bearer t' },
      query: {
        message_id: 'm1',
        type: 'pinned',
        academy_id: 'acad-1',
        conversation_id: 'conv-1'
      }
    };
    const res = makeMockRes();
    await handler(req, res);
    expect(hoisted.deleteDocument).toHaveBeenCalledWith('db-flags', 'flags-col', 'flag-row-1');
    expect(res.statusCode).toBe(200);
  });
});

function makeMockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(obj) {
      this.jsonData = obj;
      return this;
    }
  };
  return res;
}

describe('inbox — agenda da recepção', () => {
  it('exclui leads com status CONVERTED', () => {
    const lead = {
      status: LEAD_STATUS.CONVERTED,
      pipelineStage: 'Aula experimental',
      contact_type: 'lead'
    };
    expect(passesReceptionAgendaExclusions(lead, LEAD_STATUS.CONVERTED)).toBe(false);
  });

  it('exclui leads com pipelineStage Matriculado', () => {
    const lead = {
      origin: 'WhatsApp',
      status: LEAD_STATUS.SCHEDULED,
      scheduledDate: '2026-04-20',
      pipelineStage: 'Matriculado',
      contact_type: 'lead'
    };
    expect(passesReceptionAgendaExclusions(lead)).toBe(false);
  });

  it('exclui leads com contact_type student', () => {
    const lead = {
      origin: 'WhatsApp',
      status: LEAD_STATUS.SCHEDULED,
      scheduledDate: '2026-04-20',
      pipelineStage: 'Aula experimental',
      contact_type: 'student'
    };
    expect(passesReceptionAgendaExclusions(lead)).toBe(false);
  });

  it('mantém leads com status SCHEDULED e data válida', () => {
    const lead = {
      origin: 'WhatsApp',
      status: LEAD_STATUS.SCHEDULED,
      scheduledDate: '2026-04-20',
      pipelineStage: 'Aula experimental',
      contact_type: 'lead'
    };
    expect(isReceptionAgendaLead(lead, LEAD_STATUS.SCHEDULED, LEAD_STATUS.CONVERTED)).toBe(true);
  });
});

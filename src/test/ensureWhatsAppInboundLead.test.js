import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  addLeadEventServer: vi.fn().mockResolvedValue(null),
}));

vi.mock('node-appwrite', () => ({
  Client: class Client {
    setEndpoint() {
      return this;
    }
    setProject() {
      return this;
    }
    setKey() {
      return this;
    }
  },
  Databases: class Databases {
    listDocuments(...args) {
      return mocks.listDocuments(...args);
    }
    createDocument(...args) {
      return mocks.createDocument(...args);
    }
    updateDocument(...args) {
      return mocks.updateDocument(...args);
    }
  },
  ID: { unique: () => 'lead-new-1' },
  Permission: {
    read: (r) => ({ read: r }),
    update: (r) => ({ update: r }),
    delete: (r) => ({ delete: r }),
  },
  Query: {
    equal: (k, v) => ({ k, v }),
    limit: (n) => ({ limit: n }),
  },
  Role: {
    users: () => 'users',
    user: (id) => `user:${id}`,
    team: (id) => `team:${id}`,
  },
}));

vi.mock('../../lib/server/leadEvents.js', () => ({
  addLeadEventServer: (...args) => mocks.addLeadEventServer(...args),
}));

const testDatabases = {
  listDocuments: (...args) => mocks.listDocuments(...args),
  createDocument: (...args) => mocks.createDocument(...args),
  updateDocument: (...args) => mocks.updateDocument(...args),
};

describe('ensureWhatsAppInboundLead', () => {
  let ensureWhatsAppInboundLead;

  beforeAll(async () => {
    vi.stubEnv('VITE_APPWRITE_DATABASE_ID', 'db-test');
    vi.stubEnv('VITE_APPWRITE_LEADS_COLLECTION_ID', 'leads-col');
    vi.stubEnv('VITE_APPWRITE_STUDENTS_COLLECTION_ID', 'students-col');
    vi.stubEnv('APPWRITE_CONVERSATIONS_COLLECTION_ID', 'conv-col');
    vi.resetModules();
    ({ ensureWhatsAppInboundLead } = await import('../../lib/server/ensureWhatsAppInboundLead.js'));
  });

  beforeEach(() => {
    mocks.listDocuments.mockReset();
    mocks.createDocument.mockReset();
    mocks.updateDocument.mockReset();
    mocks.addLeadEventServer.mockClear();
  });

  it('não cria lead quando telefone pertence a aluno cadastrado', async () => {
    mocks.listDocuments.mockImplementation((_db, col) => {
      if (col === 'students-col') {
        return {
          documents: [{ $id: 'stu-1', phone: '11988887777', academyId: 'acad-1' }],
        };
      }
      return { documents: [] };
    });

    const result = await ensureWhatsAppInboundLead({
      databases: testDatabases,
      academyId: 'acad-1',
      phone: '5511988887777',
      name: 'Maria',
      academyDoc: {},
    });

    expect(result.skippedReason).toBe('registered_student');
    expect(result.created).toBe(false);
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it('cria lead para telefone desconhecido e vincula conversa', async () => {
    mocks.listDocuments.mockResolvedValue({ documents: [] });
    mocks.createDocument.mockResolvedValue({
      $id: 'lead-new-1',
      $createdAt: '2026-06-03T12:00:00.000Z',
    });

    const result = await ensureWhatsAppInboundLead({
      databases: testDatabases,
      academyId: 'acad-1',
      phone: '11977776666',
      name: 'João',
      academyDoc: { teamId: 'team-1' },
      conversationDocId: 'conv-1',
    });

    expect(result.created).toBe(true);
    expect(result.leadDoc?.$id).toBe('lead-new-1');
    expect(mocks.createDocument).toHaveBeenCalled();
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'db-test',
      'conv-col',
      'conv-1',
      expect.objectContaining({ lead_id: 'lead-new-1' })
    );
    expect(mocks.addLeadEventServer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'lead_criado', leadId: 'lead-new-1' })
    );
  });

  it('não cria lead quando academia sem teamId', async () => {
    mocks.listDocuments.mockResolvedValue({ documents: [] });

    const result = await ensureWhatsAppInboundLead({
      databases: testDatabases,
      academyId: 'acad-1',
      phone: '11977776666',
      name: 'João',
      academyDoc: { ownerId: 'owner-1' },
    });

    expect(result.created).toBe(false);
    expect(result.skippedReason).toBe('create_failed');
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });
});

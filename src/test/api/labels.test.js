import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn()
}));

vi.mock('node-appwrite', () => {
  class MockDatabases {
    listDocuments = hoisted.listDocuments;
    createDocument = hoisted.createDocument;
    getDocument = hoisted.getDocument;
    updateDocument = hoisted.updateDocument;
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
      limit: (n) => ({ type: 'limit', n }),
      offset: (n) => ({ type: 'offset', n })
    },
    ID: { unique: () => 'new-label-id' },
    Permission: { read: () => 'r', update: () => 'u', delete: () => 'd' },
    Role: { users: () => 'users' }
  };
});

vi.mock('../../../lib/server/academyAccess.js', () => ({
  ensureAuth: vi.fn(async () => ({ $id: 'user-1' })),
  ensureAcademyAccess: vi.fn(async () => ({ academyId: 'acad-1' }))
}));

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    }
  };
}

describe('GET /api/labels', () => {
  beforeEach(async () => {
    vi.resetModules();
    hoisted.listDocuments.mockReset();
    process.env.VITE_APPWRITE_LABELS_COLLECTION_ID = 'labels-col';
    process.env.VITE_APPWRITE_LEADS_COLLECTION_ID = 'leads-col';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-x';
    process.env.APPWRITE_API_KEY = 'k';
    process.env.APPWRITE_PROJECT_ID = 'p';
  });

  it('retorna etiquetas da academia', async () => {
    hoisted.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'l2', name: 'Beta', color: '#112233', academy_id: 'acad-1' },
        { $id: 'l1', name: 'Alpha', color: '#aabbcc', academy_id: 'acad-1' }
      ]
    });
    const { default: handler } = await import('../../../api/labels.js');
    const req = { method: 'GET', headers: { authorization: 'Bearer t' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.sucesso).toBe(true);
    expect(res.body.labels[0].name).toBe('Alpha');
    expect(res.body.labels[1].name).toBe('Beta');
    const qArg = hoisted.listDocuments.mock.calls[0][2];
    expect(qArg.some((q) => q.type === 'equal' && q.a === 'academy_id')).toBe(true);
  });

  it('não retorna etiquetas de outra academia (query restrita)', async () => {
    hoisted.listDocuments.mockResolvedValueOnce({ documents: [] });
    const { default: handler } = await import('../../../api/labels.js');
    const req = { method: 'GET', headers: { authorization: 'Bearer t' } };
    const res = mockRes();
    await handler(req, res);
    const qArg = hoisted.listDocuments.mock.calls[0][2];
    const academyClause = qArg.find((q) => q.type === 'equal' && q.a === 'academy_id');
    expect(academyClause.b).toEqual(['acad-1']);
  });
});

describe('POST /api/labels', () => {
  beforeEach(async () => {
    vi.resetModules();
    hoisted.createDocument.mockReset();
    process.env.VITE_APPWRITE_LABELS_COLLECTION_ID = 'labels-col';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-x';
    process.env.APPWRITE_API_KEY = 'k';
    process.env.APPWRITE_PROJECT_ID = 'p';
  });

  it('cria etiqueta com nome e cor válidos', async () => {
    hoisted.createDocument.mockResolvedValueOnce({
      $id: 'new-id',
      name: 'VIP',
      color: '#00FFAA',
      academy_id: 'acad-1'
    });
    const { default: handler } = await import('../../../api/labels.js');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: { name: 'VIP', color: '#00FFAA' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(hoisted.createDocument).toHaveBeenCalled();
    expect(res.body.label.name).toBe('VIP');
  });

  it('retorna 400 para nome vazio', async () => {
    const { default: handler } = await import('../../../api/labels.js');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: { name: ' ', color: '#00FFAA' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('retorna 400 para cor inválida', async () => {
    const { default: handler } = await import('../../../api/labels.js');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: { name: 'X', color: 'red' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/labels/:id', () => {
  beforeEach(async () => {
    vi.resetModules();
    hoisted.getDocument.mockReset();
    hoisted.deleteDocument.mockReset();
    hoisted.listDocuments.mockReset();
    hoisted.updateDocument.mockReset();
    process.env.VITE_APPWRITE_LABELS_COLLECTION_ID = 'labels-col';
    process.env.VITE_APPWRITE_LEADS_COLLECTION_ID = 'leads-col';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-x';
    process.env.APPWRITE_API_KEY = 'k';
    process.env.APPWRITE_PROJECT_ID = 'p';
  });

  it('deleta etiqueta existente', async () => {
    hoisted.getDocument.mockResolvedValueOnce({ $id: 'lab-1', academy_id: 'acad-1', name: 'X', color: '#000000' });
    hoisted.listDocuments.mockResolvedValueOnce({ documents: [] });
    hoisted.deleteDocument.mockResolvedValueOnce({});
    const { default: handler } = await import('../../../api/labels.js');
    const req = {
      method: 'DELETE',
      headers: { authorization: 'Bearer t' },
      query: { id: 'lab-1' },
      url: '/api/labels/lab-1'
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(hoisted.deleteDocument).toHaveBeenCalledWith('db-x', 'labels-col', 'lab-1');
  });

  it('retorna 404 para etiqueta inexistente', async () => {
    hoisted.getDocument.mockRejectedValueOnce({ code: '404', type: 'document_not_found' });
    const { default: handler } = await import('../../../api/labels.js');
    const req = {
      method: 'DELETE',
      headers: { authorization: 'Bearer t' },
      query: { id: 'missing' },
      url: '/api/labels/missing'
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('remove label_id dos leads da academia', async () => {
    hoisted.getDocument.mockResolvedValueOnce({ $id: 'lab-1', academy_id: 'acad-1' });
    hoisted.listDocuments.mockResolvedValueOnce({
      documents: [
        {
          $id: 'lead-1',
          academyId: 'acad-1',
          label_ids: ['lab-1', 'other']
        }
      ]
    });
    hoisted.deleteDocument.mockResolvedValueOnce({});
    const { default: handler } = await import('../../../api/labels.js');
    const req = {
      method: 'DELETE',
      headers: { authorization: 'Bearer t' },
      query: { id: 'lab-1' },
      url: '/api/labels/lab-1'
    };
    const res = mockRes();
    await handler(req, res);
    expect(hoisted.updateDocument).toHaveBeenCalledWith('db-x', 'leads-col', 'lead-1', {
      label_ids: ['other']
    });
    expect(res.statusCode).toBe(200);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from './helpers/httpMock.js';

const instMocks = vi.hoisted(() => ({
  updateDocument: vi.fn().mockResolvedValue({}),
  listDocuments: vi.fn(),
  getDocument: vi.fn()
}));

vi.mock('../../lib/server/academyAccess.js', () => ({
  ensureAuth: vi.fn(async () => ({ $id: 'user-1' })),
  ensureAcademyAccess: vi.fn(async () => ({
    academyId: 'acad-1',
    doc: { $id: 'acad-1', zapster_instance_id: 'inst-1', status: 'active' }
  }))
}));

vi.mock('../../lib/server/billingGate.js', () => ({
  assertBillingActive: vi.fn(async () => {}),
  sendBillingGateError: vi.fn(() => false)
}));

vi.mock('node-appwrite', () => {
  class MockDatabases {
    updateDocument = instMocks.updateDocument;
    listDocuments = instMocks.listDocuments;
    getDocument = instMocks.getDocument;
  }
  class MockTeams {}
  return {
    Client: vi.fn(function MockClient() {
      this.setEndpoint = () => this;
      this.setProject = () => this;
      this.setKey = () => this;
      return this;
    }),
    Databases: MockDatabases,
    Teams: MockTeams,
    Account: vi.fn(),
    Query: {
      equal: (a, b) => ({ type: 'equal', a, b }),
      limit: (n) => ({ type: 'limit', n })
    }
  };
});

function timeoutFetchMock() {
  return vi.fn(() =>
    Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }))
  );
}

describe('zapsterInstances — timeouts Zapster', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', timeoutFetchMock());
    process.env.ZAPSTER_API_TOKEN = 'zap-token';
    process.env.APPWRITE_API_KEY = 'key';
    process.env.APPWRITE_PROJECT_ID = 'proj';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db-1';
    process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID = 'acad-col';
    instMocks.updateDocument.mockReset();
    instMocks.updateDocument.mockResolvedValue({});
    instMocks.listDocuments.mockResolvedValue({ documents: [] });
    instMocks.getDocument.mockResolvedValue({
      $id: 'acad-1',
      zapster_instance_id: 'inst-1',
      status: 'active'
    });
  });

  it('POST criar instância rejeita com zapster_timeout', async () => {
    const { default: handler } = await import('../../lib/server/zapsterInstances.js');
    const { res, state } = createMockRes();
    const req = createMockReq({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer t',
        'x-academy-id': 'acad-1'
      },
      body: { host: 'app.example.com' }
    });
    await handler(req, res);
    expect(state.statusCode).toBe(500);
    expect(state.body?.codigo).toBe('zapster_timeout');
    expect(String(state.body?.erro || '')).toMatch(/Zapster não respondeu/i);
  });

  it('GET action=get rejeita com zapster_timeout', async () => {
    const { default: handler } = await import('../../lib/server/zapsterInstances.js');
    const { res, state } = createMockRes();
    const req = createMockReq({
      method: 'GET',
      query: { action: 'get', id: 'inst-1' },
      headers: { authorization: 'Bearer t', 'x-academy-id': 'acad-1' }
    });
    await handler(req, res);
    expect(state.statusCode).toBe(500);
    expect(String(state.body?.erro || '')).toMatch(/demorou para responder/i);
  });

  it('GET action=qrcode rejeita com zapster_timeout', async () => {
    const { default: handler } = await import('../../lib/server/zapsterInstances.js');
    const { res, state } = createMockRes();
    const req = createMockReq({
      method: 'GET',
      query: { action: 'qrcode', id: 'inst-1' },
      headers: { authorization: 'Bearer t', 'x-academy-id': 'acad-1' }
    });
    await handler(req, res);
    expect(state.statusCode).toBe(500);
    expect(state.body?.codigo).toBe('zapster_timeout');
  });

  it('POST register-webhooks rejeita com zapster_timeout', async () => {
    const { default: handler } = await import('../../lib/server/zapsterInstances.js');
    const { res, state } = createMockRes();
    const req = createMockReq({
      method: 'POST',
      query: { action: 'register-webhooks' },
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer t',
        'x-academy-id': 'acad-1',
        host: 'app.example.com'
      },
      body: { instanceId: 'inst-1', host: 'app.example.com' }
    });
    await handler(req, res);
    expect(state.statusCode).toBe(502);
    expect(String(state.body?.erro || '')).toMatch(/Zapster não respondeu|zapster_timeout/i);
  });
});

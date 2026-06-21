import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Client: class {
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
  Databases: class {
    createDocument(...args) {
      return mocks.createDocument(...args);
    }
  },
  ID: {
    unique: () => 'usage-log-id',
  },
}));

describe('agentRespondMetrics.logTokenUsage', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.APPWRITE_ENDPOINT = 'https://example.appwrite.io/v1';
    process.env.APPWRITE_PROJECT_ID = 'proj';
    process.env.APPWRITE_API_KEY = 'key';
    process.env.APPWRITE_DATABASE_ID = 'db';
    process.env.VITE_APPWRITE_DATABASE_ID = 'db';
    process.env.APPWRITE_AI_USAGE_LOGS_COLLECTION_ID = 'ai_usage_logs';
    mocks.createDocument.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('persists token usage fire-and-forget', async () => {
    const { logTokenUsage } = await import('./agentRespondMetrics.js');

    logTokenUsage({
      route: 'followup_copilot',
      model: 'claude-sonnet-4-20250514',
      input_tokens: 120,
      output_tokens: 35,
      academy_id: 'acad_1',
    });

    await Promise.resolve();

    expect(mocks.createDocument).toHaveBeenCalledWith(
      'db',
      'ai_usage_logs',
      'usage-log-id',
      expect.objectContaining({
        route: 'followup_copilot',
        model: 'claude-sonnet-4-20250514',
        input_tokens: 120,
        output_tokens: 35,
        academy_id: 'acad_1',
      })
    );
  });
});

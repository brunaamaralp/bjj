import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('resolveUserDisplayName', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.APPWRITE_API_KEY;
    delete process.env.APPWRITE_PROJECT_ID;
  });

  it('returns labels for known system ids', async () => {
    const { resolveUserDisplayName } = await import('../../lib/server/resolveUserDisplayName.js');
    expect(await resolveUserDisplayName('ai-agent')).toBe('Assistente IA');
    expect(await resolveUserDisplayName('system')).toBe('Sistema');
    expect(await resolveUserDisplayName('')).toBe('');
  });
});

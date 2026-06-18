import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callClaudeUserMessage } from './claudeClient.js';

describe('claudeClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns text from successful response', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [{ type: 'text', text: '{"summary":"Olá"}' }],
        }),
    });

    const out = await callClaudeUserMessage({
      apiKey: 'test-key',
      system: 'sys',
      userContent: 'ctx',
      timeoutMs: 5000,
    });
    expect(out).toBe('{"summary":"Olá"}');
  });

  it('throws ai_not_configured without api key', async () => {
    await expect(
      callClaudeUserMessage({ apiKey: '', system: 's', userContent: 'u' })
    ).rejects.toThrow('ai_not_configured');
  });

  it('throws anthropic error message on HTTP failure', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'model_not_found' } }),
    });

    await expect(
      callClaudeUserMessage({
        apiKey: 'test-key',
        system: 'sys',
        userContent: 'ctx',
        timeoutMs: 5000,
      })
    ).rejects.toThrow('model_not_found');
  });
});

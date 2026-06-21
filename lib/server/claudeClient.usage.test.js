import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const usageMocks = vi.hoisted(() => ({
  logTokenUsage: vi.fn(),
}));

vi.mock('./agentRespondMetrics.js', async () => {
  const actual = await vi.importActual('./agentRespondMetrics.js');
  return {
    ...actual,
    logTokenUsage: (...args) => usageMocks.logTokenUsage(...args),
  };
});

describe('claudeClient token usage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs input and output tokens after successful response', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 321, output_tokens: 45 },
        }),
    });

    const { callClaudeUserMessage } = await import('./claudeClient.js');
    await callClaudeUserMessage({
      apiKey: 'test-key',
      system: 'sys',
      userContent: 'ctx',
      timeoutMs: 5000,
      route: 'followup_copilot',
      academy_id: 'acad_1',
      model: 'claude-sonnet-4-20250514',
    });

    expect(usageMocks.logTokenUsage).toHaveBeenCalledWith({
      route: 'followup_copilot',
      model: 'claude-sonnet-4-20250514',
      input_tokens: 321,
      output_tokens: 45,
      academy_id: 'acad_1',
    });
  });
});

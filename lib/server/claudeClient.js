/**
 * Cliente HTTP Anthropic compartilhado (timeout + retry).
 * Copilot / painel usam timeout maior que o webhook do agente.
 */
import {
  CLAUDE_MAX_RETRIES,
  CLAUDE_RETRY_DELAY_MS,
  CLAUDE_RETRYABLE_HTTP_STATUS,
  CLAUDE_TEST_TIMEOUT_MS,
} from '../constants.js';
import { logTokenUsage } from './agentRespondMetrics.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

function extractAnthropicError(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const data = JSON.parse(text);
    const err = data?.error;
    if (err && typeof err === 'object') {
      return String(err.message || err.type || '').trim();
    }
  } catch {
    void 0;
  }
  return text.slice(0, 300);
}

/**
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.system
 * @param {string} params.userContent
 * @param {number} [params.maxTokens]
 * @param {number} [params.temperature]
 * @param {number} [params.timeoutMs]
 * @param {string} [params.model]
 * @param {string} [params.route]
 * @param {string} [params.academy_id]
 */
export async function callClaudeUserMessage(
  {
    apiKey,
    system,
    userContent,
    maxTokens = 700,
    temperature = 0.1,
    timeoutMs = CLAUDE_TEST_TIMEOUT_MS,
    model = DEFAULT_MODEL,
    route = 'other',
    academy_id = '',
  },
  attempt = 0
) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('ai_not_configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: String(system || ''),
        messages: [{ role: 'user', content: String(userContent || '') }],
      }),
      signal: controller.signal,
    });

    const raw = await resp.text();
    clearTimeout(timeoutId);

    if (!resp.ok) {
      if (CLAUDE_RETRYABLE_HTTP_STATUS.includes(resp.status) && attempt < CLAUDE_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, CLAUDE_RETRY_DELAY_MS * 2 ** attempt));
        return callClaudeUserMessage(
          { apiKey: key, system, userContent, maxTokens, temperature, timeoutMs, model, route, academy_id },
          attempt + 1
        );
      }
      const msg = extractAnthropicError(raw) || `anthropic_http_${resp.status}`;
      throw new Error(msg);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('anthropic_invalid_json');
    }

    logTokenUsage({
      route,
      model,
      input_tokens: data?.usage?.input_tokens,
      output_tokens: data?.usage?.output_tokens,
      academy_id,
    });

    return (Array.isArray(data?.content) ? data.content : [])
      .filter((p) => p?.type === 'text')
      .map((p) => String(p.text || ''))
      .join('\n')
      .trim();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      if (attempt < CLAUDE_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, CLAUDE_RETRY_DELAY_MS * 2 ** attempt));
        return callClaudeUserMessage(
          { apiKey: key, system, userContent, maxTokens, temperature, timeoutMs, model, route, academy_id },
          attempt + 1
        );
      }
      throw new Error('claude_timeout');
    }
    throw e;
  }
}

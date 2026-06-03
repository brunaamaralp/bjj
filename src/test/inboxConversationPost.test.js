import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/billingBlockedFetch', () => ({
  fetchWithBillingGuard: vi.fn(),
}));

vi.mock('../lib/inboxApiUtils.js', () => ({
  getInboxJwt: vi.fn(async () => 'token'),
  normalizeInboxApiError: (_raw, fb) => fb,
  safeParseInboxJson: (raw) => JSON.parse(raw),
}));

import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { postInboxConversation } from '../lib/inboxConversationPost.js';

describe('postInboxConversation', () => {
  beforeEach(() => {
    vi.mocked(fetchWithBillingGuard).mockReset();
  });

  it('POSTs action body and returns parsed data', async () => {
    vi.mocked(fetchWithBillingGuard).mockResolvedValue({
      blocked: false,
      res: {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ticket_status: 'open' }),
      },
    });

    const result = await postInboxConversation({
      phone: '5511999999999',
      academyId: 'ac1',
      body: { action: 'read' },
    });

    expect(result.ok).toBe(true);
    expect(result.data.ticket_status).toBe('open');
    expect(fetchWithBillingGuard).toHaveBeenCalledWith(
      '/api/conversations/5511999999999',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

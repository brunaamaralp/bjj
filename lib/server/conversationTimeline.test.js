import { describe, it, expect, vi } from 'vitest';

describe('recordConversationHighlight', () => {
  it('skips when disabled', async () => {
    const { recordConversationHighlight } = await import('./conversationTimeline.js');
    const add = vi.fn();
    const out = await recordConversationHighlight({
      enabled: false,
      highlight: { text: 'x', confidence: 'high' },
      academyId: 'a1',
      leadId: 'l1',
      messageId: 'm1',
      addLeadEvent: add,
    });
    expect(out.recorded).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it('records high confidence highlight', async () => {
    const { recordConversationHighlight } = await import('./conversationTimeline.js');
    const add = vi.fn().mockResolvedValue({ $id: 'e1' });
    const out = await recordConversationHighlight({
      enabled: true,
      highlight: {
        text: 'Interesse em experimental',
        confidence: 'high',
        categories: ['interest'],
      },
      academyId: 'a1',
      leadId: 'l1',
      messageId: 'm1',
      conversationId: 'c1',
      addLeadEvent: add,
      listEvents: async () => [],
    });
    expect(out.recorded).toBe(true);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversation_highlight', text: 'Interesse em experimental' })
    );
  });

  it('skips duplicate message_id', async () => {
    const { recordConversationHighlight } = await import('./conversationTimeline.js');
    const add = vi.fn();
    const out = await recordConversationHighlight({
      enabled: true,
      highlight: { text: 'x', confidence: 'high' },
      academyId: 'a1',
      leadId: 'l1',
      messageId: 'm1',
      addLeadEvent: add,
      listEvents: async () => [
        {
          type: 'conversation_highlight',
          payload_json: JSON.stringify({ message_id: 'm1' }),
        },
      ],
    });
    expect(out.recorded).toBe(false);
    expect(out.reason).toBe('idempotent');
    expect(add).not.toHaveBeenCalled();
  });
});
